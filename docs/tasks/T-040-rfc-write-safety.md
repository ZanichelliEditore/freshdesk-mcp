# T-040 — RFC: does the first write tool need a safety core; per-tool writable fields

- **Type:** plan
- **Phase:** M2
- **Status:** todo (2026-11-23)
- **Depends on:** none
- **Created:** 2026-11-23

## Goal
The decision AGENTS.md hard rule 1 and SPEC §9 ask for before the first
caller of a `write` tool, with the writable-fields question the T-011 review
left to the owner. First among the write tasks; it may be taken during M1,
preferably while M1 waits on an owner's run (owner, 2026-11-23).

## In scope
- OD-3: whether `ticketInput` plus the write tools need one governed path (a
  safety core), with the alternatives weighed against SPEC §4's "not too
  much security scaffolding".
- OD-2: a per-tool allow set of writable fields against SPEC §8.2's
  `update_ticket` list.
- Hidden fields on input are out: not handled for now (owner, 2026-11-23).
  The RFC says so in one line and does not decide it.
- `rfc-reviewer` on the draft; the owner accepts or rejects. If a safety
  core is adopted: `proposed` rows for it, before any write resource.

## Owner's evidence (2026-11-25)
From the owner's manual test on a test ticket tagged `mcp-test` in group
`MCP Test`, requester an internal contact, on the real account:

- Freshdesk's own spam filter marked the ticket as spam at creation (no
  automation rule involved); the owner restored it by hand. Relevant to C8
  (tickets created by the server): a created ticket can land in spam.
- Creation, a private note, adding the tag, and status changes
  Open→Pending→Open: the activity log shows no automation rule fired.
- The Default SLA Policy applied (group-based SLA policies do not filter
  by tag). Setting the status to Pending pauses the SLA timer (the due date
  shifted accordingly), so keeping test tickets Pending when idle avoids
  SLA escalations.
- Time triggers: not yet verified; the owner checks the activity log on
  2026-11-26.
- The owner cannot edit the dozens of automation rules. Proposed reading of
  M2's "automations confirmed to skip the tag first" (SPEC §13): "no
  automation rule acted on `mcp-test` tickets, confirmed by the activity log
  after each kind of write M2 performs". **For this RFC to take up:** the
  planning session did not change SPEC §13; the RFC proposes the wording and
  the owner accepts it.

## Out of scope
- Any code; the M2 decomposition (`/decompose M2`, after this).

## Spec sections to read
- SPEC.md §9
- SPEC.md §8.2
- SPEC.md §7.3

## Files expected to change
- `docs/rfc/proposed/` → `docs/rfc/active/`
- `docs/tasks/PLAN.md` (`proposed` rows only)
- `AGENTS.md` rule 1 and `SPEC.md` §9 only if the owner accepts a safety
  core

## Wireframes
`none`

## Acceptance
The RFC is in `docs/rfc/active/` after `make rfc-sync`, Status Active by the
owner's word; it answers OD-2 and OD-3, each with the alternatives rejected
and why; `rfc-reviewer`'s findings are resolved or dismissed in the RFC; if
it adopts a safety core, PLAN has the `proposed` rows that build it before
any write resource; `make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
