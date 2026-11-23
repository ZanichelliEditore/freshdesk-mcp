# T-005 — Rate limiter (standalone)

- **Type:** build
- **Phase:** M0
- **Status:** done (2026-11-23)
- **Depends on:** T-003
- **Created:** 2026-11-20

## Goal
`src/client/rate-limit.ts`: a header-driven budget with reserve, floor, pacing and `Retry-After`, tested with a fake clock and no network.

## In scope
- State from `X-RateLimit-Total`, `-Remaining`, window end; conservative defaults before any header is seen.
- Caller passes a cost class (`cheap|expensive`); below reserve, `expensive` refused with `rate_limited` explaining why.
- Below floor: wait if the window ends within a bound, fail fast with `rate_limited` beyond it (pick the bound, document it in the module and `docs/journal.md`).
- Pacing of `expensive` ≤ configured req/s.
- **Owns every wait**, `Retry-After` included: the retry loop (T-007) asks the limiter how long to wait, it never sleeps on its own.
- Options passed in (no config import).

## Out of scope
- Cost estimate / per-call budget with `confirm:true` — belongs to the first multi-call tool (M1).
- Wiring into http (T-006).

## Spec sections to read
- SPEC.md §7.2

## Files expected to change
- `src/client/rate-limit.ts`, `test/client/rate-limit.test.ts`

## Wireframes
`none`

## Acceptance
`test/client/rate-limit.test.ts` (fake clock): parses headers; defaults with no headers; `expensive` refused below reserve, `cheap` allowed; below floor it waits when the window ends inside the bound, fails fast beyond it, and the exact boundary is tested; pacing ≤ 2 req/s; `Retry-After` delay returned; `make quality` green.

---
*Filled at `/handoff`:*

## Done
- Commits: `aa38280` (limiter + tests), `4384a89` (full-round review
  fixes), `a46859c` (scoped-round fix, security-reviewer A1).
- `src/client/rate-limit.ts`: `RateLimiter.acquire(cost)` and
  `observe(status, headers)`; constants `WINDOW_S` 60, `MAX_WAIT_S` 15,
  `DEFAULT_TOTAL` 50, `MIN_HOLD_S` 1, `MAX_HOLD_S` 3600.
- Acceptance, each in `test/client/rate-limit.test.ts` (59 tests, fake
  clock), by `describe` block: "headers" (parses, ignores malformed);
  "no headers seen yet" (defaults); "reserve" (`expensive` refused below,
  `cheap` allowed, exact boundary); "floor" (waits at exactly the bound,
  fails fast one millisecond beyond, exact floor boundary); "pacing"
  (≤ 2 req/s, configured rate, queue bound); "429 and Retry-After" (delay
  returned, hold served or refused, clamp, second 429); "the bound covers
  one call's waits together".
- Hand mutation of the limiter, main session: 12 mutants on `aa38280` (11
  killed, the survivor's test tightened), 15 on `4384a89` and 2 on
  `a46859c`, all killed.
- `make quality` exit 0, 203 vitest tests; `make build` exit 0.

## Dead ends
- Exporting `parseRetryAfter` from `src/client/errors.ts` for the limiter
  (`aa38280`): reverted in `4384a89`. The limiter needs a safe-integer check
  the error model's parser lacks, so it has its own `count()`.
- "Budget headers after a 429 lift the hold" (`aa38280`, pinned by a test):
  a response already in flight lifted it. Since `4384a89` headers are
  ignored during a hold.

## Open doubts
- **`a46859c` was reviewed by no sub-agent.** It fixes the scoped round's
  one fail-open finding and touches the 429 hold (rule 9: no third round).
  Owner, 2026-11-23: the 429 hold is settled. Closed.
- Builder's choices, not yet the owner's: the 15 s bound per `acquire`
  (floor, 429 and pacing waits together); the assumed 60 s window, from
  memory of Freshdesk's documentation, not verified against it; the default
  budget of 50 before any header; the 429 hold clamped to 1 s..1 h; a
  `Retry-After` that is not a whole number of seconds falls back to 60 s.
- The window's end is an upper bound (60 s after the last response), so
  below the floor a call is nearly always refused, not made to wait: the
  wait branch needs 45 s without a response, or a short `Retry-After`.
- For T-007: `observe` returns the hold in milliseconds for reporting only,
  the retry loop calls `acquire` again and must not sleep on it; a 429 whose
  `Retry-After` is above 15 s makes that `acquire` refuse, so "a write on
  429 is retried after the limiter's wait" holds only up to 15 s.
- `floor_pct` above `reserve_pct` throws a bare `RangeError` at
  construction; `src/config.ts` has no cross-field rule, so a team file can
  pass `loadConfig` and fail later with no file or key named.
- Parked from both rounds: `docs/improvements.md`, entries stamped
  `a46859c`.

## Context pressure
ok
