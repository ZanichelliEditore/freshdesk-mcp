# T-031 — Client resource: solutions (read)

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-24)
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
- Commits: `e255a2d` (status), `ad214cf` (the resource, its tests and
  fixtures, the overview line), and the close commit `T-031: review fixes,
  done` (full review fixes, this file, PLAN, journal). Built by a builder
  agent under the orchestrator (owner's instruction of 2026-11-23).
- `src/client/resources/solutions.ts`: `listCategories`, `listFolders`,
  `listArticles` (every page through `listAll`, `truncated` past 10
  pages), `getArticle`, `searchArticles` (one `GET /search/solutions?term=`).
  The mechanism is in the file's header and `docs/architecture/overview.md`.
- **Outside "Files expected to change":** `docs/architecture/overview.md`
  (one line); `src/client/resources/list-all.ts` (its header names
  `solutions.ts` among its callers; comment only).
- Tests, `test/client/resources/solutions.test.ts` (72), by `describe`:
  - `::listCategories` (`::follows two pages and returns every category's
    id and name, nothing else`; `::stops at its cap of 10 pages with
    truncated: true`, no 11th-page URL; `::passes the deadline on: one
    already passed sends nothing and is network`);
  - `::listFolders` (two pages with ids, names and visibility; `visibility:
    null` when missing, not a number, not whole or null; bad category ids
    refused with nothing sent; `::returns a 404 as not_found`);
  - `::listArticles` (two pages with ids, titles, status and `updated_at`;
    `updated_at: null` when missing, not a date-time, zoneless or null; bad
    folder ids refused; 404 `not_found`);
  - `::the lists: a malformed item on page 2` (a wrong id, a missing name
    or title, a body that is not a list: `server`, quoting nothing, for
    each of the three lists);
  - `::getArticle` (`::returns id, title, the plain text, status and
    updated_at, nothing else`; `::gives text: null for an empty article
    (description_text null)`; `updated_at: null` when unreadable; bad ids
    refused; 404 `not_found` with its attempts; four malformed bodies
    `server` with attempts; deadline passed is `network`, nothing sent);
  - `::searchArticles` (`::sends the term percent-encoded, a space as +,
    …` asserting `?term=oil+%26+squeak%3F` and the hits' ids, titles,
    status, `updated_at`, `folder_visibility`; non-ASCII UTF-8 encoded;
    `folder_visibility: null` when missing, not a number or null; 404
    `not_found` with its attempts; empty list; the 512-character term
    accepted; blank, over-long and non-string terms refused; a malformed
    hit and a non-list body `server`; a 400 with its attempts; deadline
    passed is `network`).
- **Failed first:** the test file was written before the module; its first
  run failed as a whole on the missing import, then all 58 passed with the
  module. In the close, the four whole-object assertions failed on the new
  keys before the tests were updated.
- **Choices:**
  - Returned objects are fixed allow-lists built field by field (`z.object`,
    then mapped), not the task file's "unknown keys passed through": the
    lesson of T-025's and later reviews is that a resource decides what can
    reach a tool, so nothing Freshdesk adds later (an author, SEO data,
    attachments) reaches the model unexamined.
  - `text` is `description_text`, the plain text; the HTML `description`
    is dropped. `null` stays `null` (an empty article); a missing key is
    `server`.
  - Visibility kept as whole numbers (`visibility` on a folder,
    `folder_visibility` on a search hit), `null` when missing or unreadable,
    so T-032 can label or refuse non-public content and treat unknown as
    not public. A category's `visible_in_portals` is dropped: portal ids,
    which no tool can label without a portal lookup.
  - `updated_at` kept (SPEC C9, outdated articles): an ISO 8601 date-time
    with a zone, `null` when missing or unreadable.
  - `MAX_TERM_LENGTH` 512 is ours, the ticket search's limit; Freshdesk
    documents none.
  - No cost argument: no planned caller needs `expensive`. The three lists
    carry no `attempts` on failure, as `listAll` returns them.
  - Subfolders (`GET /solutions/folders/{id}/subfolders`) are out of scope:
    an article in a subfolder is reached only through search.

## Dead ends
- developers.freshdesk.com/api, fetched at offsets 0, 100000 and 200000
  (2026-11-24): no part of the text held the Solutions section. The search
  shape came from a third-party connector's copy (withone.ai's Freshdesk
  page), the other shapes from the documented attribute names.

## Open doubts
- Shapes are Freshdesk's documented ones, not measured on an account: to
  be measured by a smoke probe (categories, folders, articles, one article,
  a search).
- Whether `GET /solutions/categories` pages at all (it may ignore
  `per_page` and return every category); `listAll` handles either.
- `+` for a space in `term` is unmeasured (measured for `/search/tickets`
  only).
- Search can return one article per matching language (Freshworks
  community); no de-duplication here.
- Drafts (`status` 1) are not filtered: the caller decides.
- For T-032: category and folder names need the name helper; article text
  must be wrapped (`<ticket_content>`) and capped.

## Context pressure
Low: one builder session through the build, the full review fixes and the
close; only the model resources and their tests were read.

## Next action
none: done.
