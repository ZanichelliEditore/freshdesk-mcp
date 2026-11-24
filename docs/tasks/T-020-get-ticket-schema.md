# T-020 — Tool: `get_ticket_schema`

- **Type:** build
- **Phase:** M1
- **Status:** doing (2026-11-24)
- **Depends on:** T-017, T-019, T-047
- **Created:** 2026-11-23

## Goal
The first `core` tool: ticket fields with labels, types, choices (nested
tree) and team meanings (C1, C8).

## In scope
- Every field the schema has is listed: `hidden` is not applied here, hidden
  fields are not handled beyond `ticketOutput` for now (owner, 2026-11-23).
- Field labels and choice names through T-017's name helper (HTML stripped,
  length capped), not wrapped (owner, 2026-11-23).
- A long choice list is capped with a marker; the description says the call
  cost (cold and warm cache).
- After T-047: no tool ships without the 30 s deadline of a cold schema load
  (owner, 2026-11-23).

## Out of scope
- Hiding fields from this tool (parked, `docs/improvements.md`).

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §7.3
- SPEC.md §8.4

## Files expected to change
- `src/tools/toolsets/core/get-ticket-schema.ts`
- `src/tools/toolsets/core/index.ts`
- `test/tools/core/get-ticket-schema.test.ts`

## Wireframes
`none`

## Acceptance
`test/tools/core/get-ticket-schema.test.ts` (in-memory client, MockAgent):
the result has each fixture field's label, API name, type and choices, the
3-level field as a tree with asserted values, and the team `meaning`; a
label and a choice name carrying an HTML tag come back without it and capped
(asserted); a choice list over the cap is cut with the marker; a field the
team file marks `hidden` is listed like any other, since `hidden` is not
applied here (asserted, so a later change is a decision); a second call
within the TTL sends no request; a failed schema load returns its error code
as `isError` and the next call tries again; `readOnlyHint` is true; `make
quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
