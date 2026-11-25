# T-041 — `ticketInput`: agent and group by name or id

- **Type:** build
- **Phase:** M2
- **Status:** done (2026-11-25)
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
- `2ccf988`: agent and group join priority and source in `idValue`
  (`src/schema/input.ts`); the fixture's synthetic name → id choices
  (`test/fixtures/schema.ts`); header and `docs/architecture/overview.md`.
- `b80b69a`: review fixes. A truncated agents or groups list refuses a
  name as `incomplete_list`; an exact name refused when the list holds
  another id folding alike; stale `src/tools/ticket-query.ts` comment.
- Tests: `test/schema/input.test.ts` "ticketInput: agent and group" (exact,
  folded, id, unknown name or id, non-number id, shared name by fold and by
  list for both fields, truncated list for both, clipping, no choices,
  `product` still `unsupported_field`), and "ticketInput: allow sets"
  "hand_off_draft: takes agent and group by name, built as their ids".

## Dead ends
none

## Open doubts
- The list check assumes `/ticket_fields` agent and group choice keys fold
  equal to `/agents` `contact.name` and `/groups` `name`. Not measured; if
  they differ, two agents of one name go unseen (`docs/improvements.md`,
  `b80b69a` entry). A comparison on the account (owner) settles it.
- An agent or group with no choices now takes no id (before: passed
  through). OD-4 says the account has choices for both.
- `incomplete_list` is a new per-field code in `ticketInput`; SPEC §7.3
  names no code list.

## Context pressure
ok

## Next action
none (done).
