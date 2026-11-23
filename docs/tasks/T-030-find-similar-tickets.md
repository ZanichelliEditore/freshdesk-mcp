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
a ticket older than N days and the ticket itself are absent; each item has
id, wrapped subject and wrapped excerpt; below the reserve it is refused as
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
