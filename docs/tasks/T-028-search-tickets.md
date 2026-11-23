# T-028 — Tool: `search_tickets`

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
- **Depends on:** T-027
- **Created:** 2026-11-23

## Goal
A thin wrapper of the Freshdesk query language, with its limits said out
loud.

## In scope
- Rows from T-042; the description documents the 300-result cap and the lack
  of full text.
- The query passes unchanged: no rule for hidden fields (owner, 2026-11-23).

## Out of scope
- Parsing or rewriting queries.

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §5

## Files expected to change
- `src/tools/toolsets/core/search-tickets.ts`
- `test/tools/core/search-tickets.test.ts`

## Wireframes
`none`

## Acceptance
`test/tools/core/search-tickets.test.ts`: the query reaches
`/search/tickets` unchanged; a `total` above 300 gives `truncated: true` and
the description text names the cap and "no full text"; Freshdesk's 400 comes
back as `isError` `validation` with its `errors[]`; `make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
