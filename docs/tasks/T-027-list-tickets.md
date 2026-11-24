# T-027 — Tool: `list_tickets`

- **Type:** build
- **Phase:** M1
- **Status:** doing (2026-11-24)
- **Depends on:** T-018, T-023, T-024, T-026, T-042, T-043, T-056
- **Created:** 2026-11-23

## Goal
The filtered, paged ticket list with compact labelled rows (C1 listing): the
tool only, over T-042's row and T-043's filters.

## In scope
- Filters: status, priority, group, agent, type, tag, `uncategorized`,
  `updated_since`, `created_between`, turned into requests by T-043.
- Rows by T-042; `detail` flag; paging by T-018's cursor.
- Cursor (`/decompose`, 2026-11-23): before any request the tool calls `readCursor` with its JSON arguments and its own `maxPosition`, a named constant: 0 if it serves one page only, else its source's last page (e.g. `MAX_PAGES - 1`), never a larger number, and gives `listEnvelope` the same arguments. Its input schema has no zod `default` or `transform`, so the arguments it parses are the ones sent (owner, 2026-11-23).

## Out of scope
- Filters by custom field (use `search_tickets`).

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §8.4
- SPEC.md §10

## Files expected to change
- `src/tools/toolsets/core/list-tickets.ts`
- `test/tools/core/list-tickets.test.ts`

## Wireframes
`none`

## Acceptance
`test/tools/core/list-tickets.test.ts` (in-memory client, MockAgent): a call
with each of the nine filters sends the request T-043 builds for it
(asserted URL for one list-endpoint filter and one search filter) and
returns T-042's rows; `detail: true` returns the full labelled ticket; an unknown status name is `isError` `validation` with no request sent; with `created_between` or `updated_since` beside a search filter, a ticket the widened search returns from outside the range (the boundary day) is absent from the rows (`matchesLocal`, T-043), and `uncategorized` drops a categorised ticket the same way; two
pages through `next_cursor`; a cursor from another call is `isError` `validation` with the MockAgent count 0; a cursor built over the arguments as sent, at the tool's `maxPosition`, is accepted, and one at `maxPosition` + 1 is `isError` `validation` with the message "points past the last position" and the MockAgent count 0; `grep -nF -e '.default(' -e '.transform('` over the tool's file prints nothing; a source cut at a cap says `truncated: true`;
`api_calls_used` equals the MockAgent count; `make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
