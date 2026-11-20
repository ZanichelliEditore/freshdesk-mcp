# T-007 — HTTP retries + pagination iterator

- **Type:** build
- **Phase:** M0
- **Status:** todo
- **Depends on:** T-006
- **Created:** 2026-11-20

## Goal
Reads retry safely, writes never repeat, and lists page through `Link` with a hard cap.

## In scope
- Read/write decided **by method**: only GET and HEAD are reads; everything else is a write. No caller flag.
- Reads: retry on 429/5xx/network, max 3 retries (4 attempts), backoff and waits from the limiter (T-005).
- Writes: retry on 429 only, waiting as the limiter says (a bounded default when `Retry-After` is absent); never on 5xx, network error or timeout.
- Async iterator following `Link`; every page URL goes through the T-006 send function (host check); caller sets max pages/items.

## Out of scope
- Resource modules (T-008).

## Spec sections to read
- SPEC.md §7.1

## Files expected to change
- `src/client/http.ts`
- `test/client/http-retry.test.ts`, `test/client/paginate.test.ts`

## Wireframes
`none`

## Split point
(a) retries, (b) pagination — take (a) alone if (b) does not fit.

## Acceptance
MockAgent call counts: a read on 503 is attempted 4 times then fails `server`; a read on a network error is retried; a POST/PUT on 503 and on a network error or timeout is sent exactly once; a write on 429 is retried after the limiter's wait; the iterator follows `Link` across 3 pages, stops at the cap, and refuses a `Link` to a foreign host with no request sent; `make quality` green.

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
