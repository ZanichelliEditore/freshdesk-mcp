import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type Acquired,
  DEFAULT_TOTAL,
  MAX_WAIT_S,
  RateLimiter,
  WINDOW_S,
} from "../../src/client/rate-limit.js";

const limits = { reserve_pct: 20, floor_pct: 5, pacing_rps: 2 };

function budget(total: number | string, remaining: number | string): Headers {
  return new Headers({
    "X-RateLimit-Total": String(total),
    "X-RateLimit-Remaining": String(remaining),
  });
}

/** A limiter that has just seen `remaining` of `total` on a 200. */
function limiterAt(total: number, remaining: number, options = limits): RateLimiter {
  const limiter = new RateLimiter(options);
  limiter.observe(200, budget(total, remaining));
  return limiter;
}

/** Whether the promise settles without the clock moving. */
async function settlesNow(promise: Promise<unknown>): Promise<boolean> {
  let settled = false;
  void promise.then(() => {
    settled = true;
  });
  await vi.advanceTimersByTimeAsync(0);
  return settled;
}

function refusal(result: Acquired) {
  if (result.ok) throw new Error("expected a refusal");
  return result.error;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("constructor", () => {
  it("refuses a floor above the reserve", () => {
    expect(() => new RateLimiter({ ...limits, reserve_pct: 5, floor_pct: 6 })).toThrow(RangeError);
  });

  it("accepts a floor equal to the reserve", () => {
    expect(() => new RateLimiter({ ...limits, reserve_pct: 5, floor_pct: 5 })).not.toThrow();
  });
});

describe("headers", () => {
  it("reads Total and Remaining: the reserve is a share of the Total seen", async () => {
    // 20 % of 200 is 40: 39 is below the reserve, 40 is not.
    expect((await limiterAt(200, 39).acquire("expensive")).ok).toBe(false);
    expect((await limiterAt(200, 40).acquire("expensive")).ok).toBe(true);
  });

  it("a later response replaces the earlier state", async () => {
    const limiter = limiterAt(100, 10);
    limiter.observe(200, budget(100, 90));
    expect((await limiter.acquire("expensive")).ok).toBe(true);
  });

  it.each([
    ["no headers", new Headers()],
    ["only Total", new Headers({ "X-RateLimit-Total": "100" })],
    ["only Remaining", new Headers({ "X-RateLimit-Remaining": "90" })],
    ["text", budget("abc", "def")],
    ["a negative Remaining", budget(100, -1)],
    ["a fraction", budget(100, "9.5")],
    ["a zero Total", budget(0, 0)],
    ["Remaining above Total", budget(100, 101)],
  ])("ignores %s and keeps the state it had", async (_name, headers) => {
    const limiter = limiterAt(100, 10);
    limiter.observe(200, headers);
    const error = refusal(await limiter.acquire("expensive"));
    expect(error.message).toContain("10 of 100");
  });
});

describe("no headers seen yet", () => {
  it("allows both classes from a conservative default budget", async () => {
    const limiter = new RateLimiter({ ...limits, pacing_rps: 1000 });
    expect(await limiter.acquire("cheap")).toEqual({ ok: true });
    expect(await limiter.acquire("expensive")).toEqual({ ok: true });
  });

  it("counts its own calls against the default: the reserve still bites", async () => {
    const limiter = new RateLimiter(limits);
    const reserve = (DEFAULT_TOTAL * limits.reserve_pct) / 100;
    for (let i = 0; i < DEFAULT_TOTAL - reserve; i++) await limiter.acquire("cheap");
    // Exactly at the reserve: still allowed, and that call goes below it.
    expect((await limiter.acquire("expensive")).ok).toBe(true);
    expect((await limiter.acquire("expensive")).ok).toBe(false);
    expect((await limiter.acquire("cheap")).ok).toBe(true);
  });
});

describe("reserve", () => {
  it("refuses expensive below the reserve, with a rate_limited error saying why", async () => {
    const error = refusal(await limiterAt(100, 19).acquire("expensive"));
    expect(error).toEqual({
      code: "rate_limited",
      http_status: null,
      message: expect.stringContaining("reserve"),
      retryable: true,
      retry_after_s: WINDOW_S,
    });
    expect(error.message).toContain("19 of 100");
  });

  it("allows cheap below the reserve, at once", async () => {
    const limiter = limiterAt(100, 19);
    expect(await settlesNow(limiter.acquire("cheap"))).toBe(true);
    expect(await limiter.acquire("cheap")).toEqual({ ok: true });
  });

  it("allows expensive exactly at the reserve", async () => {
    expect(await limiterAt(100, 20).acquire("expensive")).toEqual({ ok: true });
  });

  it("every call takes a token: the reserve is reached by the limiter's own calls", async () => {
    const limiter = limiterAt(100, 21, { ...limits, pacing_rps: 1000 });
    const first = limiter.acquire("expensive");
    const second = limiter.acquire("expensive");
    const third = limiter.acquire("expensive");
    await vi.runAllTimersAsync();
    expect((await first).ok).toBe(true); // 21 -> 20
    expect((await second).ok).toBe(true); // 20 -> 19
    expect((await third).ok).toBe(false);
  });

  it("the refusal's retry_after_s counts down to the window's end", async () => {
    const limiter = limiterAt(100, 19);
    vi.advanceTimersByTime(12_500);
    expect(refusal(await limiter.acquire("expensive")).retry_after_s).toBe(WINDOW_S - 12);
  });
});

describe("floor", () => {
  const windowMs = WINDOW_S * 1000;
  const boundMs = MAX_WAIT_S * 1000;

  it.each(["cheap", "expensive"] as const)(
    "%s waits when the window ends exactly at the bound, and not a millisecond less",
    async (cost) => {
      const limiter = limiterAt(100, 4);
      vi.advanceTimersByTime(windowMs - boundMs);
      const pending = limiter.acquire(cost);
      expect(await settlesNow(pending)).toBe(false);
      await vi.advanceTimersByTimeAsync(boundMs - 1);
      expect(await settlesNow(pending)).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await pending).toEqual({ ok: true });
    },
  );

  it.each(["cheap", "expensive"] as const)(
    "%s fails fast one millisecond beyond the bound",
    async (cost) => {
      const limiter = limiterAt(100, 4);
      vi.advanceTimersByTime(windowMs - boundMs - 1);
      const pending = limiter.acquire(cost);
      expect(await settlesNow(pending)).toBe(true);
      expect(refusal(await pending)).toEqual({
        code: "rate_limited",
        http_status: null,
        message: expect.stringContaining("4 of 100"),
        retryable: true,
        retry_after_s: MAX_WAIT_S + 1,
      });
    },
  );

  it("does not apply exactly at the floor", async () => {
    expect(await settlesNow(limiterAt(100, 5).acquire("cheap"))).toBe(true);
  });

  it("everyone waiting is released when the window ends", async () => {
    const limiter = limiterAt(100, 0);
    vi.advanceTimersByTime(windowMs - 1000);
    const waiting = [limiter.acquire("cheap"), limiter.acquire("cheap"), limiter.acquire("cheap")];
    await vi.advanceTimersByTimeAsync(1000);
    expect(await Promise.all(waiting)).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
  });

  it("a state older than the window is dropped: the budget is assumed fresh", async () => {
    const limiter = limiterAt(100, 0);
    vi.advanceTimersByTime(windowMs);
    expect(await settlesNow(limiter.acquire("expensive"))).toBe(true);
  });

  it("headers seen while waiting are honoured when the wait ends", async () => {
    const limiter = limiterAt(100, 4);
    vi.advanceTimersByTime(windowMs - 1000);
    const pending = limiter.acquire("cheap");
    await vi.advanceTimersByTimeAsync(500);
    limiter.observe(200, budget(100, 3)); // another call's response: still drained
    await vi.advanceTimersByTimeAsync(500);
    // The window now ends WINDOW_S after that response: 59.5 s away, beyond the bound.
    expect(refusal(await pending).retry_after_s).toBe(WINDOW_S);
  });
});

