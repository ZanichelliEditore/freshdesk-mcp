# T-023 — Client resource: tickets (list, get, conversations)

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-24)
- **Depends on:** T-022
- **Created:** 2026-11-23

## Goal
`src/client/resources/tickets.ts`: typed reads of tickets and their
conversations, with the parameters T-022 chose.

## In scope
- `listTickets` (one page and whether another exists; its parameters are the
  ones `docs/architecture/ticket-queries.md` lists, the requester filter
  included, not a list fixed here), `getTicket` (with includes),
  `listConversations` (paged to a cap, `truncated`).
- zod schemas pass unknown keys through, as T-008/T-009; synthetic fixtures
  only.

## Out of scope
- Search (T-024); any write.

## Spec sections to read
- SPEC.md §7.1
- SPEC.md §5

## Files expected to change
- `src/client/resources/tickets.ts`
- `test/client/resources/tickets.test.ts`
- `test/fixtures/tickets.ts`

## Wireframes
`none`

## Split point
`listTickets` and `getTicket` first; `listConversations` second.

## Acceptance
`test/client/resources/tickets.test.ts` (MockAgent): `listTickets` sends
each parameter `docs/architecture/ticket-queries.md` lists for the list
endpoint (one asserted request per parameter, the requester filter among
them) and returns the fixture's tickets (asserted values) and whether a next
page exists; `getTicket` returns default and custom fields;
`listConversations` follows 2+ pages and stops at its cap with `truncated:
true`; a malformed item fails as `server` with a message quoting nothing
from the body; a 404 is `not_found`; `make quality` green.

---
*Filled at `/handoff`:*

## Done
- Commits: `b5f7d8a` (status), `5346360` (resource, tests, fixture,
  overview), the close commit `T-023: review fixes, done` (review fixes,
  this file).
- `src/client/resources/tickets.ts`: `listTickets` (one page of
  `GET /tickets` through `paginate`, `has_more` from `Link`; `per_page`,
  100 unless given, and only the other parameters given, field by field),
  `getTicket` (`include=stats` only), `listConversations` (through
  `list-all.ts`, which now takes path `params`; 10 pages of 100, then
  `truncated`). Each success carries `attempts` for `api_calls_used`.
- Tests, `test/client/resources/tickets.test.ts`:
  - `listTickets: the parameters of docs/architecture/ticket-queries.md`:
    one asserted request per parameter (`per_page`, `page`,
    `updated_since`, `order_by`, `order_type`, `include`, `requester_id`,
    `company_id`), no options sends `per_page=100` only;
  - `listTickets: the page`: the fixture's tickets by value, `has_more`
    with and without `Link`, `attempts` with a retry;
  - `listTickets: values refused before sending`: each kind refused as
    `validation`, MockAgent count 0; a cast's `status`/`email` not sent;
  - `listTickets: a malformed item`, `getTicket::refuses a malformed ticket
    as server, with no body text`, `listConversations::refuses a malformed
    entry on page 2 as server, with no body text`: fixed message, the
    canary absent;
  - `getTicket::returns default and custom fields`, `::returns a 404 as
    not_found`, `::refuses any other include, given through a cast, with
    nothing sent`, `::refuses the id %s with nothing sent`;
  - `listConversations::follows two pages and returns every entry, the
    thread whole`, `::stops at its cap of 10 pages with truncated: true`,
    `::returns a 404 as not_found`.
- Failed first: the whole file at import (no module), then "counts a
  retried page in attempts" (a test mistake: a 429 without `Retry-After`
  made the limiter refuse the retry; a 503 used instead). In the review
  pass the 21 refusal tests failed before the checks existed; the cast-keys
  test passed at once (the query was already built field by field).
- Choices: `has_more` is `paginate`'s `truncated` with a one-page cap; a
  malformed item fails the whole page (as agents and groups); `attempts`
  on success only (as `listAll`); a refusal names the parameter, never the
  value.
- Review decision (full round, 2026-11-24): `TicketInclude` narrowed to
  `stats`, others refused at runtime; a requester's or company's data
  comes from T-025's contact and company reads, which drop phone, mobile
  and address. Also from the round: the value checks before sending, the
  cast-keys test, canaries in two malformed bodies, `list-all.ts` header.
- Acceptance: every line met; `make quality` green.

## Dead ends
none

## Open doubts
none

## Context pressure
Low: one builder session, files read by range.

## Next action
none: done.
