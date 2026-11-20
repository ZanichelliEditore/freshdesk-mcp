# T-007 — HTTP retries + pagination iterator

- **Type:** build
- **Phase:** M0
- **Status:** todo
- **Depends on:** T-006
- **Created:** 2026-11-20

## Goal
Reads retry safely, writes never repeat, and lists page through `Link` with a hard cap.

## In scope
- Reads: retry on 429/5xx/network with backoff, max 3.
- Writes: retry on 429 only; never on 5xx or timeout.
- Async iterator following `Link`; caller sets max pages/items.

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
MockAgent call counts: a read on 503 is tried 4 times then fails `server`; a write on 503 is sent exactly once; a write on 429 is retried after `Retry-After`; the iterator follows `Link` across 3 pages and stops at the cap; `make quality` green.

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
