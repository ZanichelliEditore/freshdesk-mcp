# T-034 — Tools: `list_canned_responses`, `get_canned_response`

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-24)
- **Depends on:** T-017, T-018, T-019, T-033, T-053
- **Created:** 2026-11-23

## Goal
Canned-response reads for C3 and C10.

## In scope
- The list: folders and titles in the envelope, bounded, cost in the
  description. One response: content as text; wrapped in `<ticket_content>`
  (owner, 2026-11-23).
- Cursor (`/decompose`, 2026-11-23): before any request the list tool calls `readCursor` with its JSON arguments and its own `maxPosition`, a named constant: 0 if it serves one page only, else its source's last page (e.g. `MAX_PAGES - 1`), never a larger number, and gives `listEnvelope` the same arguments. Its input schema has no zod `default` or `transform`, so the arguments it parses are the ones sent (owner, 2026-11-23).

## Out of scope
- Suggesting or writing canned responses.

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §8.4

## Files expected to change
- `src/tools/toolsets/core/canned.ts`
- `test/tools/core/canned.test.ts`

## Wireframes
`none`

## Acceptance
`test/tools/core/canned.test.ts`: the list returns the fixture's folders and
titles in the envelope with `api_calls_used` equal to the MockAgent count
and `truncated: true` past its cap; a cursor from another call is `isError` `validation` with the MockAgent count 0; a cursor built over the arguments as sent, at the tool's `maxPosition`, is accepted, and one at `maxPosition` + 1 is `isError` `validation` with the message "points past the last position" and the MockAgent count 0; `grep -nF -e '.default(' -e '.transform('` over the tool's file prints nothing; folder and response titles pass through
the name helper, one carrying an HTML tag coming back without it (asserted);
one response returns its text with no HTML tag, inside `<ticket_content>`
(asserted); an unknown id is `isError` `not_found`; `make quality` green.

---
*Filled at `/handoff`:*

## Done
- Commits: `ff8489a` (status), `16c1c85` (tools, tests, registry, overview),
  and the close commit `T-034: review fixes, done`. Built by a builder agent
  under the orchestrator (owner's instruction of 2026-11-23).
- `src/tools/toolsets/core/canned.ts`: `list_canned_responses`,
  `get_canned_response`; the mechanism is in the file's header and
  `docs/architecture/overview.md`.
- **Outside "Files expected to change":** `src/tools/toolsets/core/index.ts`
  (the two tools in `CORE_TOOLS`), `test/server.test.ts` (the registry's
  expected list), `docs/architecture/overview.md`, `docs/journal.md`,
  `docs/improvements.md`.
- Tests, `test/tools/core/canned.test.ts`, by `describe`:
  - `::the listing` (`::lists both tools read-only, with a cost; only
    get_canned_response carries the data note`; `::the tools' file has no
    zod default or transform`; `::the description's numbers are the
    constants`; `::MAX_POSITION is the last page of the folder cap`);
  - `::list_canned_responses` (`::returns the fixture's folders and titles
    in the envelope; api_calls_used is the MockAgent count`; a listed
    response's `shared: null` and the description's sentence on it;
    `personal` missing or unreadable is `null`; `::a folder name and a
    response title lose their HTML tag and are cut at the name cap, not
    wrapped`; paging by cursor; `FOLDER_CAP` + 1 folders `truncated: true`,
    exactly `FOLDER_CAP` no key; `RESPONSE_CAP` + 1 titles `truncated: true`,
    exactly `RESPONSE_CAP` no key; `listAll`'s page cap `truncated: true`; no
    folders; `::a cursor from another call is isError validation, nothing
    sent`; `::a cursor at maxPosition is accepted`; `::a cursor at
    maxPosition + 1 is isError validation, nothing sent`; the folder list,
    its page 2 and the folder views `expensive`, refused below the reserve;
    a folder view 404 fails the call `not_found`; a 403 `forbidden`);
  - `::get_canned_response` (`::returns the plain text inside
    <ticket_content>, no HTML tag, the title through the name helper`;
    visibility 0, 1, 2, 3, -1, null by name and `shared`; missing
    `visibility` and `folder_id` `null`; the tag strip on three texts; the
    `TEXT_CAP` cut with the marker; `content: null`; `::an unknown id is
    isError not_found`; bad ids refused, nothing sent).
- **Failed first:** the whole test file, before `canned.ts` existed (the
  missing import, no test ran), and
  `test/server.test.ts::a server from the real registry lists core's tools`;
  all passed after the module. The review's page-2 test failed under a
  mutation sending the folder list `cheap`; the old "folder list is
  expensive" test stayed green under it (renamed; journal).
- **Choices:**
  - An item is a folder `{id, name, personal, responses: [{id, title,
    shared: null}]}`; a position is a page of `PAGE_SIZE` (10) folders of the
    first `FOLDER_CAP` (100), so `MAX_POSITION` is 9; each folder on the page
    has its responses read (1 request each), the first `RESPONSE_CAP` (100)
    titles kept. Every call lists the folders again.
  - `truncated` from `FOLDER_CAP`, `RESPONSE_CAP` (folders on this page) or
    `listAll`'s cap.
  - Every request of the list `expensive`, the folder list included.
  - Labelled, not dropped: folder `personal`; a viewed response's
    `visibility` by name and `shared` (true only for `all agents`); a listed
    response `shared: null` (the folder view gives no visibility; a folder's
    `personal: false` does not make it shared: security review).
  - `get_canned_response` reads the response only (1 request); input
    `canned_response_id`.
  - The text cap is format.ts's `TEXT_CAP` (10,000), imported (code review);
    the tag regex is a local copy of solutions.ts's (improvement logged).
- Reviews: full round, no blocking findings (compliance Wireframes `none`;
  security 1 Low, `shared: null` on listed responses; code 1 Medium, the
  folder list's own pages untested as `expensive`, 4 Low: `TEXT_CAP`
  imported, import order, two parked in `docs/improvements.md`). No scoped
  round: the fixes add a field, tests and an import, no new mechanism.

## Dead ends
none

## Open doubts
- From T-033: `visibility` on a viewed response is unmeasured (may always be
  `null`, so `shared: false`); an empty folder's shape is unmeasured (a
  missing `canned_responses` fails the call as `server`); a non-admin key
  gets `forbidden`.
- The folder list is read again on every page: up to 10 requests a call on
  an account with more than 100 folders.

## Context pressure
Low: one builder session; the task's files, `solutions.ts` and its tests,
`canned.ts` (client), `list.ts`, `format.ts`, SPEC §8.2 and §8.4.

## Next action
none: done.
