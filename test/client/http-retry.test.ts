import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HttpClient,
  type HttpResult,
  REQUEST_TIMEOUT_MS,
  TOTAL_DEADLINE_MS,
} from "../../src/client/http.js";
import { RateLimiter } from "../../src/client/rate-limit.js";
import { type MockAgent, mockDispatcher } from "../support/mock-dispatcher.js";

const DOMAIN = "acme.freshdesk.com";
const ORIGIN = `https://${DOMAIN}`;
const JSON_TYPE = { "content-type": "application/json" };
const PATH = "/api/v2/tickets";
const WRITES = ["POST", "PUT", "DELETE"] as const;

let mock: MockAgent;
let http: HttpClient;
let limiter: RateLimiter;

beforeEach(() => {
  // Only the clock and timeouts are fake: the mock's replies need the rest.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  mock = mockDispatcher();
  limiter = new RateLimiter({ reserve_pct: 20, floor_pct: 5, pacing_rps: 2 });
  http = new HttpClient({
    domain: DOMAIN,
    apiKey: "k3y-Secret-Value-123",
    dispatcher: mock,
    limiter,
  });
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await mock.close();
});

function on(method: string) {
  return mock.get(ORIGIN).intercept({ path: PATH, method });
}

function sent() {
  return mock.getCallHistory()!.calls();
}

function failure(result: HttpResult) {
  if (result.ok) throw new Error("expected an error");
  return result.error;
}

/** Runs the fake clock forward until the call settles; returns the fake ms it took. */
async function settle(call: Promise<HttpResult>): Promise<{ result: HttpResult; ms: number }> {
  const started = Date.now();
  let result: HttpResult | undefined;
  void call.then((value) => {
    result = value;
  });
  while (result === undefined) {
    await new Promise((resolve) => setImmediate(resolve));
    if (result === undefined) await vi.advanceTimersByTimeAsync(100);
  }
  return { result, ms: Date.now() - started };
}

