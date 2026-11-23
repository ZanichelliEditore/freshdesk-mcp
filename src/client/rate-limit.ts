// Rate limiter (SPEC §7.2): a budget read from Freshdesk's response headers,
// shared by every call this process makes. No network, no config import.
//
// Use: `await acquire(cost)` before each request, `observe(status, headers)`
// on each response. The limiter owns every wait for the rate limit: a caller
// that is told to retry calls `acquire` again and never sleeps on a 429 itself
// (its backoff after a 5xx or a network error is its own, see `http.ts`).
//
//   - Every allowed call takes one token from the local count; the next
//     response's headers replace that count with the account's real one.
//   - Reserve: below `reserve_pct` of Total, `expensive` is refused.
//   - Floor: below `floor_pct` of Total, at zero, and after a 429, every call
//     waits for the window's end, or is refused when that is too far.
//   - Pacing: `expensive` calls start at most `pacing_rps` per second.
//   - One `acquire` waits MAX_WAIT_S at most, all its waits together (floor,
//     429 and pacing): a wait that would end later is refused at once.
//   - A caller with less time than that passes its own bound: a wait that
//     would end at or after it is refused at once too. The bound only ever
//     refuses sooner; MAX_WAIT_S holds whatever the caller passes.
//   - A refusal is a `rate_limited` error with `retry_after_s`, never a throw.
//
// Freshdesk sends no window-end header. The limiter assumes a fixed window of
// WINDOW_S and takes the latest end the evidence allows: WINDOW_S after the
// last response seen, or the `Retry-After` of a 429. A state older than that
// is dropped and the budget assumed fresh; the next response corrects it.
//
// After a 429 nothing goes out until its `Retry-After` has passed, kept
// between MIN_HOLD_S and MAX_HOLD_S whatever the header says. Budget headers
// seen meanwhile are ignored: they answer requests sent before the 429.
//
// Known limit: outside a 429 hold, responses are taken in arrival order, so
// one that arrives late can raise the count again, and calls still in flight
// are not counted once a response has replaced the local count. The error
// is at most the number of calls in flight.
//
// MAX_WAIT_S is 15 s: long enough to ride out the tail of a window, short
// enough that a tool call answers well inside an MCP client's timeout.

import type { FreshdeskError } from "./errors.js";

export type CostClass = "cheap" | "expensive";

/** The same names as `limits` in the team config, so it can be passed as is. */
export interface RateLimitOptions {
  reserve_pct: number;
  floor_pct: number;
  pacing_rps: number;
}

export type Acquired = { ok: true } | { ok: false; error: FreshdeskError };

interface HeaderReader {
  get(name: string): string | null;
}

/** Assumed length of Freshdesk's rate-limit window, seconds. */
export const WINDOW_S = 60;
/** Longest one `acquire` waits before the call is refused instead, seconds. */
export const MAX_WAIT_S = 15;
/** Calls per window assumed until a response says otherwise. */
export const DEFAULT_TOTAL = 50;
/** Shortest and longest hold after a 429, whatever its `Retry-After`, seconds. */
export const MIN_HOLD_S = 1;
export const MAX_HOLD_S = 3600;

export class RateLimiter {
  private readonly options: RateLimitOptions;
  private total = DEFAULT_TOTAL;
  private remaining = DEFAULT_TOTAL;
  /** Epoch ms; `undefined` until the first call or response of a window. */
  private windowEnd: number | undefined;
  /** A 429 was seen in this window: nothing goes out until it ends. */
  private exhausted = false;
  private nextExpensiveAt = 0;

  constructor(options: RateLimitOptions) {
    if (options.floor_pct > options.reserve_pct) {
      throw new RangeError("floor_pct must not be above reserve_pct");
    }
    this.options = options;
  }

