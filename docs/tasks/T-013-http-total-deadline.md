# T-013 — Total deadline of 30 s on `requestWithRetry`

- **Type:** build
- **Phase:** M0
- **Status:** todo (2026-11-23)
- **Depends on:** T-007
- **Created:** 2026-11-23

## Goal
One `HttpClient.requestWithRetry` call ends within 30 s, attempts, limiter
waits and backoff together (owner's decision, 2026-11-23). Before this task
it has no total bound: about 103 s at worst, 43.5 s for a GET nobody answers.

## In scope
- A deadline constant in `src/client/http.ts`, checked before each attempt
  and each backoff sleep; the clock is `Date.now()` (the tests fake `Date`,
  not `performance`).
- The time left caps the per-attempt timeout, so an attempt in flight at
  30 s is aborted.
- `RateLimiter.acquire` takes an optional caller bound; a wait that would
  pass the deadline is refused as `rate_limited` with `retry_after_s`, with
  no sleep.
- Expiry error: `network`, `http_status: null`, a fixed message;
  `retryable: true` for a GET, `false` for any other method (an aborted
  write may have been applied, as with the 10 s timeout).
- Header comments of `http.ts` and the `http.ts` line of
  `docs/architecture/overview.md`.

Plan-time choices of 2026-11-23, the planner's recommendation; the owner
reviews them with the plan: the expiry code and its `retryable`, the
`rate_limited` refusal during a limiter wait, the abort of an attempt in
flight.

## Out of scope
- A total budget for `paginate`: each page is its own `requestWithRetry`,
  so each page gets 30 s.
- A new error code (the union of seven is a public contract: RFC).
- Making `request` private, the `Link` regex, the backoff schedule
  (parked in `docs/improvements.md`).
- Editing SPEC §7.1.

## Spec sections to read
- SPEC.md §7.1
- SPEC.md §7.2

## Files expected to change
- `src/client/http.ts`
- `src/client/rate-limit.ts`
- `test/client/http-retry.test.ts`
- `test/client/rate-limit.test.ts`
- `docs/architecture/overview.md`

## Wireframes
`none`

## Acceptance
`test/client/http-retry.test.ts` (MockAgent, fake clock): a call whose attempts, limiter waits and backoff would pass 30 s returns an error at or before 30 s and sends nothing after it; an attempt in flight at 30 s is aborted; the expiry error is `network` with `http_status: null`, `retryable: true` for a GET and `false` for any other method; a write held by a 429 is not sent once the deadline has passed; a limiter wait that would pass the deadline is refused as `rate_limited` with `retry_after_s`, with no sleep; a call that ends sooner is unchanged; `make quality` green.

## Split point
Not expected to be needed (one module and the limiter's `acquire`). If the
session runs tight: the bounded `acquire` with its `rate-limit.test.ts`
case first, the deadline in `http.ts` second.

---
*Filled at `/handoff`:*

## Done
Commits and tests, not narration.

## Dead ends
none

## Open doubts
none

## Context pressure
low | ok | tight | overflowed — and, if tight or overflowed, how it should
have been split.

## Next action
Only if the status is still `doing`: the exact first step for the next
session.
