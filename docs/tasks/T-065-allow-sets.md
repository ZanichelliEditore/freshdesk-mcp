# T-065 — Per-tool allow sets: `ticketInput` with a required allow set

- **Type:** build
- **Phase:** M2
- **Status:** todo
- **Depends on:** T-064
- **Created:** 2026-11-25

## Goal
The core holds the RFC's OD-2 table of writable fields, keyed by write entry point, and `ticketInput` takes one of its sets with no default: a field outside the set is refused per field as `field_not_writable`, nothing built.

## In scope
- `src/core/allow-sets.ts`: the four sets of the RFC's OD-2 table (`update_ticket`, `categorize_tickets`, `hand_off_draft`, `add_note`); default fields fail closed, custom fields all writable for `update_ticket` and `categorize_tickets` (owner, 2026-11-25).
- `ticketInput(schema, input, allow)`: `allow` required (like `readCursor`'s `maxPosition`, T-053); a new code `field_not_writable` whose message names the fields the set allows.
- Existing `ticketInput` tests re-pointed to pass a set.

## Out of scope
- Agent and group by name (T-041).
- Who receives which set (T-068).

## Spec sections to read
- SPEC.md §7.3
- SPEC.md §8.2 (`write` table)
- RFC `2026-11-25-write-safety-core`, Decision, OD-2

## Files expected to change
- `src/core/allow-sets.ts` (new)
- `src/schema/input.ts`
- `test/schema/input.test.ts`
- `test/core/allow-sets.test.ts` (new)

## Wireframes
`none`

## Acceptance
`test/core/allow-sets.test.ts`: the four sets equal the RFC's OD-2 table; `test/schema/input.test.ts`: per set, an allowed field is built, a field outside it gives `field_not_writable` naming the set's fields and nothing is built; `product`, `requester`, `subject`, `description`, `source` and `due_by` are refused by every set; `add_note`'s empty set refuses every field, custom included; `categorize_tickets`' set refuses status, priority, group and agent and takes any custom field; a call without a set, or with a set not in the table, throws `TypeError`; `make quality` green.

No split point: one module, one signature, its tests.

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