  /**
   * Resolves when the call may go out, or with the reason it may not.
   * `boundMs` is the time the caller has left: the call must go out strictly
   * before it has passed. It cannot lengthen the wait beyond MAX_WAIT_S.
   */
  async acquire(cost: CostClass, boundMs = Infinity): Promise<Acquired> {
    const start = Date.now();
    const deadline = start + MAX_WAIT_S * 1000;
    const tooFar = (end: number) => end > deadline || end >= start + boundMs;
    for (;;) {
      const now = Date.now();
      this.expire(now);
      const windowEnd = (this.windowEnd ??= now + WINDOW_S * 1000);

      if (this.exhausted || this.remaining <= 0 || this.below(this.options.floor_pct)) {
        if (tooFar(windowEnd)) {
          const why = this.exhausted ? "Freshdesk rate limit reached" : this.left();
          return refuse(`${why}: no call goes out until the window resets`, windowEnd - now);
        }
        await sleep(windowEnd - now);
        continue;
      }
      if (cost === "expensive") {
        if (this.below(this.options.reserve_pct)) {
          return refuse(
            `${this.left()}: below the reserve, expensive operations are refused`,
            windowEnd - now,
          );
        }
        if (now < this.nextExpensiveAt) {
          if (tooFar(this.nextExpensiveAt)) {
            return refuse(
              "Too many expensive operations are queued for pacing",
              this.nextExpensiveAt - now,
            );
          }
          await sleep(this.nextExpensiveAt - now);
          continue;
        }
        this.nextExpensiveAt = now + 1000 / this.options.pacing_rps;
      }
      this.remaining -= 1;
      return { ok: true };
    }
  }

  /**
   * Feed every response in. Returns the hold a 429 starts, in milliseconds
   * (its `Retry-After`, within MIN_HOLD_S..MAX_HOLD_S), and 0 for any other
   * status. The value is for reporting only: the next `acquire` serves the
   * hold or refuses, and the caller must not sleep on it.
   */
  observe(status: number, headers: HeaderReader): number {
    const now = Date.now();
    this.expire(now);
    if (status === 429) {
      const asked = count(headers.get("retry-after")) ?? WINDOW_S;
      const hold = Math.min(Math.max(asked, MIN_HOLD_S), MAX_HOLD_S) * 1000;
      // A second 429 may extend a hold in force, never shorten it.
      const end = Math.max(now + hold, this.exhausted ? (this.windowEnd ?? 0) : 0);
      this.exhausted = true;
      this.windowEnd = end;
      return hold;
    }
    if (this.exhausted) return 0;
    const total = count(headers.get("x-ratelimit-total"));
    const remaining = count(headers.get("x-ratelimit-remaining"));
    if (total !== undefined && remaining !== undefined && total > 0 && remaining <= total) {
      this.total = total;
      this.remaining = remaining;
      this.windowEnd = now + WINDOW_S * 1000;
    }
    return 0;
  }

  /** Past the window's end the state is stale: assume a fresh budget. */
  private expire(now: number): void {
    if (this.windowEnd !== undefined && now >= this.windowEnd) {
      this.remaining = this.total;
      this.exhausted = false;
      this.windowEnd = undefined;
    }
  }

  private below(pct: number): boolean {
    return this.remaining < (this.total * pct) / 100;
  }

  private left(): string {
    return `${this.remaining} of ${this.total} API calls left in this window`;
  }
}

function refuse(why: string, waitMs: number): Acquired {
  const seconds = Math.ceil(waitMs / 1000);
  return {
    ok: false,
    error: {
      code: "rate_limited",
      http_status: null,
      message: `${why}. Try again in ${seconds} s.`,
      retryable: true,
      retry_after_s: seconds,
    },
  };
}

/** A header holding a whole number of calls or seconds; anything else is no value. */
function count(value: string | null): number | undefined {
  const trimmed = value?.trim();
  if (trimmed === undefined || !/^\d+$/.test(trimmed)) return undefined;
  const number = Number(trimmed);
  return Number.isSafeInteger(number) ? number : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.ceil(ms)));
}