describe("requestWithRetry: reads", () => {
  it("attempts a GET on 503 four times, then fails with server", async () => {
    on("GET").reply(503, "").times(4);
    on("GET").reply(200, { late: true }, { headers: JSON_TYPE });

    const { result } = await settle(http.requestWithRetry({ path: "/tickets" }));

    expect(failure(result)).toMatchObject({ code: "server", http_status: 503 });
    expect(sent()).toHaveLength(4);
  });

  it("backs off between attempts: 0.5 s, 1 s, 2 s", async () => {
    on("GET").reply(503, "").times(4);
    const started = Date.now();
    const at: number[] = [];
    const request = http.request.bind(http);
    vi.spyOn(http, "request").mockImplementation((options) => {
      at.push(Date.now() - started);
      return request(options);
    });

    await settle(http.requestWithRetry({ path: "/tickets" }));

    expect(at).toEqual([0, 500, 1500, 3500]);
  });

  it("counts a 429 and a 503 against the same four attempts", async () => {
    on("GET").reply(429, "", { headers: { "retry-after": "1" } });
    on("GET").reply(503, "");
    on("GET").reply(429, "", { headers: { "retry-after": "1" } });
    on("GET").reply(503, "");
    on("GET").reply(200, { late: true }, { headers: JSON_TYPE });

    const { result } = await settle(http.requestWithRetry({ path: "/tickets" }));

    expect(failure(result)).toMatchObject({ code: "server", http_status: 503, retryable: true });
    expect(sent()).toHaveLength(4);
  });

  it("returns the first success after 5xx failures", async () => {
    on("GET").reply(503, "").times(2);
    on("GET").reply(200, [{ id: 1 }], { headers: JSON_TYPE });

    const { result } = await settle(http.requestWithRetry({ path: "/tickets" }));

    expect(result).toMatchObject({ ok: true, body: [{ id: 1 }] });
    expect(sent()).toHaveLength(3);
  });

  it("retries a GET on a network error", async () => {
    on("GET").replyWithError(Object.assign(new Error("reset"), { code: "ECONNRESET" }));
    on("GET").reply(200, { id: 1 }, { headers: JSON_TYPE });

    const { result } = await settle(http.requestWithRetry({ path: "/tickets" }));

    expect(result).toMatchObject({ ok: true, body: { id: 1 } });
    expect(sent()).toHaveLength(2);
  });

  it("attempts a GET on a network error four times, then fails with network", async () => {
    on("GET")
      .replyWithError(Object.assign(new Error("reset"), { code: "ECONNRESET" }))
      .times(5);

    const { result } = await settle(http.requestWithRetry({ path: "/tickets" }));

    expect(failure(result)).toMatchObject({ code: "network", http_status: null });
    expect(sent()).toHaveLength(4);
  });

  it("retries a GET that timed out", async () => {
    on("GET").reply(200, { slow: true }, { headers: JSON_TYPE }).delay(60_000);
    on("GET").reply(200, { id: 1 }, { headers: JSON_TYPE });

    const { result } = await settle(http.requestWithRetry({ path: "/tickets" }));

    expect(result).toMatchObject({ ok: true, body: { id: 1 } });
    expect(sent()).toHaveLength(2);
  });

  it("retries a GET on 429 once the limiter's hold has passed, without a backoff of its own", async () => {
    on("GET").reply(429, "", { headers: { "retry-after": "2" } });
    on("GET").reply(200, { id: 1 }, { headers: JSON_TYPE });

    const { result, ms } = await settle(http.requestWithRetry({ path: "/tickets" }));

    expect(result).toMatchObject({ ok: true, body: { id: 1 } });
    expect(sent()).toHaveLength(2);
    expect(ms).toBeGreaterThanOrEqual(2000);
    expect(ms).toBeLessThan(2500);
  });

  it.each([
    [404, "not_found"],
    [400, "validation"],
    [401, "auth"],
    [302, "server"],
  ])("does not retry a GET on %i", async (status, code) => {
    on("GET").reply(status, "").times(2);

    const { result } = await settle(http.requestWithRetry({ path: "/tickets" }));

    expect(failure(result).code).toBe(code);
    expect(sent()).toHaveLength(1);
  });

  it("does not retry a 2xx whose body is not JSON", async () => {
    on("GET").reply(200, "<html>").times(2);

    const { result } = await settle(http.requestWithRetry({ path: "/tickets" }));

    expect(failure(result)).toMatchObject({ code: "server", retryable: false });
    expect(sent()).toHaveLength(1);
  });

  it("does not retry a request that was refused before sending", async () => {
    const attempts = vi.spyOn(http, "request");

    const { result } = await settle(
      http.requestWithRetry({ path: "/tickets", url: "https://evil.example/api/v2/tickets" }),
    );

    expect(failure(result)).toMatchObject({ code: "validation", http_status: null });
    expect(attempts).toHaveBeenCalledTimes(1);
    expect(sent()).toHaveLength(0);
  });
});

describe("requestWithRetry: writes are never sent twice", () => {
  it.each(WRITES)("sends a %s on 503 exactly once", async (method) => {
    on(method).reply(503, "").times(2);

    const { result } = await settle(http.requestWithRetry({ method, path: "/tickets" }));

    // It may have been applied: no caller may take it as safe to send again.
    expect(failure(result)).toMatchObject({ code: "server", http_status: 503, retryable: false });
    expect(sent()).toHaveLength(1);
  });

  it.each(WRITES)("sends a %s on a network error exactly once", async (method) => {
    on(method)
      .replyWithError(Object.assign(new Error("reset"), { code: "ECONNRESET" }))
      .times(2);

    const { result } = await settle(http.requestWithRetry({ method, path: "/tickets" }));

    expect(failure(result)).toMatchObject({ code: "network", retryable: false });
    expect(sent()).toHaveLength(1);
  });

  it.each(WRITES)("sends a %s that timed out exactly once", async (method) => {
    on(method).reply(200, { slow: true }, { headers: JSON_TYPE }).delay(60_000);
    on(method).reply(200, { id: 1 }, { headers: JSON_TYPE });

    const { result, ms } = await settle(http.requestWithRetry({ method, path: "/tickets" }));

    expect(failure(result)).toMatchObject({
      code: "network",
      http_status: null,
      message: "Could not reach Freshdesk (TimeoutError).",
      retryable: false,
    });
    expect(sent()).toHaveLength(1);
    expect(ms).toBeGreaterThanOrEqual(10_000);
    expect(ms).toBeLessThan(11_000);
  });
});

