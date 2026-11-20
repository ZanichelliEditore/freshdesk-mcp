# T-010 — Schema service: load, TTL cache, output mapping

- **Type:** build
- **Phase:** M0
- **Status:** todo
- **Depends on:** T-004, T-009
- **Created:** 2026-11-20

## Goal
`src/schema/` loads fields, agents and groups once per TTL and turns raw ticket values into labelled output.

## In scope
- Cache with TTL from config; one load per TTL.
- Output `{label: value_label}`; status, priority, source, agent, group as names.
- Hidden fields from team config left out.
- Requester as a name is **not** in scope (needs contacts; M1). Untrusted-content wrapping (§7.4) of free-text fields is M1's `format.ts`, not this.

## Out of scope
- Input mapping (T-011).
- Untrusted-content wrapping (M1).

## Spec sections to read
- SPEC.md §7.3
- SPEC.md §8.4

## Files expected to change
- `src/schema/index.ts`, `src/schema/output.ts`
- `test/schema/output.test.ts`

## Wireframes
`none`

## Acceptance
`test/schema/output.test.ts`: one fetch per TTL (MockAgent count), refetch after TTL (fake clock); raw ticket → labelled output with names; hidden fields absent; `make quality` green.

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
