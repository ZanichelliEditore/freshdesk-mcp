import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { HttpClient, type HttpResult } from "../../src/client/http.js";
import { RateLimiter } from "../../src/client/rate-limit.js";
import { ConfigError } from "../../src/config.js";
import { type MockAgent, mockDispatcher } from "../support/mock-dispatcher.js";

const API_KEY = "k3y-Secret-Value-123";
const DOMAIN = "acme.freshdesk.com";
const ORIGIN = `https://${DOMAIN}`;
const JSON_TYPE = { "content-type": "application/json" };
const limits = { reserve_pct: 20, floor_pct: 5, pacing_rps: 2 };

let mock: MockAgent;
let stderr: MockInstance<typeof process.stderr.write>;

beforeEach(() => {
  mock = mockDispatcher();
  stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await mock.close();
});

function client(options: { domain?: string; hostOverride?: string } = {}): HttpClient {
  return new HttpClient({
    domain: options.domain ?? DOMAIN,
    apiKey: API_KEY,
    ...(options.hostOverride === undefined ? {} : { hostOverride: options.hostOverride }),
    dispatcher: mock,
    limiter: new RateLimiter(limits),
  });
}

/** Queue one reply for `method path` on `origin`. */
function reply(
  method: string,
  path: string,
  status: number,
  body: object | string = "",
  headers: Record<string, string> = JSON_TYPE,
  origin = ORIGIN,
): void {
  mock.get(origin).intercept({ path, method }).reply(status, body, { headers });
}

/** Every request the dispatcher was handed, intercepted or not. */
function sent() {
  return mock.getCallHistory()!.calls();
}

function sentHeaders(index = 0): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(sent()[index]!.headers ?? {})) {
    out[name.toLowerCase()] = String(value);
  }
  return out;
}

function failure(result: HttpResult) {
  if (result.ok) throw new Error("expected an error");
  return result.error;
}

function logLines(): string[] {
  return stderr.mock.calls.map((call) => String(call[0]));
}

describe("HttpClient: what goes out", () => {
  it("sends Basic auth, the UA and Accept to the configured host over https", async () => {
    reply("GET", "/api/v2/tickets/42", 200, { id: 42 });

    const result = await client().request({ path: "/tickets/{id}", params: { id: 42 } });

    expect(result).toMatchObject({ ok: true, status: 200, body: { id: 42 } });
    expect(sent()).toHaveLength(1);
    expect(sent()[0]!.fullUrl).toBe(`${ORIGIN}/api/v2/tickets/42`);
    expect(sentHeaders()).toMatchObject({
      authorization: `Basic ${Buffer.from(`${API_KEY}:X`).toString("base64")}`,
      "user-agent": "freshdesk-mcp",
      accept: "application/json",
    });
  });

  it("percent-encodes path parameters and appends the query", async () => {
    reply("GET", "/api/v2/contacts/a%2Fb%3Fc?page=2&email=x%40y.example", 200, {});

    const result = await client().request({
      path: "/contacts/{id}",
      params: { id: "a/b?c" },
      query: { page: 2, email: "x@y.example" },
    });

    expect(result.ok).toBe(true);
  });

  it.each(["", ".", ".."])("refuses the path parameter %j, sending nothing", async (id) => {
    const result = await client().request({
      method: "DELETE",
      path: "/tickets/{id}",
      params: { id },
    });

    expect(failure(result)).toMatchObject({
      code: "validation",
      http_status: null,
      retryable: false,
    });
    expect(sent()).toHaveLength(0);
    expect(logLines()).toEqual([]);
  });

  it("throws on a path with a parameter left unfilled, sending nothing", async () => {
    await expect(client().request({ path: "/tickets/{id}" })).rejects.toThrow(TypeError);
    expect(sent()).toHaveLength(0);
  });

  it.each([
    "/tickets/42?include=requester",
    "/contacts/x@y.example",
    "/tickets\n/1",
    "tickets",
    "/tickets/",
    "//evil.example/x",
    `https://${DOMAIN}/api/v2/tickets`,
    "",
  ])("throws on the path %j, which is not a template, and logs nothing", async (path) => {
    await expect(client().request({ path })).rejects.toThrow(TypeError);
    await expect(client().request({ path, url: `${ORIGIN}/api/v2/tickets` })).rejects.toThrow(
      TypeError,
    );
    expect(sent()).toHaveLength(0);
    expect(logLines()).toEqual([]);
  });

  it("throws on a body that is not JSON, before taking a token or logging", async () => {
    const http = client();
    reply("GET", "/api/v2/tickets", 200, [], {
      ...JSON_TYPE,
      "x-ratelimit-total": "100",
      "x-ratelimit-remaining": "5",
    });
    await http.request({ path: "/tickets" });
    stderr.mockClear();

    // The budget sits on the floor: one token spent and the next call is refused.
    await expect(
      http.request({ method: "POST", path: "/tickets", body: { id: 1n } }),
    ).rejects.toThrow(TypeError);
    expect(logLines()).toEqual([]);
    reply("GET", "/api/v2/tickets", 200, []);
    expect((await http.request({ path: "/tickets" })).ok).toBe(true);
  });

  it("sends a body as JSON", async () => {
    reply("POST", "/api/v2/tickets", 201, { id: 7 });

    const result = await client().request({
      method: "POST",
      path: "/tickets",
      body: { subject: "Printer on fire" },
    });

    expect(result).toMatchObject({ ok: true, status: 201, body: { id: 7 } });
    expect(sentHeaders()["content-type"]).toBe("application/json");
    expect(sent()[0]!.body).toBe('{"subject":"Printer on fire"}');
  });

  it("sends no content-type without a body", async () => {
    reply("GET", "/api/v2/tickets", 200, []);
    await client().request({ path: "/tickets" });
    expect(sentHeaders()).not.toHaveProperty("content-type");
  });
});

