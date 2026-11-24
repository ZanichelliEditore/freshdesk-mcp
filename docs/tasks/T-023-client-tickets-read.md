# T-023 — Client resource: tickets (list, get, conversations)

- **Type:** build
- **Phase:** M1
- **Status:** doing (2026-11-24)
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

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
