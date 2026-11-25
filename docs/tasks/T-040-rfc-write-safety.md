# T-040 — RFC: does the first write tool need a safety core; per-tool writable fields

- **Type:** plan
- **Phase:** M2
- **Status:** done (2026-11-25)
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
- RFC `docs/rfc/active/2026-11-25-write-safety-core.md`, Status Active
  (owner, 2026-11-25), moved by `make rfc-sync`. Drafted in `a9b7aa9`,
  `c928102` and `6c8d615`; accepted in this handoff's commit.
- OD-3: a small safety core, the write path (invariants 1 to 6). OD-2: a
  fixed per-tool table of writable fields in the core. Each with the
  alternatives rejected ("Alternatives considered").
- Owner's decisions (2026-11-25), in the RFC's "The owner's decisions":
  public notes (`add_note` `private: false`) move to `send` (M3), so
  `write` notes are private only; every custom field writable by
  `update_ticket` and `categorize_tickets`, default `product` in no set;
  Resolved and Closed allowed in `update_ticket`, its description saying
  Freshdesk may email the requester; "C8 (new tickets)" means
  categorising newly arrived tickets, no create tool in M2.
- Applied on acceptance (task file "Files expected to change", RFC
  "Consequences"): AGENTS.md rule 1 and SPEC §9 name the write path;
  `.claude/commands/decompose.md` step 4 too. T-064's acceptance line
  amended (RFC acceptance, decompose step 6 exception).
- `rfc-reviewer`: full and scoped rounds, resolved in the RFC ("Review");
  no third round for the owner's decisions (rule 9).
- PLAN: `proposed` rows T-064 (the write path) and T-065 (allow sets),
  sized by `/decompose M2`; OD-2 and OD-3 answered.

## Dead ends
none

## Open doubts
- M2's SPEC §13 wording: the time-trigger clause waits on the owner's
  activity-log check (2026-11-26): as proposed, or option (a) or (b);
  settled before M2's first real test.
- SPEC changes the decisions imply, left for `/decompose M2`: §8.2 and
  §9's `add_note` rows (private only in `write`, public notes in `send`),
  §8.2's `update_ticket` purpose (Resolved and Closed may notify the
  requester).

## Context pressure
ok

## Next action
`/decompose M2`, on the owner's go. Before M2's first real test: the
owner's time-trigger check (2026-11-26) and the §13 wording.
