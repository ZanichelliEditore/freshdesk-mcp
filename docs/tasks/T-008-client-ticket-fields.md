# T-008 — Client resource: ticket fields (read)

- **Type:** build
- **Phase:** M0
- **Status:** done (2026-11-23)
- **Depends on:** T-007, T-012, T-013
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
- `58cbde7`: `src/client/resources/ticket-fields.ts` (`listTicketFields`, zod
  schema, unknown keys passed through), fixture
  `test/fixtures/ticket-fields.ts`,
  `test/client/resources/ticket-fields.test.ts`.
- `434c9f9` (review fixes): null `choices`/`nested_ticket_fields` accepted,
  empty `label` refused, 7 more malformed rows, `__proto__` pinning tests,
  line in `docs/architecture/overview.md`.
- Acceptance: `ticket-fields.test.ts::"sends one GET to /ticket_fields and
  yields every field's label in order"`, `::"yields the nested field's
  3-level choice tree and its level labels"`, `::"refuses %s as server, with
  the real status and no body text"` (15 rows); 25 tests in the file.
  `make quality` green on `434c9f9`: 387 vitest, 54 `tools/checks`.
- Hand mutant: loosening the third tree level to `z.unknown()` failed 2
  tests.

## Dead ends
none

## Open doubts
- A malformed body is `server` with the real status, not retryable, fixed
  message: builder's choice, accepted by the orchestrator for the owner on
  2026-11-23.
- The schema follows Freshdesk's API v2 documentation, not a live account:
  one odd field fails the whole list (fail-closed). Whether to check it
  against a live account is the owner's call.
- A `null` `choices` or `nested_ticket_fields` is kept as `null`, not
  turned into `undefined`, though the header says "taken as absent"
  (parked, `434c9f9`): T-010 must handle both.
- The first commit attempt was refused by the account-patterns hook: an
  invented field name in the fixture matched an account-value pattern. It
  was renamed before any commit (never committed, never pushed); the
  patterns file was not printed.

## Context pressure
ok
