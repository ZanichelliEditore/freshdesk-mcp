# T-005 — Rate limiter (standalone)

- **Type:** build
- **Phase:** M0
- **Status:** doing (2026-11-23)
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
