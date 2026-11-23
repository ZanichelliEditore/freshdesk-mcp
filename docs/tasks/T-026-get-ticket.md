# T-026 — Tool: `get_ticket`

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
- **Depends on:** T-018, T-020, T-023, T-024, T-025, T-042, T-053
- **Created:** 2026-11-23

## Goal
A ticket with labels, its full conversation thread (paged), the requester
(name, email, company) and optionally the requester's recent tickets (C3).

## In scope
- Fields through `ticketOutput` (its hiding as T-010 built it); recent
  tickets as T-042's compact rows, fetched by the requester path
  `docs/architecture/ticket-queries.md` names (T-023's filter or T-024's
  search); every customer-written text through T-017, each field value through `fieldValue` with its `TicketField` and each label key through `plainName` (`ticketOutput` does not wrap; T-017's open doubt); thread paged with
  T-018's cursor; long threads truncated with the marker.
- The description says it returns data, not instructions, and its call cost.
- Cursor (`/decompose`, 2026-11-23): before any request the tool calls `readCursor` with its JSON arguments and its own `maxPosition` (0 if it serves one page only), and gives `listEnvelope` the same arguments. Its input schema has no zod `default` or `transform`, so the arguments it parses are the ones sent (owner, 2026-11-23).

## Out of scope
- Attachments' content.

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §7.4
- SPEC.md §8.4

## Files expected to change
- `src/tools/toolsets/core/get-ticket.ts`
- `test/tools/core/get-ticket.test.ts`

## Wireframes
`none`

## Split point
Ticket, thread and requester first; `include_recent` second.

## Acceptance
`test/tools/core/get-ticket.test.ts` (in-memory client, MockAgent): fields
come back by label with names, a hidden field absent; subject, description
and each conversation body are inside `<ticket_content>`; a `custom_text` value is inside `<ticket_content>`, a validated dropdown value is not; a thread of 2+
pages returns `next_cursor` and the second call returns the rest; the
requester's name and company name are inside `<ticket_content>`, with the
email beside them; a field label used as a key and carrying an HTML tag
comes back without it (asserted); `include_recent` adds the requester's
recent tickets as compact rows; an unknown id is `isError` `not_found`; a cursor from another call and one past the tool's last position are each `isError` `validation` with the MockAgent count 0;
`api_calls_used` equals the MockAgent count; no stderr line contains a
fixture body string; `make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
