// Rate limiter (SPEC §7.2): a budget read from Freshdesk's response headers,
// shared by every call this process makes. No network, no config import.
//
// Use: `await acquire(cost)` before each request, `observe(status, headers)`
// on each response. The limiter owns every wait: a caller that is told to
// retry calls `acquire` again and never sleeps on its own.
//
//   - Every allowed call takes one token from the local count; the next
//     response's headers replace that count with the account's real one.
//   - Reserve: below `reserve_pct` of Total, `expensive` is refused.
//   - Floor: below `floor_pct` of Total, and after a 429, every call waits
//     for the window's end when that is at most MAX_WAIT_S away, and is
//     refused at once when it is further.
//   - Pacing: `expensive` calls start at most `pacing_rps` per second.
//   - A refusal is a `rate_limited` error with `retry_after_s`, never a throw.
//
// Freshdesk sends no window-end header. The limiter assumes a fixed window of
// WINDOW_S and takes the latest end the evidence allows: WINDOW_S after the
// last response seen, or the `Retry-After` of a 429. A state older than that
// is dropped and the budget assumed fresh; the next response corrects it.
//
// MAX_WAIT_S is 15 s: long enough to ride out the tail of a window, short
// enough that a tool call answers well inside an MCP client's timeout.

import { type FreshdeskError, parseRetryAfter } from "./errors.js";

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
/** Longest wait for the window's end before a call is refused instead, seconds. */
export const MAX_WAIT_S = 15;
/** Calls per window assumed until a response says otherwise. */
export const DEFAULT_TOTAL = 50;

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

  /** Resolves when the call may go out, or with the reason it may not. */
  async acquire(cost: CostClass): Promise<Acquired> {
    for (;;) {
      const now = Date.now();
      if (this.windowEnd !== undefined && now >= this.windowEnd) {
        this.remaining = this.total;
        this.exhausted = false;
        this.windowEnd = undefined;
      }
      const windowEnd = (this.windowEnd ??= now + WINDOW_S * 1000);

      if (this.exhausted || this.below(this.options.floor_pct)) {
        const wait = windowEnd - now;
        if (wait > MAX_WAIT_S * 1000) {
          return this.refuse(
            this.exhausted ? "Freshdesk rate limit reached" : `${this.left()}: too few to go on`,
            wait,
          );
        }
        await sleep(wait);
        continue;
      }
      if (cost === "expensive") {
        if (this.below(this.options.reserve_pct)) {
          return this.refuse(
            `${this.left()}: below the reserve, expensive operations are refused`,
            windowEnd - now,
          );
        }
        if (now < this.nextExpensiveAt) {
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
   * Feed every response in. Returns how long the server asked to wait, in
   * milliseconds: 0 unless the status is 429. The next `acquire` serves that
   * wait (or refuses, beyond MAX_WAIT_S); the caller does not sleep.
   */
  observe(status: number, headers: HeaderReader): number {
    const now = Date.now();
    if (status === 429) {
      const delay = (parseRetryAfter(headers.get("retry-after")) ?? WINDOW_S) * 1000;
      this.exhausted = true;
      this.windowEnd = now + delay;
      return delay;
    }
    const total = count(headers.get("x-ratelimit-total"));
    const remaining = count(headers.get("x-ratelimit-remaining"));
    if (total !== undefined && remaining !== undefined && total > 0 && remaining <= total) {
      this.total = total;
      this.remaining = remaining;
      this.exhausted = false;
      this.windowEnd = now + WINDOW_S * 1000;
    }
    return 0;
  }

  private below(pct: number): boolean {
    return this.remaining < (this.total * pct) / 100;
  }

  private left(): string {
    return `${Math.max(this.remaining, 0)} of ${this.total} API calls left in this window`;
  }

  private refuse(why: string, waitMs: number): Acquired {
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
}

function count(value: string | null): number | undefined {
  const trimmed = value?.trim();
  return trimmed !== undefined && /^\d+$/.test(trimmed) ? Number(trimmed) : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.ceil(ms)));
}
