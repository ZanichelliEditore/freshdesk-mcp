# T-029 — Tool: `triage_queue`

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
- **Depends on:** T-027
- **Created:** 2026-11-23

## Goal
Open and pending tickets with the urgency signals Claude ranks on (C2).

## In scope
- Signals: priority, `fr_due_by` / `due_by`, overdue flags, age, last
  customer message time, unanswered customer reply, escalation flags; from
  the ticket and its `stats`, with no call per ticket if
  `docs/architecture/ticket-queries.md` says `stats` carries them; otherwise
  within the per-call bound that note gives.
- Dates ISO 8601 with zone, durations in human form; a stated default order;
  a cap with `truncated`.
- Cursor (`/decompose`, 2026-11-23): before any request the tool calls `readCursor` with its JSON arguments and its own `maxPosition` (0 if it serves one page only), and gives `listEnvelope` the same arguments. Its input schema has no zod `default` or `transform`, so the arguments it parses are the ones sent (owner, 2026-11-23).

## Out of scope
- Ranking or scoring (Claude does it).

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §8.4
- SPEC.md §3

## Files expected to change
- `src/tools/toolsets/core/triage-queue.ts`
- `test/tools/core/triage-queue.test.ts`

## Wireframes
`none`

## Acceptance
`test/tools/core/triage-queue.test.ts` (fake clock): only open and pending
fixture tickets are returned; each row has the asserted priority name, both
due dates with zone, overdue flags, age and time since the last customer
message in human form, the unanswered flag and the escalation flags; the
default order is asserted; the MockAgent count equals the pages fetched,
with no per-ticket call, or stays within the bound
`docs/architecture/ticket-queries.md` gives if it says a per-ticket call is
needed, and `api_calls_used` matches; over the cap gives `truncated: true`; a cursor from another call and one past the tool's last position are each `isError` `validation` with the MockAgent count 0;
a client error is `isError`; `make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
