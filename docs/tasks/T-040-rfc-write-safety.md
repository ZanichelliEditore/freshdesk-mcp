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
