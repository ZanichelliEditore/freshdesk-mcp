# T-025 — Client resources: contact and company (read one)

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-24)
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
- Commits: `f36b597` (status), `2d57a78` (resources, tests, overview), the
  close commit `T-025: review Lows, done` (review fixes, this file).
- `src/client/resources/contacts.ts`: `getContact(http, id, deadline?)`, one
  `GET /contacts/{id}` through `requestWithRetry`; returns `{name, email,
  company_id}` and `attempts`. `src/client/resources/companies.ts`:
  `getCompany(http, id, deadline?)`, one `GET /companies/{id}`; returns
  `{id, name}` and `attempts`. Both a fixed allow-list built field by field
  (`z.object` strips, then the object is rebuilt), not a pass-through.
- Tests, `test/client/resources/contacts-companies.test.ts`:
  - `getContact::returns name, email and company id, and nothing else`
    (the synthetic fixture carries phone, mobile, address, twitter_id,
    other_emails, custom_fields and more; whole object and exact keys
    asserted, none of their values in the result), `::gives company_id:
    null for a contact with no company`, `::gives company_id: null when the
    key is missing`, `::gives email: null for a contact with no email (a
    phone-only contact)`, `::refuses the id %s with nothing sent` (0, -1,
    1.5, NaN, 2^53, a string), `::passes the deadline on: one already
    passed sends nothing and is network`, `::returns a 404 as not_found`
    (`http_status: 404`, `retryable: false`), `::refuses %s as server, with
    no body text` (seven shapes, a missing `email` key among them, the
    canary absent);
  - `getCompany::returns id and name, and nothing else`, `::refuses the id
    %s with nothing sent`, `::passes the deadline on: one already passed
    sends nothing and is network`, `::returns a 404 as not_found`,
    `::refuses %s as server, with no body text` (five shapes).
- Failed first: the whole file at import (no modules). In the review pass
  the new tests pin existing behaviour and passed at once; checked by
  mutation: dropping the deadline argument fails both deadline tests,
  making `email` optional fails the missing-`email` row (restored).
- Choices: the contact carries no `id` (the task's "only name, email and
  company id"; the caller has it); `email` may be null (a phone-only
  contact) but a missing `email` key is `server` (Freshdesk always sends
  it); `company_id` null when null or missing; the company's returned `id`
  is not compared with the one asked for; fixtures inline in the test file.
- Review (full round, 2026-11-24): security none, compliance Wireframes
  `none`, code 3 Low, all applied (deadline tests, missing-`email` line and
  row, 404 status and retryable asserted). No scoped round needed.
- Acceptance: every line met; `make quality` green.

## Dead ends
none

## Open doubts
- `name`, `email` and the company `name` come back raw, as Freshdesk sent
  them: T-026 must clean and wrap them (`<ticket_content>`) before output.
- T-026 should skip `getCompany` when `company_id` is null (no call to make).

## Context pressure
Low: one builder session, files read by range.

## Next action
none: done.
