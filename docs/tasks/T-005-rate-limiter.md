# T-005 — Rate limiter (standalone)

- **Type:** build
- **Phase:** M0
- **Status:** todo
- **Depends on:** T-003
- **Created:** 2026-11-20

## Goal
`src/client/rate-limit.ts`: a header-driven budget with reserve, floor and pacing, tested with a fake clock and no network.

## In scope
- State from `X-RateLimit-Total`, `-Remaining`, window end; conservative defaults before any header is seen.
- Caller passes a cost class (`cheap|expensive`); below reserve, `expensive` refused with `rate_limited` explaining why.
- Below floor: wait for the window if it ends within a bound, else fail fast (pick the bound, document it in the module and `docs/journal.md`).
- Pacing of `expensive` ≤ configured req/s; `Retry-After` honoured.
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
`test/client/rate-limit.test.ts` (fake clock): parses headers; defaults with no headers; `expensive` refused below reserve, `cheap` allowed; floor waits or fails fast per the documented bound; pacing ≤ 2 req/s; `Retry-After` respected; `make quality` green.

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
