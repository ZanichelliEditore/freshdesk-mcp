# T-032 — Tools: `search_solutions`, `get_solution_article`, `list_solution_tree`

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
- **Depends on:** T-017, T-018, T-019, T-031, T-053
- **Created:** 2026-11-23

## Goal
Knowledge-base reads for C3 and C9.

## In scope
- Article body as text with the truncation marker; wrapped in
  `<ticket_content>` (owner, 2026-11-23).
- `list_solution_tree`: categories → folders → article titles, bounded by a
  cap, cost in the description.
- For `search_solutions`, cursor (`/decompose`, 2026-11-23): before any request the tool calls `readCursor` with its JSON arguments and its own `maxPosition` (0 if it serves one page only), and gives `listEnvelope` the same arguments. Its input schema has no zod `default` or `transform`, so the arguments it parses are the ones sent (owner, 2026-11-23).

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
with asserted ids and titles; for `search_solutions`, a cursor from another call and one past the tool's last position are each `isError` `validation` with the MockAgent count 0; article and folder titles pass through the
name helper, one carrying an HTML tag coming back without it (asserted);
`get_solution_article` returns the text with no HTML tag, the marker when
over the cap, and inside `<ticket_content>` (asserted); `list_solution_tree`
returns the fixture tree, stops at its cap with `truncated: true`, and
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
