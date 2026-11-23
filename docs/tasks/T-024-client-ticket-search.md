# T-024 — Client resource: ticket search

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
- **Depends on:** T-022
- **Created:** 2026-11-23

## Goal
`searchTickets(query, page)` over `/search/tickets`, with its documented
limits enforced before a request is sent.

## In scope
- Query quoting and encoding as the API asks; `results` and `total`
  returned; pages 1 to 10 only.
- Cost class (`cheap` or `expensive`) as T-022 says.

## Out of scope
- Building queries from filters (T-043); the tool (T-028).

## Spec sections to read
- SPEC.md §5
- SPEC.md §7.1
- SPEC.md §7.2

## Files expected to change
- `src/client/resources/search.ts`
- `test/client/resources/search.test.ts`

## Wireframes
`none`

## Acceptance
`test/client/resources/search.test.ts` (MockAgent): the request carries the
query quoted and percent-encoded (asserted URL); `results` and `total` come
back with asserted values; page 11 and a query over the documented length
are each refused with no request sent; a 400 passes Freshdesk's `errors[]`
through as `validation`; a malformed body is `server`; `make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
