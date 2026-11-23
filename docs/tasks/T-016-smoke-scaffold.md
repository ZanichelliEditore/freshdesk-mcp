# T-016 — Smoke script: read-only by construction, schema shape report

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
- **Depends on:** T-015
- **Created:** 2026-11-23

## Goal
A manual script the owner runs against the real account (SPEC §11): it can
only send GET, and its first report gives the shape of `/ticket_fields`,
`/agents` and `/groups` without any account value. Its run answers OD-4 and
the doubt "schemas follow the API v2 docs, not a live account".

## In scope
- A wrapper around `HttpClient` that refuses any method but GET before
  anything is sent.
- `schema` report: per default field and per custom-field type, the shape of
  `choices` (list, name → id record, id → names record, tree depth) and
  counts; whether the zod schemas of T-008/T-009 accepted the payloads. No
  label, name, id or choice value in the output.
- `make smoke` target with a one-line description; reads the same env as the
  server.
- The session does not run it (SPEC §14 rule 1). The owner runs it and keeps
  the output in the gitignored `docs/private/account-facts.md`; the tracked
  task file records shapes only.

## Out of scope
- Tool-level smoke (T-039).
- Any fix to `ticketInput` (T-041).

## Spec sections to read
- SPEC.md §11
- SPEC.md §14
- SPEC.md §7.3

## Files expected to change
- `scripts/smoke.ts` (or a `smoke` subcommand, builder says which)
- `Makefile`
- `test/smoke.test.ts`
- `test/fixtures/ticket-fields.ts` (a variant with name → id `choices` on
  agent, group, product)

## Wireframes
`none`

## Acceptance
`test/smoke.test.ts` (MockAgent): a POST, PUT and DELETE through the smoke
client are each refused with no request sent; on a fixture whose
`default_agent`, `default_group` and `default_product` carry a name → id
`choices` record the report says so, and on the current fixture it says they
carry none; no label, name or choice value of the fixture appears in the
output; a payload the zod schema refuses is reported as refused, exit
non-zero; `make help` lists `smoke`; `make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