describe("pacing", () => {
  it("spaces expensive calls at most pacing_rps per second", async () => {
    const limiter = limiterAt(1000, 1000);
    const start = Date.now();
    const times: number[] = [];
    const calls = Array.from({ length: 5 }, () =>
      limiter.acquire("expensive").then((result) => {
        expect(result.ok).toBe(true);
        times.push(Date.now() - start);
      }),
    );
    await vi.runAllTimersAsync();
    await Promise.all(calls);
    expect(times).toEqual([0, 500, 1000, 1500, 2000]);
  });

  it("follows the configured rate", async () => {
    const limiter = limiterAt(1000, 1000, { ...limits, pacing_rps: 4 });
    await limiter.acquire("expensive");
    const second = limiter.acquire("expensive");
    await vi.advanceTimersByTimeAsync(249);
    expect(await settlesNow(second)).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await second).toEqual({ ok: true });
  });

  it("does not pace an expensive call that comes after a long enough gap", async () => {
    const limiter = limiterAt(1000, 1000);
    await limiter.acquire("expensive");
    vi.advanceTimersByTime(500);
    expect(await settlesNow(limiter.acquire("expensive"))).toBe(true);
  });

  it("does not pace cheap calls", async () => {
    const limiter = limiterAt(1000, 1000);
    await limiter.acquire("expensive");
    expect(await settlesNow(limiter.acquire("cheap"))).toBe(true);
    expect(await settlesNow(limiter.acquire("cheap"))).toBe(true);
  });

  it("a refused expensive call uses no pacing slot", async () => {
    const limiter = limiterAt(100, 19);
    expect((await limiter.acquire("expensive")).ok).toBe(false);
    limiter.observe(200, budget(100, 90));
    const pending = limiter.acquire("expensive");
    expect(await settlesNow(pending)).toBe(true);
    expect(await pending).toEqual({ ok: true });
  });
});

