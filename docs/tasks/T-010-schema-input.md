# T-010 — Schema service: input mapping + nested-choice validation

- **Type:** build
- **Phase:** M0
- **Status:** todo
- **Depends on:** T-009
- **Created:** 2026-11-20

## Goal
Tools can pass labels or API names; values are validated against choices, nested levels included, with an error listing the valid choices.

## In scope
- Accept field label or API name; accept value label.
- Nested path `"A > B > C"` resolves to the three API fields.
- Invalid choice → `validation` error listing valid choices at the failing level.

## Out of scope
- Any tool using it (M1/M2).

## Spec sections to read
- SPEC.md §7.3

## Files expected to change
- `src/schema/input.ts`, `test/schema/input.test.ts`

## Wireframes
`none`

## Acceptance
`test/schema/input.test.ts` covers label and API-name inputs, a 3-level nested path, an invalid choice at each level; `make quality` green; **M0 done:** CI run on this commit observed green, URL in HANDOFF.

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
