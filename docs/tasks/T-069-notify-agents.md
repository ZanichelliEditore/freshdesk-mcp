# T-069 — Notify recipients by agent id

- **Type:** build
- **Phase:** M2
- **Status:** todo
- **Depends on:** T-068
- **Created:** 2026-11-25

## Goal
The note entries take agent ids to notify; the core fetches each agent's work email at write time, one GET per distinct id, and refuses the whole write, nothing sent, when any recipient cannot be resolved (RFC invariant 4).

## In scope
- De-duplicate ids, then cap (OD-14, owner 2026-11-25: cap 10); calls counted in `api_calls_used`.
- Refused with the whole write: an unknown id (404), a 5xx, a timeout, `rate_limited`, a null or empty email (`docs/improvements.md` `c928102`), an agent not clearly active, fail closed (`a9b7aa9`; OD-14, owner 2026-11-25), more ids than the cap, an id not a positive safe integer.
- No email kept by the core after the write.

## Out of scope
- Mail to people outside Freshdesk (`forward_ticket`, M3).

## Spec sections to read
- RFC `2026-11-25-write-safety-core`, Decision, invariant 4
- SPEC.md §3 (C4, C6)

## Files expected to change
- `src/core/write-path.ts`
- `test/core/notify.test.ts` (new)

## Wireframes
`none`

## Acceptance
`test/core/notify.test.ts` (MockAgent): ids `[3, 3, 5]` give two GETs and a note whose `notify_emails` holds the two fixture emails, `api_calls_used` counting them; each of unknown id, 5xx, timeout, `rate_limited`, null email, empty email, deactivated agent, cap + 1 ids, id 0 or non-integer refuses the whole write with no POST sent; `make quality` green.

No split point.

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