describe("429 and Retry-After", () => {
  const retryAfter = (value: string) => new Headers({ "Retry-After": value });

  it("returns the Retry-After delay, in milliseconds", () => {
    expect(new RateLimiter(limits).observe(429, retryAfter("7"))).toBe(7000);
  });

  it("returns 0 for any other status, whatever its headers say", () => {
    const limiter = new RateLimiter(limits);
    expect(limiter.observe(200, budget(100, 90))).toBe(0);
    expect(limiter.observe(503, retryAfter("7"))).toBe(0);
  });

  it.each([
    ["absent", new Headers()],
    ["an HTTP date", retryAfter("Wed, 21 Oct 2026 07:28:00 GMT")],
    ["negative", retryAfter("-1")],
  ])("falls back to a whole window when Retry-After is %s", (_name, headers) => {
    expect(new RateLimiter(limits).observe(429, headers)).toBe(WINDOW_S * 1000);
  });

  it("the next call of either class waits out a Retry-After inside the bound", async () => {
    const limiter = limiterAt(100, 90);
    limiter.observe(429, retryAfter(String(MAX_WAIT_S)));
    const pending = limiter.acquire("cheap");
    await vi.advanceTimersByTimeAsync(MAX_WAIT_S * 1000 - 1);
    expect(await settlesNow(pending)).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ ok: true });
  });

  it("fails fast on a Retry-After beyond the bound, and passes it on", async () => {
    const limiter = limiterAt(100, 90);
    limiter.observe(429, retryAfter(String(MAX_WAIT_S + 1)));
    const pending = limiter.acquire("cheap");
    expect(await settlesNow(pending)).toBe(true);
    expect(refusal(await pending)).toMatchObject({
      code: "rate_limited",
      retry_after_s: MAX_WAIT_S + 1,
    });
  });

  it("holds calls back even with the floor configured at 0 %", async () => {
    const limiter = limiterAt(100, 90, { reserve_pct: 0, floor_pct: 0, pacing_rps: 2 });
    limiter.observe(429, retryAfter("3"));
    const pending = limiter.acquire("cheap");
    expect(await settlesNow(pending)).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await pending).toEqual({ ok: true });
  });

  it("a later response with budget headers lifts the hold", async () => {
    const limiter = new RateLimiter(limits);
    limiter.observe(429, retryAfter("600"));
    limiter.observe(200, budget(100, 90));
    expect(await limiter.acquire("expensive")).toEqual({ ok: true });
  });
});
