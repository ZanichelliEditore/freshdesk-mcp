# T-058 — `list_solution_tree` reaches articles on a large knowledge base

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-25)
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
Commits `c14c8c0` (status), `59dc763` (build), and the closing commit
(review records, done). `c14c8c0` (two status lines) was committed before
`make quality` ran; the gate was green at `59dc763` and at the close.

Acceptance, clause by clause (`test/tools/core/solutions.test.ts`,
describe "list_solution_tree > with category", unless named):

- With 22 categories, `category` reads only that category's folders and
  their articles and returns articles: `::with 22 categories, reads only
  that category's folders and their articles, and returns articles` (exact
  request paths: the category, its folders, its two folders' articles;
  `api_calls_used: 4`). The problem it fixes: `::without category, 22
  categories spend every list on folders: no article, truncated`.
- Without `category` the output is unchanged: T-032's `list_solution_tree`
  tests, unchanged, pass.
- Unknown `category` is `not_found`: `::an unknown category is isError
  not_found: one request, no folder read`; client side
  `test/client/resources/solutions.test.ts` describe `getCategory`.
- The description says to pass `category` when the tree is `truncated`
  with no articles: `the listing::list_solution_tree takes an optional
  category; its description says when to pass it`.
- `make smoke-core` prefers the tree with `category`: `test/smoke.test.ts`
  `smoke core: where the solutions term and article come from::22
  categories (the walk spends its lists on folders): the tree with
  category gives the article, before any search`; also `::a tree with
  articles: no tree with category` and `::a tree with folders but no
  article, nor with category: …`.
- `make quality` green (2591 vitest, exit 0).

Tests that failed first: the `getCategory` client tests (no function), the
tool's category tests (the input was stripped, the full walk ran) and the
smoke's 22-category test. Passed before too (guards): the 22-category
repro without `category`, the healthy-run no-`category` test, and the
"category read is expensive" test (the old categories list was expensive).

Choices:
- `getCategory` (`GET /solutions/categories/{id}`, new in
  `src/client/resources/solutions.ts`) for the one category: 1 request, a
  404 is `not_found`, and it gives the name; a check against the
  categories list costs up to 10 requests and misses a category past
  `listAll`'s cap. Sent `expensive`, the first of `MAX_LISTS`.
- Input `category: z.number().int().positive().optional()`; a bad value is
  refused by the SDK's input check, nothing sent.
- The cost text is unchanged (still an upper bound), so `README.md` and
  `test/package.test.ts` are untouched.
- The smoke calls the tree with `category` only when the full tree has no
  article, with the first category that has a folder (line
  `list_solution_tree category`, not in C9's lines).

Real run (orchestrator, 2026-11-25, `make smoke-core` at `59dc763`): exit
0, "17 tool lines, 17 pass, 0 pass (empty), 0 not exercised, 0 refused
(budget), 0 fail; 102 calls"; `list_solution_tree category: pass,
categories 1, folders 11, articles 35, calls 13`.

Review: one full round on `90ce4a8..59dc763`. compliance: wireframes
`none`. security: no finding, one info. code: clean, three Lows. No code
change, so no scoped round. The info and the Lows are parked in
`docs/improvements.md` (entry stamped `59dc763`). SPEC §8.2 names the
tool, not its inputs: not stale.

## Dead ends
- Expecting a bad `category` to come back as the tool's own `validation`
  error: the MCP SDK refuses it first ("Input validation error…"); the
  test asserts that.

## Open doubts
none

## Context pressure
Low: one build session, one review round; no split needed.

## Next action
none: done.
