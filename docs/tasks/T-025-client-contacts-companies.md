# T-025 — Client resources: contact and company (read one)

- **Type:** build
- **Phase:** M1
- **Status:** doing (2026-11-24)
- **Depends on:** T-013
- **Created:** 2026-11-23

## Goal
`getContact(id)` and `getCompany(id)` for `get_ticket`'s requester block.

## In scope
- Only name, email and company id of a contact, id and name of a company are
  kept: the schema drops the rest (phone, address, other personal data).
- Two resource families in one task, one read each: a deliberate exception
  to SPEC §14.1, noted in PLAN. It runs after T-023 by order only.

## Out of scope
- Lists, search, writes (`contacts`, `companies` toolsets, M5+).

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §7.1

## Files expected to change
- `src/client/resources/contacts.ts`, `companies.ts`
- `test/client/resources/contacts-companies.test.ts`

## Wireframes
`none`

## Acceptance
`test/client/resources/contacts-companies.test.ts` (MockAgent): each returns
the fixture's asserted values; a contact's phone, mobile and address are
absent from the returned object; a contact with no company gives
`company_id: null`; a 404 is `not_found`; a malformed body is `server`;
`make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
