# T-036 — Tool: `count_tickets`

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
- **Depends on:** T-027, T-035, T-043, T-055
- **Created:** 2026-11-23

## Goal
Counts grouped by up to two fields over a period and a filter, aggregated in
code (C7).

## In scope
- Group keys are labels. Grouping is allowed only by a field whose type is a
  known closed one (number, boolean, date, a validated choice, status,
  priority, source, agent, group); any other field is refused as
  `validation` before a request is sent (orchestrator's fail-closed choice,
  2026-11-23, for the owner to confirm). Built on `ticketOutput` as it is:
  nothing about hidden fields is added or guaranteed here.
- Never a silent undercount: a source cut by a cap says so.

## Out of scope
- Charts, trends (Claude, or the export).

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §7.2
- SPEC.md §8.4

## Files expected to change
- `src/tools/toolsets/core/count-tickets.ts`
- `test/tools/core/count-tickets.test.ts`

## Wireframes
`none`

## Acceptance
`test/tools/core/count-tickets.test.ts`: fixture tickets over 2+ pages give
the asserted counts by one field and by two, keys as labels; a third field
is a `validation` error with no request; grouping by a free-text field, and
by a field of a type the code does not know, is each a `validation` error
with no request sent (asserted); an estimate over the budget is refused
without `confirm`; a source cut at a cap gives `truncated: true` beside the
counts; `api_calls_used` equals the MockAgent count; `make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
