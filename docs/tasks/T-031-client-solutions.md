# T-031 — Client resource: solutions (read)

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
- **Depends on:** T-013
- **Created:** 2026-11-23

## Goal
`src/client/resources/solutions.ts`: categories, folders, articles, one
article, and article search.

## In scope
- zod schemas with unknown keys passed through; paged lists through
  `listAll` with `truncated`.

## Out of scope
- Create, update, translate (`kb_write`, M5+).

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §7.1

## Files expected to change
- `src/client/resources/solutions.ts`
- `test/client/resources/solutions.test.ts`
- `test/fixtures/solutions.ts`

## Wireframes
`none`

## Split point
Categories, folders, articles first; search second.

## Acceptance
`test/client/resources/solutions.test.ts` (MockAgent): categories, a
category's folders and a folder's articles (2+ pages) return asserted ids
and titles; `getArticle` returns title, text and status; `searchArticles`
sends the term encoded and returns asserted hits; a malformed item is
`server`; a 404 is `not_found`; `make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
