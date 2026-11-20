# T-008 — Client resource: ticket fields (read)

- **Type:** build
- **Phase:** M0
- **Status:** todo
- **Depends on:** T-007
- **Created:** 2026-11-20

## Goal
A typed, runtime-validated read of `GET /ticket_fields`, nested fields included.

## In scope
- `src/client/resources/ticket-fields.ts`: zod schema for the response (unknown keys passed through), list function.
- Synthetic fixtures with invented names, including a nested field with three levels.

## Out of scope
- Agents, groups (T-009).
- Mapping logic (T-010).

## Spec sections to read
- SPEC.md §7.3
- SPEC.md §8.3

## Files expected to change
- `src/client/resources/ticket-fields.ts`
- `test/client/resources/ticket-fields.test.ts`
- `test/fixtures/`

## Wireframes
`none`

## Acceptance
`test/client/resources/ticket-fields.test.ts` (MockAgent): the synthetic payload yields the expected field labels and the 3-level choice tree (asserted values, not just types); a malformed payload fails with a defined error; `make quality` green.

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
