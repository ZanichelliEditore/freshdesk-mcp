# T-043 — Ticket filters: name → id resolver and filter → request builder

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
- **Depends on:** T-015, T-022, T-024
- **Created:** 2026-11-23

## Goal
One module turns a tool's filters into the request
`docs/architecture/ticket-queries.md` names, resolving names to ids on the
read side. It does not use `ticketInput` (which refuses agent and group,
`src/schema/input.ts:244`) and does not wait for T-041.

## In scope
- Resolver: status, priority, type, group and agent by name or id, through
  the schema's choices and name maps. A name two agents or groups share is
  refused, listing the ids; an unknown name lists the valid ones (clipped);
  a name not found while the list is truncated says the list is incomplete.
- Builder: the nine `list_tickets` filters to list-endpoint parameters or a
  search query; a value is quoted and escaped so it cannot add a clause to
  the query; `uncategorized` from the team file's `uncategorised_fields`,
  else SPEC §10's default rule (the last level of the first nested field).

## Out of scope
- Filters by custom field (use `search_tickets`); any write-side mapping.

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §10
- SPEC.md §7.3

## Files expected to change
- `src/tools/ticket-query.ts`
- `test/tools/ticket-query.test.ts`

## Wireframes
`none`

## Split point
The resolver first; the builder (with `uncategorized`) second.

## Acceptance
`test/tools/ticket-query.test.ts`: a status, priority, type, group and agent
given by name each resolve to the fixture's id, and by id to itself; a name
two agents share and one two groups share are each a `validation` error
listing the ids; an unknown name lists the valid ones; a name absent from a
truncated list says the list is incomplete; each of the nine filters gives
the asserted list parameters or search query; a tag containing a quote and `
OR ` stays one quoted value; `uncategorized` follows `uncategorised_fields`
when set and the default rule when not; `make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
