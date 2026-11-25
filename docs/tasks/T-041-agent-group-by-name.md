# T-041 — `ticketInput`: agent and group by name or id

- **Type:** build
- **Phase:** M2
- **Status:** todo (2026-11-25)
- **Depends on:** T-065; OD-4 (answered 2026-11-24)
- **Created:** 2026-11-25

## Goal
`ticketInput` takes the default agent and group fields by name or by an id among their `choices` record, instead of refusing them as `unsupported_field`. OD-4 was measured by the owner's smoke run of 2026-11-24 (`docs/private/account-facts.md`, no value quoted): `default_agent` and `default_group` carry a name → id record; `default_product` is absent from the account.

## In scope
- Agent and group handled like priority and source: an exact or folded name, or an id among the record's values.
- A name two ids share is refused listing both; an unknown name refused listing the valid ones (clipped as other choice lists).
- The fixture `test/fixtures/schema.ts` carries a synthetic name → id record for both (`docs/improvements.md` `92e6b40`).

## Out of scope
- `product`: absent on the account and in no allow set; it stays refused.
- The `null` clearing branch noted in `92e6b40` (parked).

## Spec sections to read
- SPEC.md §7.3
- RFC `2026-11-25-write-safety-core`, Decision, OD-2

## Files expected to change
- `src/schema/input.ts`
- `test/fixtures/schema.ts`
- `test/schema/input.test.ts`

## Wireframes
`none`

## Acceptance
`test/schema/input.test.ts`: agent and group given by exact name, folded name, or an id among the choices are built as that id; a name two ids share is refused listing both ids; an unknown name or id is refused listing valid names; `product` is still refused; the input.ts header no longer says agent and group are unsupported; `make quality` green.

No split point.

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