describe("HttpClient: host check on every URL", () => {
  it("follows an absolute URL to the configured host", async () => {
    reply("GET", "/api/v2/tickets?page=2", 200, []);

    const result = await client().request({
      path: "/tickets",
      url: `${ORIGIN}/api/v2/tickets?page=2`,
    });

    expect(result.ok).toBe(true);
    expect(sent()).toHaveLength(1);
  });

  it.each([
    ["a foreign host", "https://evil.example/api/v2/tickets"],
    ["http", `http://${DOMAIN}/api/v2/tickets`],
    ["a non-default port", `https://${DOMAIN}:8443/api/v2/tickets`],
    ["the host as a prefix of another", `https://${DOMAIN}.evil.example/api/v2/tickets`],
    ["the host as userinfo", `https://${DOMAIN}@evil.example/api/v2/tickets`],
    ["a user name in the URL", `https://user@${DOMAIN}/api/v2/tickets`],
    ["a password in the URL", `https://:pw@${DOMAIN}/api/v2/tickets`],
    ["another Freshdesk account", "https://other.freshdesk.com/api/v2/tickets"],
    ["no URL at all", "not a url"],
  ])("refuses %s with no request sent", async (_name, url) => {
    const error = failure(await client().request({ path: "/tickets", url }));

    expect(error).toMatchObject({ code: "validation", http_status: null, retryable: false });
    expect(error.message).not.toContain("evil");
    expect(sent()).toHaveLength(0);
    expect(logLines()).toEqual([]);
  });

  it.each([
    "x@evil.example",
    "evil.example",
    `${DOMAIN}.evil.example`,
    `${DOMAIN}:8443`,
    `${DOMAIN}/x`,
    `https://${DOMAIN}`,
    "ACME.freshdesk.com",
    "a.b.freshdesk.com",
    ".freshdesk.com",
    "freshdesk.com",
    `${DOMAIN}\n`,
    "",
  ])("fails at construction for the domain %j", (domain) => {
    expect(() => client({ domain })).toThrow(ConfigError);
  });

  it("names the variable, not the API key, when construction fails", () => {
    expect(() => client({ domain: "evil.example" })).toThrow(/FRESHDESK_DOMAIN/);
    try {
      client({ domain: API_KEY });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain(API_KEY);
    }
  });

  it("with an override, sends to exactly that hostname", async () => {
    reply("GET", "/api/v2/tickets", 200, [], JSON_TYPE, "https://support.example.com");
    const overridden = client({
      domain: "support.example.com",
      hostOverride: "support.example.com",
    });

    expect((await overridden.request({ path: "/tickets" })).ok).toBe(true);
    expect(sent()[0]!.fullUrl).toBe("https://support.example.com/api/v2/tickets");
  });

  it("an override the domain does not use admits no second host", async () => {
    const http = client({ hostOverride: "support.example.com" });

    const result = await http.request({
      path: "/tickets",
      url: "https://support.example.com/api/v2/tickets",
    });

    expect(failure(result).code).toBe("validation");
    expect(sent()).toHaveLength(0);
  });

  it("with an override, still refuses every other host", async () => {
    const overridden = client({
      domain: "support.example.com",
      hostOverride: "support.example.com",
    });

    for (const url of [
      "https://evil.example/api/v2/tickets",
      "https://sub.support.example.com/api/v2/tickets",
      `${ORIGIN}/api/v2/tickets`,
    ]) {
      expect(failure(await overridden.request({ path: "/tickets", url })).code).toBe("validation");
    }
    expect(sent()).toHaveLength(0);
  });

  it.each(["other.example.com", "sub.support.example.com", "support.example.com.evil.example"])(
    "an override does not admit the domain %j",
    (domain) => {
      expect(() => client({ domain, hostOverride: "support.example.com" })).toThrow(ConfigError);
    },
  );
});

