import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpClient } from "../../../src/client/http.js";
import { RateLimiter } from "../../../src/client/rate-limit.js";
import { MAX_QUERY_LENGTH, searchTickets } from "../../../src/client/resources/search.js";
import { ticketPage } from "../../fixtures/tickets.js";
import { type MockAgent, mockDispatcher } from "../../support/mock-dispatcher.js";

const DOMAIN = "acme.freshdesk.com";
const ORIGIN = `https://${DOMAIN}`;
const SEARCH = "/api/v2/search/tickets";
const JSON_TYPE = { "content-type": "application/json" };
/** Put in malformed bodies: no error message may quote it. */
const CANARY = "Canary-Body-Text-4417";

/** A synthetic `GET /search/tickets` body: `{total, results}`. */
const searchPage = { total: 42, results: ticketPage };

let mock: MockAgent;
let http: HttpClient;

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  mock = mockDispatcher();
  http = new HttpClient({
    domain: DOMAIN,
    apiKey: "k3y-Secret-Value-123",
    dispatcher: mock,
    limiter: new RateLimiter({ reserve_pct: 20, floor_pct: 5, pacing_rps: 2 }),
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await mock.close();
});

/** Queue one reply to `GET /search/tickets`, whatever its query. */
function reply(status: number, body: unknown) {
  mock
    .get(ORIGIN)
    .intercept({ path: (path: string) => path.split("?")[0] === SEARCH, method: "GET" })
    .reply(status, body as object, { headers: JSON_TYPE });
}

function urls(): URL[] {
  return mock
    .getCallHistory()!
    .calls()
    .map((call) => new URL(call.fullUrl));
}

function ok<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error("expected a success");
  return result as Extract<T, { ok: true }>;
}

function failure<T extends { ok: boolean }>(result: T) {
  if (result.ok) throw new Error("expected an error");
  return (result as unknown as { error: Record<string, unknown> }).error;
}

/** A local `validation` naming the parameter, with no request sent. */
function expectRefused(result: { ok: boolean }, name: string) {
  expect(failure(result)).toEqual({
    code: "validation",
    http_status: null,
    message: `Not sent: ${name} is not a valid value.`,
    retryable: false,
  });
  expect(urls()).toHaveLength(0);
}

describe("searchTickets: the request", () => {
  it("sends the query in double quotes, percent-encoded, a space as +, page 1 by default", async () => {
    reply(200, searchPage);

    ok(await searchTickets(http, "status:2 AND tag:'a&b'"));

    const sent = urls();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.href).toBe(
      `${ORIGIN}${SEARCH}?query=%22status%3A2+AND+tag%3A%27a%26b%27%22&page=1`,
    );
    expect(Object.fromEntries(sent[0]!.searchParams)).toEqual({
      query: `"status:2 AND tag:'a&b'"`,
      page: "1",
    });
  });

  it.each([1, 10])("sends page %s as given", async (page) => {
    reply(200, searchPage);

    ok(await searchTickets(http, "priority:3", page));

    expect(urls()[0]!.searchParams.get("page")).toBe(String(page));
  });

  it(`accepts a query of ${MAX_QUERY_LENGTH} characters once quoted`, async () => {
    reply(200, searchPage);
    const query = `tag:'${"x".repeat(MAX_QUERY_LENGTH - 2 - 6)}'`;
    expect(`"${query}"`).toHaveLength(MAX_QUERY_LENGTH);

    ok(await searchTickets(http, query));

    expect(urls()[0]!.searchParams.get("query")).toBe(`"${query}"`);
  });
  it("sends a non-ASCII character UTF-8 percent-encoded", async () => {
    reply(200, searchPage);

    ok(await searchTickets(http, "tag:'caffè'"));

    expect(urls()[0]!.href).toBe(`${ORIGIN}${SEARCH}?query=%22tag%3A%27caff%C3%A8%27%22&page=1`);
  });

  it("counts a character outside the BMP as two UTF-16 units: 255 of them fit", async () => {
    // Two units each: 255 of them quoted is 512 units.
    expect("🦊").toHaveLength(2);
    reply(200, searchPage);

    ok(await searchTickets(http, "🦊".repeat(255)));
  });

  it("refuses 256 characters outside the BMP (514 units quoted) with nothing sent", async () => {
    expectRefused(await searchTickets(http, "🦊".repeat(256)), "query");
  });
});

describe("searchTickets: the result", () => {
  it("returns results and total, and the attempts", async () => {
    reply(200, searchPage);

    const result = ok(await searchTickets(http, "status:2"));

    expect(result.total).toBe(42);
    expect(result.results.map((t) => [t.id, t.subject, t.custom_fields.cf_colour])).toEqual([
      [4101, "Sprocket squeaks at dawn", "Amber"],
      [4102, "Widget arrived in two halves", null],
    ]);
    expect(result.results[0]).toMatchObject({ tags: ["sprocket"], group_id: 701 });
    expect(result.attempts).toBe(1);
  });

  it("returns a total over 300 as Freshdesk gave it", async () => {
    reply(200, { total: 1234, results: ticketPage });

    expect(ok(await searchTickets(http, "status:2", 10)).total).toBe(1234);
  });

  it("returns no matches as an empty list", async () => {
    reply(200, { total: 0, results: [] });

    expect(ok(await searchTickets(http, "status:2"))).toEqual({
      ok: true,
      results: [],
      total: 0,
      attempts: 1,
    });
  });

  it("counts a retried request in attempts", async () => {
    reply(503, {});
    reply(200, searchPage);

    expect(ok(await searchTickets(http, "status:2")).attempts).toBe(2);
  });
});