describe("requestWithRetry: writes on 429", () => {
  it.each(WRITES)("retries a %s on 429 after the limiter's wait", async (method) => {
    on(method).reply(429, "", { headers: { "retry-after": "2" } });
    on(method).reply(201, { id: 7 }, { headers: JSON_TYPE });

    const { result, ms } = await settle(
      http.requestWithRetry({ method, path: "/tickets", body: { subject: "x" } }),
    );

    expect(result).toMatchObject({ ok: true, status: 201, body: { id: 7 } });
    expect(sent()).toHaveLength(2);
    expect(ms).toBeGreaterThanOrEqual(2000);
  });

  it.each(WRITES)("stops a %s that gets a 503 after a 429", async (method) => {
    on(method).reply(429, "", { headers: { "retry-after": "1" } });
    on(method).reply(503, "");
    on(method).reply(201, { id: 7 }, { headers: JSON_TYPE });

    const { result } = await settle(http.requestWithRetry({ method, path: "/tickets" }));

    expect(failure(result)).toMatchObject({ code: "server", http_status: 503, retryable: false });
    expect(sent()).toHaveLength(2);
  });

  it("stops a POST that times out after a 429", async () => {
    on("POST").reply(429, "", { headers: { "retry-after": "1" } });
    on("POST").reply(201, { slow: true }, { headers: JSON_TYPE }).delay(60_000);
    on("POST").reply(201, { id: 7 }, { headers: JSON_TYPE });

    const { result } = await settle(http.requestWithRetry({ method: "POST", path: "/tickets" }));

    expect(failure(result)).toMatchObject({ code: "network", retryable: false });
    expect(sent()).toHaveLength(2);
  });

  it("marks a write's 503 on the last attempt as not retryable too", async () => {
    on("POST")
      .reply(429, "", { headers: { "retry-after": "1" } })
      .times(3);
    on("POST").reply(503, "");

    const { result } = await settle(http.requestWithRetry({ method: "POST", path: "/tickets" }));

    expect(failure(result)).toMatchObject({ code: "server", retryable: false });
    expect(sent()).toHaveLength(4);
  });

  it("gives up on 429 after four attempts", async () => {
    on("POST")
      .reply(429, "", { headers: { "retry-after": "1" } })
      .times(5);

    const { result } = await settle(http.requestWithRetry({ method: "POST", path: "/tickets" }));

    expect(failure(result)).toMatchObject({ code: "rate_limited", http_status: 429 });
    expect(sent()).toHaveLength(4);
  });

  it("does not wait for a hold longer than the limiter's bound: nothing more is sent", async () => {
    const acquire = vi.spyOn(limiter, "acquire");
    on("POST").reply(429, "", { headers: { "retry-after": "16" } });
    on("POST").reply(201, { id: 7 }, { headers: JSON_TYPE });

    const { result, ms } = await settle(
      http.requestWithRetry({ method: "POST", path: "/tickets" }),
    );

    expect(failure(result)).toMatchObject({
      code: "rate_limited",
      http_status: null,
      retry_after_s: 16,
    });
    // The limiter's refusal is returned, not asked for again.
    expect(acquire).toHaveBeenCalledTimes(2);
    expect(sent()).toHaveLength(1);
    expect(ms).toBeLessThan(1000);
  });

  it("without a Retry-After the limiter holds for its 60 s default: nothing more is sent", async () => {
    on("POST").reply(429, "");
    on("POST").reply(201, { id: 7 }, { headers: JSON_TYPE });

    const { result } = await settle(http.requestWithRetry({ method: "POST", path: "/tickets" }));

    expect(failure(result)).toMatchObject({ code: "rate_limited", retry_after_s: 60 });
    expect(sent()).toHaveLength(1);
  });
});

