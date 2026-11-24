# T-026 — Tool: `get_ticket`

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-24)
- **Depends on:** T-018, T-020, T-023, T-024, T-025, T-042, T-053
- **Created:** 2026-11-23

## Goal
A ticket with labels, its full conversation thread (paged), the requester
(name, email, company) and optionally the requester's recent tickets (C3).

## In scope
- Fields through `ticketOutput` (its hiding as T-010 built it); recent
  tickets as T-042's compact rows, fetched by the requester path
  `docs/architecture/ticket-queries.md` names (T-023's filter or T-024's
  search); every customer-written text through T-017, each field value through `fieldValue` with its `TicketField` and each label key through `plainName` (`ticketOutput` does not wrap; T-017's open doubt); each value is matched to its own `TicketField`, never through its output label: T-026 either gives `ticketOutput` a per-field hook (then `src/schema/output.ts` is in its files) or maps the fields itself, and says which in "Done" (review of 2026-11-23); thread paged with
  T-018's cursor; long threads truncated with the marker.
- The description says it returns data, not instructions, and its call cost.
- Cursor (`/decompose`, 2026-11-23): before any request the tool calls `readCursor` with its JSON arguments and its own `maxPosition`, a named constant: 0 if it serves one page only, else its source's last page (e.g. `MAX_PAGES - 1`), never a larger number, and gives `listEnvelope` the same arguments. Its input schema has no zod `default` or `transform`, so the arguments it parses are the ones sent (owner, 2026-11-23).

## Out of scope
- Attachments' content.

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §7.4
- SPEC.md §8.4

## Files expected to change
- `src/schema/output.ts`, only if T-026 takes the per-field hook (In scope)
- `src/tools/toolsets/core/get-ticket.ts`
- `test/tools/core/get-ticket.test.ts`

## Wireframes
`none`

## Split point
Ticket, thread and requester first; `include_recent` second.

## Acceptance
`test/tools/core/get-ticket.test.ts` (in-memory client, MockAgent): fields
come back by label with names, a hidden field absent; subject, description
and each conversation body are inside `<ticket_content>`; a `custom_text` value is inside `<ticket_content>`, a validated dropdown value is not; with a `custom_text` field first and a validated dropdown with the same label after it, the text value comes back inside `<ticket_content>` and the dropdown value does not (both asserted); a `custom_fields` key no `TicketField` names is absent from the output; a thread of 2+
pages returns `next_cursor` and the second call returns the rest; the
requester's name and company name are inside `<ticket_content>`, with the
email beside them; a field label used as a key and carrying an HTML tag
comes back without it (asserted); `include_recent` adds the requester's
recent tickets as compact rows; an unknown id is `isError` `not_found`; a cursor from another call is `isError` `validation` with the MockAgent count 0; a cursor built over the arguments as sent, at the tool's `maxPosition`, is accepted, and one at `maxPosition` + 1 is `isError` `validation` with the message "points past the last position" and the MockAgent count 0; `grep -nF -e '.default(' -e '.transform('` over the tool's file prints nothing;
`api_calls_used` equals the MockAgent count with the schema cached, and on a cold schema it leaves out the schema's load, said in the description and pinned by a test (a recorded limitation until T-056); no stderr line contains a
fixture body string; `make quality` green.

---
*Filled at `/handoff`:*

## Done
- Commits: `12eae27` (status), `1bd817b` (the tool, its tests, the
  registration in `core/index.ts`, `test/server.test.ts`, overview),
  `ee2bde9` (full review fixes, with the orchestrator's amended acceptance
  in PLAN and here, and T-056's row and task file), the close commit
  `T-026: scoped list A fix (user_id hidden on every conversation), done`
  (the fix, three test-only additions, this file, PLAN, T-027's
  dependency, improvements, journal).
- `src/tools/toolsets/core/get-ticket.ts`: `getTicketTool`, input
  `{ticket_id, include_recent?, cursor?}`; exported constants
  `THREAD_PAGE` (10), `THREAD_CAP` (1000), `MAX_POSITION` (99), `BODY_CAP`
  (4000), `RECENT_COUNT` (10). `src/tools/rows.ts`: `isoUpdated` exported.
  No new entry in `eslint.tool-imports.json`.
- **Fields: through rows.ts's `ticketDetail`.** The tool neither gave
  `ticketOutput` a per-field hook nor mapped the fields itself:
  `ticketDetail` (T-042) already takes each field through `ticketOutput`
  alone and its value through `fieldValue` with its own `TicketField`.
  `src/schema/output.ts` is unchanged.
- Acceptance amended by the orchestrator (2026-11-24, in `ee2bde9`):
  `api_calls_used` equals the MockAgent count with the schema cached; on a
  cold schema it leaves out the schema's load, said in the description and
  pinned by a test, a recorded limitation until T-056.
- Tests, `test/tools/core/get-ticket.test.ts` (77), by describe block:
  - acceptance: `the fields::come back by label with names, a hidden field
    absent`, `::the subject and the description are inside
    <ticket_content>`, `::a custom_text value is inside <ticket_content>, a
    validated dropdown value is not`, `::two fields with one label: the
    text first is wrapped, the dropdown after it is not`, `::a
    custom_fields key no ticket field names is absent`, `::a label carrying
    HTML tags is a key without them`; `the requester::the name and the
    company name are inside <ticket_content>, the email beside them`; `the
    thread::each conversation body and address is inside <ticket_content>`,
    `::a thread of two pages gives next_cursor, and the second call returns
    the rest`; `include_recent::adds the requester's recent tickets as
    compact rows, this ticket left out`; `errors::an unknown id is isError
    not_found`; `the cursor::a cursor from another call is refused, nothing
    sent`, `::a cursor over the arguments as sent, at maxPosition, is
    accepted`, `::a cursor at maxPosition + 1 is refused, nothing sent`;
    `the listing::its input schema has no zod default or transform`;
    `api_calls_used::equals the MockAgent count, a retried request
    included`, `::on a cold schema it leaves out the schema's load, as the
    description says`; `stderr::no stderr line contains a fixture body
    string` (with a positive control);
  - beyond it: the listing and its numbers; an unlisted dropdown value
    wrapped; names that cannot close the block; plain and odd-shaped
    emails; the contact's company against the ticket's `company_id`; no
    company, no email; the hidden requester (no block, no recent tickets,
    `user_id` null on every conversation, no addresses, on cursor pages
    too), `::a hidden requester's id is absent even from a conversation
    marked incoming: false`, `::with the requester shown, each conversation
    keeps its user_id`; a schema lacking the requester or the company field
    with a hidden, an unhidden and no team key; the hidden company;
    `source`, addresses and attachment names with injected delimiters; the
    300 and `BODY_CAP` cuts; `created_at` forms; an HTML-only body; exactly
    one page, two Freshdesk pages, the 10-page cap, a cursor past the end;
    a foreign recent row, the `RECENT_COUNT` cut, no list request without
    the flag, a cursor with `include_recent`; contact, company and
    recent-tickets failures by part; a failed schema load with and without
    a cursor; invalid `ticket_id`s; a cursor call on a cold schema; the
    one 30 s deadline.
- Failed first:
  - `1bd817b`: the tool file was drafted before the test file (not
    test-first); the tests were then run before the tool was registered, 36
    failing (unknown tool). Seven passed there and so were not red-first:
    the constants, the source grep and the five invalid `ticket_id` cases.
    After registration 5 failed on the test's own mistakes (four request
    counts off by one, one HTML fixture whose closing tag was stripped as
    a tag), fixed in the test.
  - `ee2bde9`: tests changed first; 26 failed against the old code (the
    listing, the eight odd-shaped emails, the hidden-requester test, the
    four cases of a schema lacking a field, the conversation shape,
    source/addresses/attachments, the body cap, the four `created_at`
    forms, the foreign recent row, the three part errors, a failed schema
    load with a cursor). Passed at once, so pins: the three plain emails,
    the contact's company, neither field and nothing hidden, no
    `recent_tickets_unavailable` without the flag, the description not cut,
    the stderr positive control. One expectation was wrong (`&gt;` is not
    neutralised) and was fixed in the test.
  - close commit: 2 failed first (the hidden-requester test with `user_id`
    null on the outgoing entry, and the `incoming: false` test). The
    unhidden team key, the 300 cut and the cold cursor call passed at once
    (tests only, as asked).
- Choices: the thread is read whole on every call (`listConversations`)
  and cut locally, so a position is a page of 10 conversations and the
  last one is 99; a call with a cursor returns the envelope only; the
  output is `{ticket, requester?, recent_tickets?}` beside the flat list
  envelope; no `include=stats`; `source` is Freshdesk's number as sent, not
  mapped; `from` one wrapped string or `null`, `to`, `cc` and `attachments`
  arrays of wrapped strings cut at 300, `bcc` and attachment URLs not
  returned; the email plain only as `^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$`
  within 254 characters; recent tickets asked with `per_page=11`; a failed
  part keeps its code, status, `retryable` and `retry_after_s` and loses
  `errors[]`; one 30 s deadline from the call's start for its requests.
- Review: full round on the build commit `1bd817b`: compliance Wireframes `none`;
  security 2 Medium, 2 Low, 1 cost note; code 1 High (the gate: the
  `api_calls_used` clause), 2 Medium, Lows. The orchestrator's eleven
  decisions applied in `ee2bde9`, the acceptance amended and T-056 added.
  Scoped round on the fixes of `ee2bde9`: list A one item (security A1, code
  B1: a hidden requester's id on a conversation marked `incoming: false`),
  fixed in the close commit by the orchestrator's decision (`user_id` null
  on every conversation when the requester is hidden), not reviewed again;
  list B parked in `docs/improvements.md`, three of its items added as
  tests.
- Acceptance: every line (as amended) met; `make quality` green.

## Dead ends
none

## Open doubts
- The cold-schema gap: `api_calls_used` leaves out a cold schema load (7
  sent, 4 reported; on a cursor call 4 sent, 1 reported) until T-056.
- A conversation body cut at `BODY_CAP` cannot be fetched in full: the
  marker names no way to (SPEC §7.4 asks for one; parked).
- A hidden requester can still appear in a body, a subject or an
  attachment name; and a team key that is the field's localised label does
  not hide a field the schema lacks (parked).
- The email regex lets dotted words through unwrapped (parked).
- The schema load on any call, a cursor call included, does not take the
  call's deadline: a cold call can last the load's 30 s plus 30 s (parked).
- The to, cc and attachment counts per conversation are not capped
  (parked).
- A failed thread read on the first call is returned as is, without the
  "the ticket was read" wording the other parts have.
- Each cursor page re-reads the whole thread, 1 request per 100
  conversations (parked).
- That Freshdesk marks some of a requester's own entries `incoming: false`
  is the reviewers' statement, not measured here; the fix does not rest on
  it.

## Context pressure
Moderate: one builder session over three passes; the test file (about
1,100 lines) was edited by replacement, read by range.

## Next action
none: done.