describe("HttpClient: what comes back", () => {
  it.each([
    ["an allowed host", `${ORIGIN}/api/v2/elsewhere`],
    ["a foreign host", "https://evil.example/"],
  ])("does not follow a 302 to %s", async (_name, location) => {
    reply("GET", "/api/v2/tickets/1", 302, "", { location });

    const result = await client().request({ path: "/tickets/{id}", params: { id: 1 } });

    expect(failure(result)).toMatchObject({ code: "server", http_status: 302, retryable: false });
    expect(sent()).toHaveLength(1);
  });

  it.each([
    [401, "auth", false],
    [403, "forbidden", false],
    [404, "not_found", false],
    [400, "validation", false],
    [405, "validation", false],
    [409, "validation", false],
    [500, "server", true],
    [503, "server", true],
  ])("maps HTTP %i to %s", async (status, code, retryable) => {
    reply("GET", "/api/v2/tickets/1", status, { message: "x" });

    const result = await client().request({ path: "/tickets/{id}", params: { id: 1 } });

    expect(failure(result)).toMatchObject({ code, http_status: status, retryable });
  });

  it("passes Freshdesk's errors[] through on a 400", async () => {
    reply("POST", "/api/v2/tickets", 400, {
      description: "Validation failed",
      errors: [{ field: "email", message: "It should be a valid email", code: "invalid_value" }],
    });

    const result = await client().request({ method: "POST", path: "/tickets", body: {} });

    expect(failure(result).errors).toEqual([
      { field: "email", message: "It should be a valid email", code: "invalid_value" },
    ]);
  });

  it("maps a 429 to rate_limited with its Retry-After", async () => {
    reply("GET", "/api/v2/tickets", 429, "", { "retry-after": "30" });

    const result = await client().request({ path: "/tickets" });

    expect(failure(result)).toMatchObject({
      code: "rate_limited",
      http_status: 429,
      retryable: true,
      retry_after_s: 30,
    });
  });

  it("maps a connection failure to network", async () => {
    mock
      .get(ORIGIN)
      .intercept({ path: "/api/v2/tickets", method: "GET" })
      .replyWithError(Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }));

    const result = await client().request({ path: "/tickets" });

    expect(failure(result)).toMatchObject({ code: "network", http_status: null, retryable: true });
  });

  it("returns no body for a 204", async () => {
    reply("DELETE", "/api/v2/tickets/1", 204, "", {});

    const result = await client().request({
      method: "DELETE",
      path: "/tickets/{id}",
      params: { id: 1 },
    });

    expect(result).toMatchObject({ ok: true, status: 204 });
    expect(result.ok && result.body).toBeUndefined();
  });

  it.each([
    [502, "server", true],
    [404, "not_found", false],
  ])("maps HTTP %i by its status when the body is not JSON", async (status, code, retryable) => {
    reply("GET", "/api/v2/tickets", status, "<html>Bad gateway</html>", {
      "content-type": "text/html",
    });

    const error = failure(await client().request({ path: "/tickets" }));

    expect(error).toMatchObject({ code, http_status: status, retryable });
  });

  it("refuses a 200 whose body is not JSON", async () => {
    reply("GET", "/api/v2/tickets", 200, "<html>Maintenance</html>", {
      "content-type": "text/html",
    });

    const error = failure(await client().request({ path: "/tickets" }));

    expect(error).toMatchObject({ code: "server", http_status: 200, retryable: false });
    expect(error.message).not.toContain("Maintenance");
  });

  it("returns the response headers", async () => {
    reply("GET", "/api/v2/tickets", 200, [], { ...JSON_TYPE, link: "<x>; rel=next" });

    const result = await client().request({ path: "/tickets" });

    expect(result.ok && result.headers.get("link")).toBe("<x>; rel=next");
  });
});

