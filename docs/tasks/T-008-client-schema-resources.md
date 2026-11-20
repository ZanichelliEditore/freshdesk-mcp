# T-008 — Client resources: ticket fields, agents, groups (read)

- **Type:** build
- **Phase:** M0
- **Status:** todo
- **Depends on:** T-007
- **Created:** 2026-11-20

## Goal
Typed read/list functions for `ticket_fields`, `agents` and `groups`, the data the schema service needs.

## In scope
- `src/client/resources/ticket-fields.ts`, `agents.ts`, `groups.ts`: typed responses, list via the pagination iterator.
- Synthetic fixtures, including a nested field with three levels and invented names.

## Out of scope
- Writes on these resources.
- Mapping logic (T-009).

## Spec sections to read
- SPEC.md §7.3
- SPEC.md §8.3

## Files expected to change
- `src/client/resources/{ticket-fields,agents,groups}.ts`
- `test/client/resources/*.test.ts`
- `test/fixtures/`

## Wireframes
`none`

## Split point
After `ticket-fields`: agents + groups become their own task.

## Acceptance
MockAgent tests parse synthetic payloads into the typed shapes (3-level nested field included) and list agents/groups across pages; `make quality` green.

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
