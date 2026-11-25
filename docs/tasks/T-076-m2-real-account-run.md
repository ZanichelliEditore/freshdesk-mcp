# T-076 — M2 acceptance on `mcp-test` tickets (owner action)

- **Type:** spike
- **Phase:** M2
- **Status:** todo (2026-11-25)
- **Depends on:** T-075; the owner's time-trigger check (2026-11-26) and SPEC §13's M2 wording settled
- **Created:** 2026-11-25

## Goal
M2's acceptance shown on the real account: C1 apply, C4 internal, C5 update, C6 and C8 (newly arrived tickets) work on `mcp-test` tickets, and the activity log shows no automation acted.

## In scope
- First: SPEC §13's M2 clause in the form the owner chose after the 2026-11-26 check (RFC: as written, (a) or (b)).
- Owner: create `mcp-test` tickets (requester an internal mailbox, group `MCP Test`), check each is not spam, run `make smoke-write` per use case, read the activity log after each kind of write.
- Results in `docs/private/account-facts.md` (gitignored); the task file holds yes/no lines only.

## Out of scope
- Production tickets.

## Spec sections to read
- SPEC.md §13 (M2)
- SPEC.md §11 (Real-account checks)
- RFC `2026-11-25-write-safety-core`, M2's automations wording

## Files expected to change
- `SPEC.md` §13
- `docs/private/account-facts.md` (gitignored)
- this task file

## Wireframes
`none`

## Acceptance
SPEC §13's M2 row holds the owner's chosen wording; "Done" lists one yes line per use case (C1, C4, C5, C6, C8) from the owner's `make smoke-write` runs and one line "no automation rule acted" from the activity log, with dates; no account value in any tracked file (commit hook passes); `make quality` green.

No split point. Needs the owner's actions throughout.

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
