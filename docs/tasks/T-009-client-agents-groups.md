# T-009 — Client resources: agents and groups (read)

- **Type:** build
- **Phase:** M0
- **Status:** todo
- **Depends on:** T-008
- **Created:** 2026-11-20

## Goal
Typed, runtime-validated lists of agents and groups, paged, for id → name mapping.

## In scope
- `src/client/resources/agents.ts`, `groups.ts`: zod schemas, list functions over the pagination iterator.
- Synthetic fixtures (invented names, `example.com`).

## Out of scope
- Writes on these resources.
- Mapping logic (T-010).

## Spec sections to read
- SPEC.md §7.3
- SPEC.md §8.3

## Files expected to change
- `src/client/resources/{agents,groups}.ts`
- `test/client/resources/{agents,groups}.test.ts`
- `test/fixtures/`

## Wireframes
`none`

## Acceptance
MockAgent tests list agents and groups across 2+ pages with the expected id → name values; a malformed item fails with a defined error; `make quality` green.

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