describe("requestWithRetry: one call ends within TOTAL_DEADLINE_MS", () => {
  const EXPIRED = {
    code: "network",
    http_status: null,
    message: "No answer from Freshdesk within 30 s: the call was given up.",
  };
  const slow = (method: string) =>
    on(method).reply(200, { slow: true }, { headers: JSON_TYPE }).delay(60_000);

  /** Nothing goes out later either: the clock runs on and the count stays. */
  async function nothingMoreSent(count: number) {
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sent()).toHaveLength(count);
  }

  it("aborts the GET in flight at the deadline and sends nothing after it", async () => {
    // 10 s + 0.5 s + 10 s + 1 s, then 8.5 s of a third attempt: without the
    // deadline it would run to 31.5 s and a fourth would follow.
    slow("GET").times(4);

    const { result, ms } = await settle(http.requestWithRetry({ path: "/tickets" }));

    expect(failure(result)).toEqual({ ...EXPIRED, retryable: true });
    expect(ms).toBe(TOTAL_DEADLINE_MS);
    expect(sent()).toHaveLength(3);
    await nothingMoreSent(3);
  });

  it.each(WRITES)("aborts a %s in flight at the deadline: not retryable", async (method) => {
    on(method)
      .reply(429, "", { headers: { "retry-after": "14" } })
      .times(2);
    slow(method).times(2);

    const { result, ms } = await settle(http.requestWithRetry({ method, path: "/tickets" }));

    // Sent at 28 s and cut 2 s later, not after the 10 s of one attempt.
    expect(failure(result)).toEqual({ ...EXPIRED, retryable: false });
    expect(ms).toBe(TOTAL_DEADLINE_MS);
    expect(sent()).toHaveLength(3);
    await nothingMoreSent(3);
  });

  it("returns the last answer rather than start a backoff that would cross the deadline", async () => {
    // Answers at 9.5 s, 19.5 s and 29.8 s; the third backoff is 2 s.
    on("GET").reply(503, "").delay(9500).times(2);
    on("GET").reply(503, "").delay(9300);
    on("GET").reply(200, { late: true }, { headers: JSON_TYPE });

    const { result, ms } = await settle(http.requestWithRetry({ path: "/tickets" }));

    expect(failure(result)).toMatchObject({ code: "server", http_status: 503, retryable: true });
    expect(ms).toBeLessThan(TOTAL_DEADLINE_MS);
    expect(sent()).toHaveLength(3);
    await nothingMoreSent(3);
  });

  it("returns the last answer when the backoff would end exactly at the deadline", async () => {
    // Answers at 9.5 s, 19.5 s and 28 s; the third backoff of 2 s ends at 30 s.
    on("GET").reply(503, "").delay(9500).times(2);
    on("GET").reply(503, "").delay(7500);
    on("GET").reply(200, { late: true }, { headers: JSON_TYPE });

    const { result, ms } = await settle(http.requestWithRetry({ path: "/tickets" }));

    expect(failure(result)).toMatchObject({ code: "server", http_status: 503 });
    expect(ms).toBe(28_000);
    expect(sent()).toHaveLength(3);
    await nothingMoreSent(3);
  });

  it("serves a backoff that ends before the deadline", async () => {
    // The third answer comes at 27.9 s: the backoff ends at 29.9 s.
    on("GET").reply(503, "").delay(9500).times(2);
    on("GET").reply(503, "").delay(7400);
    on("GET").reply(200, { late: true }, { headers: JSON_TYPE });

    const { result } = await settle(http.requestWithRetry({ path: "/tickets" }));

    expect(result).toMatchObject({ ok: true, body: { late: true } });
    expect(sent()).toHaveLength(4);
  });

  // `request` itself says so: `requestWithRetry` would mark a write anyway.
  it.each([
    ["GET", true],
    ["POST", false],
    ["PUT", false],
    ["DELETE", false],
  ] as const)(
    "one attempt of a %s cut by the deadline: retryable %s",
    async (method, retryable) => {
      slow(method);

      const { result, ms } = await settle(
        http.request({ method, path: "/tickets" }, Date.now() + 2000),
      );

      expect(failure(result)).toEqual({ ...EXPIRED, retryable });
      expect(ms).toBe(2000);
    },
  );

  it.each([NaN, -Infinity, 0])("sends nothing for a deadline of %d", async (deadline) => {
    on("POST").reply(201, { id: 7 }, { headers: JSON_TYPE });

    const { result } = await settle(http.request({ method: "POST", path: "/tickets" }, deadline));

    expect(failure(result)).toEqual({ ...EXPIRED, retryable: false });
    expect(sent()).toHaveLength(0);
  });

  describe("a limiter wait at the deadline", () => {
    /** Three 429s whose holds end at `first`, `first` + 14 s and `first` + 28 s. */
    function holdsFrom(method: string, first: number) {
      on(method)
        .reply(429, "", { headers: { "retry-after": "1" } })
        .delay(first - 1000);
      on(method)
        .reply(429, "", { headers: { "retry-after": "14" } })
        .times(2);
      on(method).reply(201, { id: 7 }, { headers: JSON_TYPE });
    }

    it.each(["GET", ...WRITES] as const)(
      "a %s whose wait would end exactly at it is refused as rate_limited, with no sleep",
      async (method) => {
        const acquire = vi.spyOn(limiter, "acquire");
        holdsFrom(method, 2000);

        const { result, ms } = await settle(http.requestWithRetry({ method, path: "/tickets" }));

        // The third hold would end at 30 s: refused when it starts, at 16 s.
        expect(failure(result)).toMatchObject({
          code: "rate_limited",
          http_status: null,
          retry_after_s: 14,
        });
        expect(ms).toBe(16_000);
        expect(acquire).toHaveBeenLastCalledWith("cheap", 14_000);
        expect(sent()).toHaveLength(3);
        await nothingMoreSent(3);
      },
    );

    it("a wait that ends one millisecond before it is served", async () => {
      holdsFrom("POST", 1999);
      const started = Date.now();
      let ended: number | undefined;
      const call = http.requestWithRetry({ method: "POST", path: "/tickets" }).then((result) => {
        ended = Date.now() - started;
        return result;
      });

      const { result } = await settle(call);

      expect(result).toMatchObject({ ok: true, status: 201 });
      expect(ended).toBe(TOTAL_DEADLINE_MS - 1);
      expect(sent()).toHaveLength(4);
    });
  });

  it("sends nothing when the limiter lets the call go with no time left", async () => {
    vi.spyOn(limiter, "acquire").mockImplementation(() => {
      vi.setSystemTime(Date.now() + TOTAL_DEADLINE_MS);
      return Promise.resolve({ ok: true });
    });
    on("POST").reply(201, { id: 7 }, { headers: JSON_TYPE });

    const { result } = await settle(http.requestWithRetry({ method: "POST", path: "/tickets" }));

    expect(failure(result)).toEqual({ ...EXPIRED, retryable: false });
    expect(sent()).toHaveLength(0);
  });

  it("leaves a call that ends sooner as it was", async () => {
    const acquire = vi.spyOn(limiter, "acquire");
    on("GET").reply(503, "").times(4);

    const { result, ms } = await settle(http.requestWithRetry({ path: "/tickets" }));

    expect(failure(result)).toMatchObject({ code: "server", http_status: 503, retryable: true });
    expect(sent()).toHaveLength(4);
    expect(ms).toBe(3500);
    // Each attempt hands the limiter what is left of the 30 s.
    expect(acquire.mock.calls.map(([, bound]) => bound)).toEqual([30_000, 29_500, 28_500, 26_500]);
  });
});

describe("request: a deadline cannot lengthen anything", () => {
  it("a far deadline leaves the timeout of one attempt and the limiter's own bound in force", async () => {
    on("GET").reply(200, { slow: true }, { headers: JSON_TYPE }).delay(60_000);

    const { result, ms } = await settle(http.request({ path: "/tickets" }, Date.now() + 3_600_000));

    expect(failure(result).message).toBe("Could not reach Freshdesk (TimeoutError).");
    expect(ms).toBe(REQUEST_TIMEOUT_MS);

    // The hold of 16 s is refused, as without a deadline.
    on("GET").reply(429, "", { headers: { "retry-after": "16" } });
    await settle(http.request({ path: "/tickets" }));
    const refused = await settle(http.request({ path: "/tickets" }, Date.now() + 3_600_000));
    expect(failure(refused.result)).toMatchObject({ code: "rate_limited", retry_after_s: 16 });
    expect(refused.ms).toBe(0);
  });
});