describe("HttpClient: rate limiter", () => {
  const budget = (remaining: number) => ({
    ...JSON_TYPE,
    "x-ratelimit-total": "100",
    "x-ratelimit-remaining": String(remaining),
  });

  it("feeds the response headers to the limiter, which then refuses before sending", async () => {
    reply("GET", "/api/v2/tickets", 200, [], budget(10));
    const http = client();

    expect((await http.request({ path: "/tickets", cost: "expensive" })).ok).toBe(true);
    const second = await http.request({ path: "/tickets", cost: "expensive" });

    expect(failure(second)).toMatchObject({ code: "rate_limited", http_status: null });
    expect(sent()).toHaveLength(1);
  });

  it("feeds the headers of an error response too", async () => {
    reply("GET", "/api/v2/tickets/1", 404, {}, budget(10));
    const http = client();

    await http.request({ path: "/tickets/{id}", params: { id: 1 } });

    expect(failure(await http.request({ path: "/tickets", cost: "expensive" })).code).toBe(
      "rate_limited",
    );
    expect(sent()).toHaveLength(1);
  });

  it("treats a call as cheap unless told otherwise", async () => {
    reply("GET", "/api/v2/tickets", 200, [], budget(10));
    reply("GET", "/api/v2/tickets", 200, [], budget(9));
    const http = client();

    await http.request({ path: "/tickets" });

    expect((await http.request({ path: "/tickets" })).ok).toBe(true);
  });

  it("after a 429 sends nothing more", async () => {
    reply("GET", "/api/v2/tickets", 429, "", { "retry-after": "60" });
    const http = client();

    await http.request({ path: "/tickets" });
    const second = await http.request({ path: "/tickets" });

    expect(failure(second)).toMatchObject({ code: "rate_limited", http_status: null });
    expect(sent()).toHaveLength(1);
  });
});

describe("HttpClient: stderr", () => {
  it("logs method, path template, status and duration, one line per request", async () => {
    reply("GET", "/api/v2/tickets/42?include=requester", 200, { id: 42 });

    await client().request({
      path: "/tickets/{id}",
      params: { id: 42 },
      query: { include: "requester" },
    });

    expect(logLines()).toHaveLength(1);
    expect(logLines()[0]).toMatch(/^GET \/tickets\/\{id\} 200 \d+ms\n$/);
  });

  it("logs the template, not the URL, for an absolute URL", async () => {
    reply("GET", "/api/v2/tickets?page=2", 200, []);

    await client().request({ path: "/tickets", url: `${ORIGIN}/api/v2/tickets?page=2` });

    expect(logLines()[0]).toMatch(/^GET \/tickets 200 \d+ms\n$/);
  });

  it("logs a connection failure by its code", async () => {
    mock
      .get(ORIGIN)
      .intercept({ path: "/api/v2/tickets", method: "GET" })
      .replyWithError(Object.assign(new Error("secret cause text"), { code: "ECONNRESET" }));

    await client().request({ path: "/tickets" });

    expect(logLines()).toHaveLength(1);
    expect(logLines()[0]).toMatch(/^GET \/tickets network \d+ms\n$/);
  });

  it("never logs the API key, a parameter, a query value or a body string", async () => {
    const http = client();
    reply("POST", "/api/v2/tickets/31337/notes?tag=QUERYVALUE", 201, { body: "RESPONSEBODY" });
    reply("POST", "/api/v2/tickets", 400, {
      errors: [{ field: "ERRFIELD", message: "ERRMESSAGE" }],
    });
    reply("GET", "/api/v2/tickets/31337", 302, "REDIRECTBODY", {
      location: "https://evil.example/LOCATION",
    });

    await http.request({
      method: "POST",
      path: "/tickets/{id}/notes",
      params: { id: 31337 },
      query: { tag: "QUERYVALUE" },
      body: { body: "REQUESTBODY" },
    });
    await http.request({ method: "POST", path: "/tickets", body: { subject: "REQUESTBODY" } });
    await http.request({ path: "/tickets/{id}", params: { id: 31337 } });
    await http.request({ path: "/tickets", url: "https://evil.example/FOREIGNURL" });

    const lines = logLines();
    expect(lines).toHaveLength(3);
    const basic = Buffer.from(`${API_KEY}:X`).toString("base64");
    for (const line of lines) {
      for (const secret of [
        API_KEY,
        basic,
        "31337",
        "QUERYVALUE",
        "REQUESTBODY",
        "RESPONSEBODY",
        "ERRFIELD",
        "ERRMESSAGE",
        "REDIRECTBODY",
        "LOCATION",
        "FOREIGNURL",
      ]) {
        expect(line).not.toContain(secret);
      }
    }
  });
});

