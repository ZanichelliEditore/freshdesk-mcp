# T-032 — Tools: `search_solutions`, `get_solution_article`, `list_solution_tree`

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-24)
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
- Commits: `cc44f2a` (status), `a42274d` (the three tools, tests, registry,
  overview), `3508be4` (full review fixes), and the close commit `T-032:
  narrow tag strip, docs, done` (scoped-round narrowing, docs, this file,
  PLAN, journal, improvements). Built by a builder agent under the
  orchestrator (owner's instruction of 2026-11-23).
- `src/tools/toolsets/core/solutions.ts`: `search_solutions`,
  `get_solution_article`, `list_solution_tree`; the mechanism is in the
  file's header and `docs/architecture/overview.md`.
- **Outside "Files expected to change":**
  - `src/client/resources/solutions.ts` and its test (full review, owner's
    orchestrator decision): `folder_id` kept on the viewed article and
    `getFolder` added, so `get_solution_article` can give `visibility` and
    `customer_safe`; an optional trailing cost argument on the three lists,
    so the tree's walk goes `expensive`.
  - `src/client/resources/list-all.ts`: the optional `cost` passed to
    `paginate`, the only way the three lists could be sent `expensive`;
    callers that give none are unchanged.
  - `test/fixtures/solutions.ts` (`folderView`, `taggedArticleView`),
    `src/tools/toolsets/core/index.ts`, `test/server.test.ts` (the
    registry's list), `docs/architecture/overview.md`.
- Tests, `test/tools/core/solutions.test.ts`, by `describe`:
  - `::the listing` (`::list_solution_tree has no cursor argument;
    search_solutions has one`; `::the tools' file has no zod default or
    transform`; the `customer_safe` and portal sentences; the description's
    numbers are the constants);
  - `::search_solutions` (`::returns the envelope with the hits' ids,
    titles, status and visibility by name`; visibility 1–4 named, 0, 5 and
    null `null`; status named; a title losing its tag and cut at the name
    cap, not wrapped; paging PAGE_SIZE a call with the search run again;
    HIT_CAP + 1 hits `truncated: true`; exactly HIT_CAP hits no
    `truncated`; `::a cursor from another call is isError validation,
    nothing sent`; `::a cursor at maxPosition is accepted`; `::a cursor at
    maxPosition + 1 is isError validation, nothing sent`; a blank term; a
    403);
  - `::get_solution_article` (`::returns the plain text inside
    <ticket_content>, no HTML tag, the title through the name helper`; a
    draft; an agents-only folder `customer_safe: false`; a folder 404
    `visibility: null`; a folder 403 fails the call; no `folder_id` no
    folder read; a tag left in the plain text stripped; `::the plain text
    "Torque < 5 Nm, then > 3 turns" comes back as …` and the `<b>` and
    `&lt;b&gt;` cases; the cap with the marker; an empty article; a 404
    `not_found`; bad `article_id`s refused, nothing sent);
  - `::list_solution_tree` (`::returns the fixture tree, names through the
    name helper, api_calls_used the MockAgent count`; tags stripped; `::stops
    at 20 lists with truncated: true; …`; exactly MAX_LISTS lists
    `truncated: false`; categories past the cap `folders: null`; a source
    cap `truncated: true`; folder and article lists failing mid-walk
    `not_found`; the categories, folders and articles lists each
    `expensive`, refused below the reserve; a 403).
- `test/client/resources/solutions.test.ts`: `::getArticle` (`folder_id`
  returned, `null` when unreadable), `::getFolder` (fields, visibility
  `null`, bad ids, 404, malformed, deadline), `::the lists: the cost class`
  (each list refused below the reserve when `expensive`, sent when cheap).
- **Failed first:** the tool test file before the module (whole file, the
  missing import); after it, one wrong expectation of mine (fixture hit 3302
  is published), then lint refused `node:child_process` and the MockAgent
  call history has no query string (both test fixes). Full review: 22 tool
  tests red before the change; the HIT_CAP and MAX_LISTS boundaries and the
  mid-walk failures passed on the old code. The client tests were written
  with the code; dropping the cost in `listAll` made 3 of them fail.
  Scoped narrowing: the "Torque" and `&lt;b&gt;` cases red before the
  narrow strip; the folders and articles `expensive` tests passed (they pin
  the full-review change).
- **Choices:**
  - `ARTICLE_CAP` 10,000; `PAGE_SIZE` 10, `HIT_CAP` 100, `MAX_POSITION`
    `HIT_CAP / PAGE_SIZE - 1` (9); `MAX_LISTS` 20.
  - Labelled, not dropped: `status` and `visibility` by name, `null` when
    unknown; `customer_safe` true only for `published` and `all users`.
  - A hit's key is `visibility` (its folder's), not `folder_visibility`.
  - `customerText: true` for `get_solution_article` only: search and tree
    return titles, never wrapped text.
  - The tree is read breadth first (the folder skeleton before articles);
    an unread category or folder is `folders: null` / `articles: null`;
    `truncated` always present; a failed list fails the call.
  - A viewed article's unreadable `folder_id` is `null` (no folder read,
    `customer_safe: false`), not `server`.
  - `updated_at` through `isoUpdated` (UTC, with milliseconds).
  - Tree tests on a fake clock: `expensive` paces at 2 a second.
  - **Post-review narrowing (scoped round, orchestrator's decision,
    unreviewed):** the article text loses only tag-shaped runs
    (`/<\/?[A-Za-z][^<>]*>/g`), no entity decoded, then `untrusted`.

## Dead ends
- `htmlToText` on Freshdesk's plain `description_text` (full-review fix,
  `3508be4`): it deleted a `<`…`>` span of prose ("Torque < 5 Nm, then > 3
  turns" became "Torque  3 turns") and decoded `&lt;b&gt;` into a tag.
  Replaced by the narrow strip.

## Open doubts
- Subfolder visibility is unmeasured: an article in a subfolder reached
  through search carries `folder_visibility`, but whether that is the
  subfolder's or its parent's is not known (smoke probe; improvements).
- `customer_safe` ignores the category's portal visibility
  (`visible_in_portals` is dropped by the client).
- Solutions shapes are documented, not measured (T-031's doubt stands).
- `HIT_CAP` 100 is ours: Freshdesk documents no hit count for
  `/search/solutions`.
- The tree's failure path has no `api_calls_used`: a failed `listAll`
  returns no attempts.

## Context pressure
Medium: one builder session through the build, the full review fixes, the
scoped narrowing and the close; only the files the task lists, the client
resource and the tool pattern were read.

## Next action
none: done.
