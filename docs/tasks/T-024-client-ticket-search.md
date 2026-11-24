# T-024 — Client resource: ticket search

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-24)
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
- Commits: `28e63be` (status), `83ca905` (resource, tests, overview), the
  close commit `T-024: review fixes, done` (review fixes, docs, this file).
- `src/client/resources/search.ts`: `searchTickets(http, query, page = 1,
  deadline?)`, one `GET /search/tickets` through `requestWithRetry`, cost
  `cheap`; the conditions put in double quotes, percent-encoded by
  `URLSearchParams`; returns `results`, `total` and `attempts`. The ticket
  zod schema is now exported from `tickets.ts` and reused.
- Tests, `test/client/resources/search.test.ts`:
  - `searchTickets: the request::sends the query in double quotes,
    percent-encoded, a space as +, page 1 by default` (asserted URL),
    `::sends a non-ASCII character UTF-8 percent-encoded` (asserted URL),
    `::sends page %s as given` (1, 10), `::accepts a query of 512
    characters once quoted`, `::counts a character outside the BMP as two
    UTF-16 units: 255 of them fit`, `::refuses 256 characters outside the
    BMP (514 units quoted) with nothing sent`;
  - `searchTickets: the result::returns results and total, and the
    attempts` (asserted values), `::returns a total over 300 as Freshdesk
    gave it`, `::returns no matches as an empty list`, `::counts a retried
    request in attempts`;
  - `searchTickets: values refused before sending::refuses page %s with
    nothing sent` (0, 11, 1.5, NaN, a string, null), `::refuses a query %s
    with nothing sent` (513 quoted, 5000, empty, blank, a double quote, a
    backslash, a number, an array, undefined), `::names the parameter,
    never the value`;
  - `searchTickets: Freshdesk's answers::passes a 400's errors[] through as
    validation`, `::refuses %s as server, with no body text` (seven
    shapes, the canary absent).
- Failed first: the whole file at import (no module). In the review pass,
  the backslash row failed with the check taken out; the non-BMP and
  non-ASCII tests passed at once (they pin existing behaviour); the BMP
  test first failed on a test mistake (an accepted call in the same test
  counted against "nothing sent"), split in two.
- Choices: the caller gives bare conditions and the module adds the double
  quotes; the 512 limit counts both quotes, in UTF-16 units (never fewer
  than characters); a query with `"` or `\` and a blank one are refused;
  the signature is the task's `(query, page)`; no `has_more` (the tools
  work it out from `total` and the page).
- Review (full round, 2026-11-24): no blocking findings; applied the
  backslash refusal, the `ticket-queries.md` notes for T-043 (quoting) and
  T-036/T-037 (cost argument), and the non-BMP and non-ASCII tests. No
  scoped round needed.
- Acceptance: every line met; `make quality` green.

## Dead ends
none

## Open doubts
- Whether Freshdesk counts the two quotes in its 512-character limit: the
  cautious reading (counted) is taken; not probed.
- Cost class: search and list send `cheap`; the optional cost argument is
  pending T-036/T-037 (`ticket-queries.md`, "Cost class for the limiter").

## Context pressure
Low: one builder session, files read by range.

## Next action
none: done.
