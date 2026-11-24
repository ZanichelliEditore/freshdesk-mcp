# T-032 — Tools: `search_solutions`, `get_solution_article`, `list_solution_tree`

- **Type:** build
- **Phase:** M1
- **Status:** doing (2026-11-24)
- **Depends on:** T-017, T-018, T-019, T-031, T-053
- **Created:** 2026-11-23

## Goal
Knowledge-base reads for C3 and C9.

## In scope
- Article body as text with the truncation marker; wrapped in
  `<ticket_content>` (owner, 2026-11-23).
- `list_solution_tree`: categories → folders → article titles, bounded by a
  cap, cost in the description.
- For `search_solutions`, cursor (`/decompose`, 2026-11-23): before any request the tool calls `readCursor` with its JSON arguments and its own `maxPosition`, a named constant: 0 if it serves one page only, else its source's last page (e.g. `MAX_PAGES - 1`), never a larger number, and gives `listEnvelope` the same arguments. Its input schema has no zod `default` or `transform`, so the arguments it parses are the ones sent (owner, 2026-11-23).
  `list_solution_tree` takes no `cursor`: it returns one capped tree with
  `truncated`, not the list envelope (`/decompose`, 2026-11-23).

## Out of scope
- Drafting or changing articles.

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §8.4
- SPEC.md §7.4

## Files expected to change
- `src/tools/toolsets/core/solutions.ts`
- `test/tools/core/solutions.test.ts`

## Wireframes
`none`

## Split point
`search_solutions` and `get_solution_article` first; `list_solution_tree`
second.

## Acceptance
`test/tools/core/solutions.test.ts`: `search_solutions` returns the envelope
with asserted ids and titles; for `search_solutions`, a cursor from another call is `isError` `validation` with the MockAgent count 0; a cursor built over the arguments as sent, at the tool's `maxPosition`, is accepted, and one at `maxPosition` + 1 is `isError` `validation` with the message "points past the last position" and the MockAgent count 0; `grep -nF -e '.default(' -e '.transform('` over the tool's file prints nothing; article and folder titles pass through the
name helper, one carrying an HTML tag coming back without it (asserted);
`get_solution_article` returns the text with no HTML tag, the marker when
over the cap, and inside `<ticket_content>` (asserted); `list_solution_tree` has no `cursor` argument and returns the fixture tree, stops at its cap with `truncated: true`, and
`api_calls_used` equals the MockAgent count; one refusal per tool
(`not_found`, or a client error) is `isError`; `make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
