# T-030 — Tool: `find_similar_tickets`

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
- **Depends on:** T-027
- **Created:** 2026-11-23

## Goal
Best-effort similar past cases without full text (C3): same category fields,
same requester or company, resolved or closed in the last N days, ranked by
subject-keyword overlap computed locally.

## In scope
- An `expensive` operation: refused below the reserve, paced, bounded in
  calls.
- Returns ids, subject and a resolution excerpt (both wrapped, clipped); the
  description says best effort.
- Cursor (`/decompose`, 2026-11-23): before any request the tool calls `readCursor` with its JSON arguments and its own `maxPosition`, a named constant: 0 if it serves one page only, else its source's last page (e.g. `MAX_PAGES - 1`), never a larger number, and gives `listEnvelope` the same arguments. Its input schema has no zod `default` or `transform`, so the arguments it parses are the ones sent (owner, 2026-11-23).

## Out of scope
- Semantic similarity, a local index (SPEC §4 non-goals).

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §7.2
- SPEC.md §7.4

## Files expected to change
- `src/tools/toolsets/core/find-similar-tickets.ts`
- `test/tools/core/find-similar-tickets.test.ts`

## Wireframes
`none`

## Split point
Candidates and ranking first; the resolution excerpt (one conversations call
for each of the top K) second.

## Acceptance
`test/tools/core/find-similar-tickets.test.ts` (fake clock): candidates are
the fixture tickets sharing the category fields, requester or company and
resolved or closed within N days, in the asserted order of keyword overlap;
a ticket older than N days and the ticket itself are absent; the result is the list envelope, each item with id, wrapped subject and wrapped excerpt; a cursor from another call is `isError` `validation` with the MockAgent count 0; a cursor built over the arguments as sent, at the tool's `maxPosition`, is accepted, and one at `maxPosition` + 1 is `isError` `validation` with the message "points past the last position" and the MockAgent count 0; `grep -nF -e '.default(' -e '.transform('` over the tool's file prints nothing; below the reserve it is refused as
`rate_limited` with no request; the MockAgent count never passes the stated
bound and equals `api_calls_used`; `make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
