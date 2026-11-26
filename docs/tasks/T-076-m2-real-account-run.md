# T-076 — M2 acceptance on `mcp-test` tickets (owner action)

- **Type:** spike
- **Phase:** M2
- **Status:** done (2026-11-26)
- **Depends on:** T-075 (the time-trigger check and SPEC §13's M2 wording settled 2026-11-26)
- **Created:** 2026-11-25

## Goal
M2's acceptance shown on the real account: C1 apply, C4 internal, C5 update, C6 and C8 (newly arrived tickets) work on `mcp-test` tickets, and the activity log shows no automation acted.

## In scope
- SPEC §13's M2 clause: settled 2026-11-26 (`/decompose M2` amendment). The owner's time-trigger check found no automation rule or time trigger acted on the `mcp-test` ticket left overnight, so the RFC's wording stands as written; nothing to change in SPEC here.
- Owner: create `mcp-test` tickets (requester an internal mailbox, group `MCP Test`), check each is not spam, run `make smoke-write` per use case, read the activity log after each kind of write.
- Results in `docs/private/account-facts.md` (gitignored); the task file holds yes/no lines only.

## Out of scope
- Production tickets.

## Spec sections to read
- SPEC.md §13 (M2)
- SPEC.md §11 (Real-account checks)
- RFC `2026-11-25-write-safety-core`, M2's automations wording

## Files expected to change
- `docs/private/account-facts.md` (gitignored)
- this task file

## Wireframes
`none`

## Acceptance
SPEC §13's M2 row holds the settled wording (2026-11-26); "Done" lists one yes line per use case (C1, C4, C5, C6, C8) from the owner's `make smoke-write` runs and one line "no automation rule acted" from the activity log, with dates; no account value in any tracked file (commit hook passes); `make quality` green.

No split point. Needs the owner's actions throughout.

---
*Filled at `/handoff`:*

## Done
Owner's runs on the real account (slug in `docs/private/`), six new
`mcp-test` tickets created 2026-11-26, each checked not spam; ids, field
names and values only in `docs/private/account-facts.md` ("T-076 runs
(owner, 2026-11-26)").

- C1 apply: yes (2026-11-26), `make smoke-write CASE=C1` on two tickets,
  written 2, refused 0, may_have_been_applied 0, not_attempted 0.
- C4 internal: yes (2026-11-26), one private note written, notified 1.
- C5 update: yes (2026-11-26), status changed.
- C6: yes (2026-11-26), private note written and assignment PUT answered
  200, notified 1; the assignment set values the ticket already had, so it
  changed nothing (see "Open doubts").
- C8 (new tickets): yes (2026-11-26), written 1.
- No automation rule acted (2026-11-26): the activity log, read after each
  kind of write (C1, C8, C4, C5, C6), shows only the API user's own
  changes; no automation rule and no SLA escalation on any of the six.
- Time triggers: owner decision, 2026-11-26: the overnight check on the
  earlier `mcp-test` ticket (created 2026-11-25, left waiting the night of
  2026-11-25 to 2026-11-26; its activity log showed no automation or time
  trigger acted) is accepted as the time-trigger evidence for all of M2.
  The six T-076 tickets created 2026-11-26 get no overnight check of their
  own, and T-076 closes on 2026-11-26.
- Owner's call, 2026-11-26: Freshdesk's email behaviour (notification
  emails to agents or the requester) is out of scope for now; no
  notification email was received for C4, C5 or C6.
- SPEC §13's M2 row already holds the settled wording (2026-11-26);
  unchanged.
- No code change: `6c31811` (this file, PLAN's T-076 row), then the
  handoff commit (HANDOFF, this file's review fixes).
- The `account-patterns` commit hook passed on `6c31811`; `make quality`
  exit 0 (counts in HANDOFF's "Checkpoint").

## Dead ends
none

## Open doubts
- C6's assignment PUT set the group and agent the ticket already had, so
  its activity log has no assignment entry: the run shows the PUT accepted
  (200), not an assignment that changed a value.

## Context pressure
low

## Next action
Only if the status is still `doing`: the exact first step for the next
session.