describe("HttpClient: a cast cannot re-point the client (A1, A2)", () => {
  const SECOND = "https://other.freshdesk.com";
  const NAMES = [
    "host",
    "limiter",
    "allowed",
    "build",
    "request",
    "requestWithRetry",
    "paginate",
  ] as const;
  const plantedResult: HttpResult = {
    ok: false,
    error: { code: "server", http_status: 500, message: "planted", retryable: false },
  };
  const planted: Record<(typeof NAMES)[number], unknown> = {
    host: "other.freshdesk.com",
    limiter: new RateLimiter(limits),
    allowed: () => true,
    build: () => `${SECOND}/api/v2/tickets`,
    request: () => Promise.resolve(plantedResult),
    requestWithRetry: () => Promise.resolve(plantedResult),
    paginate: async function* () {
      yield plantedResult;
      return { truncated: false };
    },
  };

  it("is frozen once built", () => {
    expect(Object.isFrozen(client())).toBe(true);
  });

  it.each(NAMES)("refuses an assignment to %s through a cast with a TypeError", (name) => {
    const http = client();

    expect(() => {
      (http as unknown as Record<string, unknown>)[name] = planted[name];
    }).toThrow(TypeError);
  });

  it("after those attempts, sends with the key to the configured origin only", async () => {
    const http = client();
    for (const name of NAMES) {
      try {
        (http as unknown as Record<string, unknown>)[name] = planted[name];
      } catch {
        // Refused: what the case before this one asserts.
      }
    }
    reply("GET", "/api/v2/tickets", 200, [{ id: 1 }]);
    reply("GET", "/api/v2/tickets", 200, [{ id: 2 }]);
    reply("GET", "/api/v2/tickets", 200, [{ id: 3 }], {
      ...JSON_TYPE,
      link: `<${SECOND}/api/v2/tickets?page=2>; rel="next"`,
    });
    reply("GET", "/api/v2/tickets", 200, [{ id: 9 }], JSON_TYPE, SECOND);
    reply("GET", "/api/v2/tickets?page=2", 200, [{ id: 9 }], JSON_TYPE, SECOND);

    expect(await http.request({ path: "/tickets" })).toMatchObject({ ok: true, body: [{ id: 1 }] });
    expect(await http.requestWithRetry({ path: "/tickets" })).toMatchObject({
      ok: true,
      body: [{ id: 2 }],
    });
    const pages: HttpResult[] = [];
    for await (const page of http.paginate({ path: "/tickets" }, { pages: 5 })) pages.push(page);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({ ok: true, body: [{ id: 3 }] });
    expect(failure(pages[1]!)).toMatchObject({ code: "validation", http_status: null });
    const direct = await http.request({ path: "/tickets", url: `${SECOND}/api/v2/tickets` });
    expect(failure(direct)).toMatchObject({ code: "validation", http_status: null });

    expect(sent().filter((call) => call.fullUrl.startsWith(SECOND))).toEqual([]);
    expect(sent().map((call) => call.fullUrl)).toEqual([
      `${ORIGIN}/api/v2/tickets`,
      `${ORIGIN}/api/v2/tickets`,
      `${ORIGIN}/api/v2/tickets`,
    ]);
    const basic = `Basic ${Buffer.from(`${API_KEY}:X`).toString("base64")}`;
    for (const index of [0, 1, 2]) expect(sentHeaders(index).authorization).toBe(basic);
  });

  it("in a 429 hold, still refuses with no request sent after an attempt to give it a new limiter", async () => {
    reply("GET", "/api/v2/tickets", 429, "", { "retry-after": "60" });
    const http = client();
    await http.request({ path: "/tickets" });
    expect(failure(await http.request({ path: "/tickets" }))).toMatchObject({
      code: "rate_limited",
      http_status: null,
    });

    try {
      (http as unknown as Record<string, unknown>).limiter = new RateLimiter(limits);
    } catch {
      // Refused: the frozen client.
    }
    reply("GET", "/api/v2/tickets", 200, []);

    const after = await http.request({ path: "/tickets" });
    expect(after).toMatchObject({ ok: false, error: { code: "rate_limited", http_status: null } });
    expect(sent()).toHaveLength(1);
  });
});
