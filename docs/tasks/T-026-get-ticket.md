# T-026 — Tool: `get_ticket`

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
- **Depends on:** T-018, T-020, T-023, T-024, T-025, T-042
- **Created:** 2026-11-23

## Goal
A ticket with labels, its full conversation thread (paged), the requester
(name, email, company) and optionally the requester's recent tickets (C3).

## In scope
- Fields through `ticketOutput` (its hiding as T-010 built it); recent
  tickets as T-042's compact rows, fetched by the requester path
  `docs/architecture/ticket-queries.md` names (T-023's filter or T-024's
  search); every customer-written text through T-017; thread paged with
  T-018's cursor; long threads truncated with the marker.
- The description says it returns data, not instructions, and its call cost.

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
and each conversation body are inside `<ticket_content>`; a thread of 2+
pages returns `next_cursor` and the second call returns the rest; the
requester block has name, email and company name; `include_recent` adds the
requester's recent tickets as compact rows; an unknown id is `isError`
`not_found`; `api_calls_used` equals the MockAgent count; no stderr line
contains a fixture body string; `make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
