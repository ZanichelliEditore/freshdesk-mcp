# T-087 — M3 acceptance on `mcp-test` tickets (owner action)

- **Type:** spike
- **Phase:** M3
- **Status:** todo (2026-11-26)
- **Depends on:** T-086, T-076 `done`
- **Created:** 2026-11-26

## Goal
M3's acceptance shown on the real account: C5 reply, C4 forward and the public note work on `mcp-test` tickets, mail reaches only the expected internal mailboxes, the activity log shows no automation acted, and A1 to A6 are checked (A4 by one opt-in reply run).

## In scope
- Owner: the private team file's `forward_allow_list` holds the builders' own addresses or an internal `@domain`; `mcp-test` tickets with an internal requester on that list, no ticket-level CC, group `MCP Test`, each checked not spam; plus one such ticket for A4 whose only ticket-level CC is another allow-listed internal mailbox, not the requester.
- Owner: `make smoke-send` once each for a reply, a forward and a public note (OD-26); check which mailboxes received mail; read the activity log after each send; record A1 to A6.
- Owner, A4 (owner, 2026-11-26): one reply run with `TICKET_CC=allow-listed` on the A4 ticket; record whether the CC mailbox received the reply.
- Results in `docs/private/account-facts.md` (gitignored); this task file holds yes/no lines only.

## Out of scope
- Production tickets; any address outside the allow-list.

## Spec sections to read
- SPEC.md §13 (M3)
- SPEC.md §11 (Real-account checks)
- T-079's RFC

## Files expected to change
- `docs/private/account-facts.md` (gitignored)
- this task file

## Wireframes
`none`

## Acceptance
"Done" lists, with dates, one yes line each for C5 reply, C4 forward and the public note (OD-26) from the owner's `make smoke-send` runs, one line that mail reached only the expected internal mailboxes, one line "no automation rule acted" from the activity log after each reply, forward and public note (SPEC §13, OD-31), and one yes/no line per API assumption A1 to A6 (A4 from one reply run with T-086's `TICKET_CC=allow-listed` on an `mcp-test` ticket whose only ticket-level CC is an allow-listed internal mailbox, the reply's own `cc` empty: yes if that mailbox received the reply, no if not); no account value in any tracked file (commit hook passes); `make quality` green.

No split point. Needs the owner's actions throughout; taken only after T-076 is `done`.

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
