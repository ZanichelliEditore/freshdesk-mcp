# T-033 — Client resource: canned responses (read)

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-24)
- **Depends on:** T-013
- **Created:** 2026-11-23

## Goal
`src/client/resources/canned.ts`: folders, a folder's responses, one
response.

## In scope
- zod schemas with unknown keys passed through.

## Out of scope
- Create or update (`canned_write`, M5+).

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §7.1

## Files expected to change
- `src/client/resources/canned.ts`
- `test/client/resources/canned.test.ts`
- `test/fixtures/canned.ts`

## Wireframes
`none`

## Acceptance
`test/client/resources/canned.test.ts` (MockAgent): folders, a folder's
responses and one response return asserted ids, titles and content; a
malformed item is `server`; a 404 is `not_found`; `make quality` green.

---
*Filled at `/handoff`:*

## Done
- Commits: `ec6a469` (status), `cdb1457` (module, tests, fixture,
  overview, `list-all.ts` caller comment), and the close commit `T-033:
  done; measured list facts, task file`. Built by a builder agent under the
  orchestrator (owner's instruction of 2026-11-23).
- `src/client/resources/canned.ts`: `listCannedFolders`,
  `listCannedResponses`, `getCannedResponse`; the mechanism is in the
  file's header and `docs/architecture/overview.md`.
- **Outside "Files expected to change":** `src/client/resources/list-all.ts`
  (header comment only, its callers) and `docs/architecture/overview.md`.
- Tests, `test/client/resources/canned.test.ts`, by `describe`:
  - `::listCannedFolders` (`::follows two pages and returns every folder's
    id, name and personal, nothing else`; the 10-page cap `truncated: true`;
    `personal` missing, not a boolean, a number, null give `null`; a wrong
    id on page 2, a missing name and a body that is not a list are `server`
    with no body text; `::returns a 404 as not_found`; a passed deadline is
    `network`, nothing sent);
  - `::listCannedResponses` (`::returns a folder's responses' ids and
    titles, nothing else, in one request`; an empty folder an empty list;
    bad folder ids refused, nothing sent; `::returns a 404 as not_found,
    with its attempts`; a wrong id, no title, no `canned_responses`, a
    non-list `canned_responses` and a list body are `server` with no body
    text and their attempts; a passed deadline is `network`);
  - `::getCannedResponse` (`::returns id, title, the plain-text content,
    folder_id and visibility, nothing else`, no `<div` and no
    `attachments`; content null gives `text: null`; unreadable `folder_id`
    and `visibility` give `null`; bad ids refused; `::returns a 404 as
    not_found, with its attempts`; missing or non-string content, a
    missing title and a non-whole id are `server` with no body text; a
    passed deadline is `network`);
  - `::the lists: the cost class` (both lists refused below the reserve
    when `expensive`, sent when cheap).
- **Failed first:** the whole test file, before `canned.ts` existed (the
  missing import, no test ran); all 57 passed after the module.
- **Choices:**
  - Explicit allow-lists built field by field, not the task's "unknown
    keys passed through": the pattern of `solutions.ts`, reviewed twice,
    and the orchestrator's instruction; a pass-through would carry
    `content_html`, attachments and whatever Freshdesk adds into the tools.
  - A folder's responses from `GET /canned_response_folders/{id}` (one
    request, ids and titles), not `/canned_response_folders/{id}/responses`,
    which sends every response's content and attachments.
  - `text` is Freshdesk's plain-text `content`; `content: null` gives
    `text: null`, as articles' `description_text` does.
  - `personal` (folder), `visibility` and `folder_id` (response) are `null`
    when missing or unreadable, not `server`; a folder with no
    `canned_responses` array is `server` (fails closed).
  - Both lists take an optional trailing cost, `cheap` unless given.
- **Measured** by the orchestrator on the real account, 2026-11-24, GET
  only, status and counts only: `GET /canned_response_folders?per_page=100`
  200, a list, 1 credit (the key in use can read canned responses, not
  refused as admin-only); without parameters 200, the same count;
  `GET /solutions/categories?per_page=100&page=1` 200, a list, 1 credit.
  So `per_page` is accepted on both.
- Reviews: full round, no blocking findings (compliance Wireframes `none`;
  security none + 1 info; code 1 Medium, measurement, answered by the
  measurement above; 1 Low, 1 info). No scoped round.

## Dead ends
none

## Open doubts
- `visibility` on a viewed response is documented only on create, not in
  the view sample: unmeasured, may always be `null`.
- An empty folder's shape is unmeasured (whether `canned_responses` is `[]`
  or missing; missing is `server`).
- Freshdesk documents these endpoints as admin-only: a non-admin key gets
  `forbidden`.
- For T-034: `listCannedResponses` does not carry the folder's `personal`;
  take it from `listCannedFolders`. Treat a `visibility` other than 0, or
  `null`, as not shared with all agents. `truncated` must come from
  T-034's own cap: `listCannedResponses` is one request and has none.

## Context pressure
Low: one builder session; only the files the task lists, `solutions.ts`
and its tests, `list-all.ts`, SPEC §7.1 and §8.2, and Freshdesk's canned
responses documentation were read.

## Next action
none: done.
