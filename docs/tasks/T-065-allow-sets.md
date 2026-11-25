# T-065 — Per-tool allow sets: `ticketInput` with a required allow set

- **Type:** build
- **Phase:** M2
- **Status:** done (2026-11-25)
- **Depends on:** T-064
- **Created:** 2026-11-25

## Goal
The core holds the RFC's OD-2 table of writable fields, keyed by write entry point, and `ticketInput` takes one of its sets with no default: a field outside the set is refused per field as `field_not_writable`, nothing built.

## In scope
- `src/core/allow-sets.ts`: the four sets of the RFC's OD-2 table (`update_ticket`, `categorize_tickets`, `hand_off_draft`, `add_note`); default fields fail closed, custom fields all writable for `update_ticket` and `categorize_tickets` (owner, 2026-11-25).
- `ticketInput(schema, input, allow)`: `allow` a plain field set, required, so `src/schema` does not import `src/core` (like `readCursor`'s `maxPosition`, T-053); a new code `field_not_writable` whose message names the fields the set allows.
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
`test/core/allow-sets.test.ts`: the four sets equal the RFC's OD-2 table; `test/schema/input.test.ts`: per set, an allowed field is built, a field outside it gives `field_not_writable` naming the set's fields and nothing is built; `product`, `requester`, `subject`, `description`, `source` and `due_by` are refused by every set; `add_note`'s empty set refuses every field, custom included; `categorize_tickets`' set refuses status, priority, group and agent and takes any custom field; a call without a set throws `TypeError` (`ticketInput` takes a plain field set and does not import `src/core`); in `test/core/allow-sets.test.ts`, the core's lookup of an entry point not in the table throws `TypeError`; `make quality` green.

No split point: one module, one signature, its tests.

---
*Filled at `/handoff`:*

## Done
- `75ca50f`: `src/core/allow-sets.ts` (`allowSet`, `AllowSet`, `WriteEntry`),
  `ticketInput(schema, input, allow: FieldSet)` and `field_not_writable` in
  `src/schema/input.ts`. Tests: `test/core/allow-sets.test.ts` (the four sets
  equal OD-2; frozen; unknown entry and prototype keys throw `TypeError`);
  `test/schema/input.test.ts` "ticketInput: allow sets" (per set allowed /
  refused naming the set; the six never-fields; `add_note` refuses every
  field; `categorize_tickets` refuses status, priority, group, agent and takes
  any custom field; no set throws `TypeError`; input.ts does not import
  `../core/`). Existing tests pass the fixture-wide set `ALL`.
- `88763d2`: review fixes (overview.md entries; test tidy-ups).
- Mutation check: with the allow check neutered, 16 tests of
  `test/schema/input.test.ts` fail.
- `make quality`: Vitest 2826 passed; `tools/checks` 138 OK.

## Dead ends
none

## Open doubts
- Default fields are keyed by API name as `/ticket_fields` gives it
  (`agent`, `group`, `ticket_type`), the names output.ts's `TICKET_KEY`
  assumes. A schema naming them otherwise (`responder_id`, as one fixture
  does) would refuse agent and group: fail closed, but T-076's first real
  run should confirm the names.
- `tags` is a flag on `AllowSet`, not a `ticketInput` field: Freshdesk's
  `/ticket_fields` has no tags field; T-068's `update_ticket` entry reads it.

## Context pressure
low
