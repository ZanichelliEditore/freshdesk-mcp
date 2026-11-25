# T-058 — `list_solution_tree` reaches articles on a large knowledge base

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-25)
- **Depends on:** T-032, T-039
- **Created:** 2026-11-25

## Goal
On a knowledge base with more categories than `MAX_LISTS` allows,
`list_solution_tree` can still show articles. T-039's real smoke
(2026-11-25): 22 categories, 51 folders, 0 articles, `truncated`, 20
calls; the breadth-first walk spends every list on folders.

## In scope
- An optional `category` input (id): the call reads only that category's
  folders and their articles, within `MAX_LISTS`.
- Without `category` the output is unchanged.
- The description tells the model to pass `category` when the tree comes
  back `truncated` with no articles.
- `make smoke-core`'s solutions path prefers the tree with `category`
  before the folder-name search fallback (T-039).

## Out of scope
- Subfolders; a cursor over the tree.

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §7.2

## Files expected to change
- `src/tools/toolsets/core/solutions.ts`
- `test/tools/core/solutions.test.ts`
- `scripts/smoke/core.ts`, `test/smoke.test.ts`
- `README.md` if it lists the tool's inputs

## Wireframes
`none`

## Acceptance
`test/tools/core/solutions.test.ts` (MockAgent): with 22 categories (the
real account's count, 2026-11-25) a call with the optional `category` (id)
reads only that category's folders and their articles and returns
articles; without `category` the output is unchanged (T-032's tests still
pass); an unknown `category` is `not_found`; the description tells the
model to pass `category` when the tree is `truncated` with no articles;
`make smoke-core`'s solutions path prefers the tree with `category` (test
in `test/smoke.test.ts`); `make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
