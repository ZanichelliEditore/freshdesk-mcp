# T-059 — A late request with no time left to retry is a cut, not a failure

- **Type:** build
- **Phase:** M1
- **Status:** doing (2026-11-25)
- **Depends on:** T-057
- **Created:** 2026-11-25

## Goal
A later request of `count_tickets` or `export_tickets` that fails with no
answer when no retry can start before the call's 30 s deadline cuts the
read (`truncated: true`, the rows read kept) instead of failing the call.
Found 2026-11-25 while fixing CI in `1d51e20` (`docs/journal.md`, T-057): a
page started between about 19.5 s and 20 s times out (10 s an attempt) as a
plain `network` at 29.5–30 s, before the deadline, no backoff fits, and
`isCut` (`network` only at or past the deadline) fails the call. The same
when a first attempt at 8.5–9.5 s fails and its retry hangs. It fails safe
(no wrong data), but loses the rows read.

## In scope
- The HTTP client (`requestWithRetry`) marks a GET's `network` failure
  that no retry can follow before the deadline as the deadline's expiry,
  a mark the client alone sets, beside the expiry errors it already
  returns; `isCut` takes a `network` error as a cut only with that mark.
- Tests: a page started at 19.6 s that hangs is a cut in `count_tickets`
  and `export_tickets`; a first attempt at 9 s that fails and a retry that
  hangs is a cut; a `network` error at 5 s with time left still fails the
  call; the mark at the client level.
- `docs/architecture/overview.md` and the tools' descriptions or headers
  where they state the cut's causes.

## Out of scope
- A `server` (5xx) answer with no time left to retry: an answer, still a
  failure.
- What counts as a cut otherwise (the limiter's refusal, the budget, the
  caps, SCAN_START_MS): unchanged.
- The error's shape in tool output: unchanged (the mark is not a field).

## Spec sections to read
- SPEC.md §7.1
- SPEC.md §7.2

## Files expected to change
- `src/client/http.ts`
- `src/tools/toolsets/core/count-tickets.ts`
- `src/tools/toolsets/core/export-tickets.ts` (header, if it states the causes)
- `test/client/http-retry.test.ts`
- `test/tools/core/count-tickets.test.ts`
- `test/tools/core/export-tickets.test.ts`
- `docs/architecture/overview.md`

## Wireframes
`none`

## Acceptance
`test/tools/core/count-tickets.test.ts` and `test/tools/core/export-tickets.test.ts` (MockAgent, `test/support/slow-replies.ts`): a later page started at 19.6 s that hangs gives the rows read and `truncated: true`, not an error; a later page whose first attempt at 9 s fails and whose retry hangs is a cut too; a later page failing `network` at 5 s on every attempt, with time left, still fails the call as `network`; `test/client/http-retry.test.ts`: a GET `network` failure that no retry can follow before the deadline carries the client's expiry mark, and one that exhausts its retries with time left does not; the existing deadline tests still pass; `make quality` green.

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