describe("searchTickets: values refused before sending", () => {
  const pages: [string, unknown][] = [
    ["0", 0],
    ["11", 11],
    ["1.5", 1.5],
    ["NaN", Number.NaN],
    ["a string", "2"],
    ["null", null],
  ];

  it.each(pages)("refuses page %s with nothing sent", async (_, page) => {
    expectRefused(await searchTickets(http, "status:2", page as number), "page");
  });

  const queries: [string, unknown][] = [
    ["over the documented length once quoted", "x".repeat(MAX_QUERY_LENGTH - 1)],
    ["far over the documented length", "x".repeat(5000)],
    ["empty", ""],
    ["blank", "   "],
    ["containing a double quote", `tag:"x"`],
    ["containing a backslash", "tag:'a\\b'"],
    ["not a string", 42],
    ["an array", ["status:2"]],
    ["undefined", undefined],
  ];

  it.each(queries)("refuses a query %s with nothing sent", async (_, query) => {
    expectRefused(await searchTickets(http, query as string), "query");
  });

  it("names the parameter, never the value", async () => {
    const result = await searchTickets(http, `${CANARY}"`);

    expect(JSON.stringify(failure(result))).not.toContain(CANARY);
  });
});

describe("searchTickets: Freshdesk's answers", () => {
  it("passes a 400's errors[] through as validation", async () => {
    reply(400, {
      description: "Validation failed",
      errors: [{ field: "query", message: "Invalid value", code: "invalid_value" }],
    });

    const error = failure(await searchTickets(http, "status:2"));

    expect(error).toMatchObject({
      code: "validation",
      http_status: 400,
      retryable: false,
      errors: [{ field: "query", message: "Invalid value", code: "invalid_value" }],
    });
    expect(urls()).toHaveLength(1);
  });

  const malformed: [string, unknown][] = [
    ["a list instead of an object", [CANARY]],
    ["no total", { results: ticketPage, note: CANARY }],
    ["a total that is not a whole number", { total: "42", results: ticketPage, note: CANARY }],
    ["a negative total", { total: -1, results: ticketPage, note: CANARY }],
    ["results that are not a list", { total: 1, results: CANARY }],
    [
      "a result without custom_fields",
      { total: 1, results: [{ ...ticketPage[0], custom_fields: undefined, subject: CANARY }] },
    ],
    ["a result that is not an object", { total: 1, results: [CANARY] }],
  ];

  it.each(malformed)("refuses %s as server, with no body text", async (_, body) => {
    reply(200, body);

    const error = failure(await searchTickets(http, "status:2"));

    expect(error).toEqual({
      code: "server",
      http_status: 200,
      message: "Freshdesk sent search results in an unexpected shape (HTTP 200).",
      retryable: false,
    });
    expect(JSON.stringify(error)).not.toContain(CANARY);
  });
});

describe("searchTickets: the cost class", () => {
  /** One answered page whose response says 10 of 100 calls are left: under the 20% reserve. */
  async function drain() {
    mock
      .get(ORIGIN)
      .intercept({ path: (path: string) => path.split("?")[0] === SEARCH, method: "GET" })
      .reply(200, searchPage, {
        headers: { ...JSON_TYPE, "x-ratelimit-total": "100", "x-ratelimit-remaining": "10" },
      });
    ok(await searchTickets(http, "status:2"));
  }

  it("is cheap unless given: a page is sent below the reserve", async () => {
    await drain();
    reply(200, searchPage);

    ok(await searchTickets(http, "status:2", 2));

    expect(urls()).toHaveLength(2);
  });

  it("given expensive, the page goes to the limiter as expensive: refused below the reserve", async () => {
    await drain();

    const refusedPage = await searchTickets(http, "status:2", 2, undefined, "expensive");

    expect(failure(refusedPage)).toMatchObject({ code: "rate_limited", http_status: null });
    expect(urls()).toHaveLength(1);
  });

  it("given expensive above the reserve, the page is sent", async () => {
    reply(200, searchPage);

    ok(await searchTickets(http, "status:2", 1, undefined, "expensive"));

    expect(urls()).toHaveLength(1);
  });
});

describe("searchTickets: a failure's attempts", () => {
  it("a failed page says how many requests it took: 0 when the limiter refused it", async () => {
    mock
      .get(ORIGIN)
      .intercept({ path: (path: string) => path.split("?")[0] === SEARCH, method: "GET" })
      .reply(200, searchPage, {
        headers: { ...JSON_TYPE, "x-ratelimit-total": "100", "x-ratelimit-remaining": "10" },
      });
    ok(await searchTickets(http, "status:2"));

    expect(await searchTickets(http, "status:2", 2, undefined, "expensive")).toMatchObject({
      ok: false,
      attempts: 0,
    });

    reply(400, { errors: [] });
    expect(await searchTickets(http, "status:2")).toMatchObject({ ok: false, attempts: 1 });
  });

  it("a page refused before sending has no attempts key", async () => {
    expect(await searchTickets(http, "status:2", 11)).not.toHaveProperty("attempts");
  });
});
