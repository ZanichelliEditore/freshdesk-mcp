# T-027 — Tool: `list_tickets`

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-24)
- **Depends on:** T-018, T-023, T-024, T-026, T-042, T-043, T-056
- **Created:** 2026-11-23

## Goal
The filtered, paged ticket list with compact labelled rows (C1 listing): the
tool only, over T-042's row and T-043's filters.

## In scope
- Filters: status, priority, group, agent, type, tag, `uncategorized`,
  `updated_since`, `created_between`, turned into requests by T-043.
- Rows by T-042; `detail` flag; paging by T-018's cursor.
- Cursor (`/decompose`, 2026-11-23): before any request the tool calls `readCursor` with its JSON arguments and its own `maxPosition`, a named constant: 0 if it serves one page only, else its source's last page (e.g. `MAX_PAGES - 1`), never a larger number, and gives `listEnvelope` the same arguments. Its input schema has no zod `default` or `transform`, so the arguments it parses are the ones sent (owner, 2026-11-23).

## Out of scope
- Filters by custom field (use `search_tickets`).

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §8.4
- SPEC.md §10

## Files expected to change
- `src/tools/toolsets/core/list-tickets.ts`
- `test/tools/core/list-tickets.test.ts`

## Wireframes
`none`

## Acceptance
`test/tools/core/list-tickets.test.ts` (in-memory client, MockAgent): a call
with each of the nine filters sends the request T-043 builds for it
(asserted URL for one list-endpoint filter and one search filter) and
returns T-042's rows; `detail: true` returns the labelled ticket, every field by its label and each text value cut at 1,000 code points with the marker (review of 2026-11-24); an unknown status name is `isError` `validation` with no request sent; with `created_between` or `updated_since` beside a search filter, a ticket the widened search returns from outside the range (the boundary day) is absent from the rows (`matchesLocal`, T-043), and `uncategorized` drops a categorised ticket the same way; two
pages through `next_cursor`; a cursor from another call is `isError` `validation` with the MockAgent count 0; a cursor built over the arguments as sent, at the tool's `maxPosition`, is accepted, and one at `maxPosition` + 1 is `isError` `validation` with the message "points past the last position" and the MockAgent count 0; `grep -nF -e '.default(' -e '.transform('` over the tool's file prints nothing; a source cut at a cap says `truncated: true`;
`api_calls_used` equals the MockAgent count; `make quality` green.

---
*Filled at `/handoff`:*

## Done
- Commits: `c79e6e7` (status), `3cfe98a` (the tool, tests, client
  additions, architecture notes), `eccf62f` (full review fixes), and the
  close commit `T-027: done; wording, task file, parked review items`
  (wording, this file, PLAN, journal, improvements).
- `src/tools/toolsets/core/list-tickets.ts`: the nine filters through
  `buildTicketQuery`, rows through `ticketRow` or, with `detail: true`,
  `ticketDetail` cut at `DETAIL_VALUE_CAP`; `matchesLocal` on every ticket
  either endpoint returns; registered in `core/index.ts`. The mechanism is
  in the file's header and `docs/architecture/overview.md`.
- **Outside "Files expected to change":**
  - `src/client/resources/tickets.ts`: an optional trailing `cost`
    argument on `listTickets` (the `uncategorized` scan is `expensive`,
    T-024's note); `MAX_LIST_PAGE` (the tool's last position is tied to
    it); a failed page carries `attempts`, so a partial scan's
    `api_calls_used` stays the requests sent. Tests in
    `test/client/resources/tickets.test.ts`.
  - `src/client/resources/search.ts`: `SEARCH_PER_PAGE`, the source's page
    size, for `has_more` and the 300 cap (T-028 needs it too).
  - `src/tools/rows.ts`: optional `CutOptions` on `ticketDetail`, for the
    bound on `detail: true` (full review, security Medium). Test in
    `test/tools/rows.test.ts`.
  - `src/tools/toolsets/core/index.ts`, `test/server.test.ts` (the tool
    listed), `docs/architecture/overview.md`, `ticket-queries.md`.
    `eslint.tool-imports.json` needed no entry.
- Tests, `test/tools/core/list-tickets.test.ts` (76), by `describe`:
  `::the listing`, `::the nine filters` (each filter's URL computed from
  `buildTicketQuery` on the loaded schema; two literal URLs: `::status
  goes to search, at this URL`, `::updated_since alone goes to the list
  endpoint, at this URL`), `::detail`, `::filters refused`, `::the local
  checks (matchesLocal)` (the boundary days of `created_between`,
  `updated_since` beside a search filter, `uncategorized` beside a search
  filter and alone, `::a search page that loses rows to the check is
  short, and still says has_more`), `::paging`, `::the uncategorized
  scan`, `::the cost class`, `::truncated`, `::the cursor`,
  `::api_calls_used`, `::errors`, `::stderr`, `::one 30 s deadline per
  call`. `test/client/resources/tickets.test.ts::listTickets: the cost
  class` (4); `test/tools/rows.test.ts::ticketDetail::cuts every wrapped
  value, the description included, by the caller's options`.
- Failed first:
  - before `3cfe98a`'s code the tool's file failed whole (no module), and
    `listTickets: the cost class::given expensive, the page goes to the
    limiter as expensive: refused below the reserve` was red;
  - before `eccf62f`'s code (source stashed), 9 red: the 10,000-character
    description, the description's bounds, the two limiter-refusal scan
    tests, both scan maxima (the non-detail one only for the missing
    constant: the behaviour was there), the full page 300, `ticketDetail`
    with options, a failed page's `attempts`. The seven-filter cursor test
    was green on arrival (it pins).
- Mutation checks, each reverted: no `matchesLocal` on search (5 red);
  the scan sent as `cheap` (1); no `SCAN_START_MS` bound (1); `has_more`
  from the row count (3); `tag` removed from `SEARCH_FILTERS` (5). Not
  mutation-checked: the 30 s deadline test, the `SCAN_PAGES` bound.
- Choices:
  - A cursor position is a page of the source: search with any of status,
    priority, group, agent, type, tag, `created_between` (last position
    9), else the list endpoint (299). The source is known from the
    arguments, so the cursor is read before any request.
  - `has_more` and `next_cursor` come from the source (search's `total`,
    the list's `Link`), never from the rows left after the local checks: a
    call can return fewer rows than a page, or none, with `has_more: true`.
  - `truncated: true` on every page of a search whose `total` is over 300
    (the widened set's count with a date filter), and on a list page 300
    that links a next one or comes back full. The advice on narrowing is
    in the description, not in the result.
  - The plain list asks 30 a page (reach 9,000 tickets), for output size.
  - The `uncategorized` scan: pages of 100 (30 with `detail: true`) as
    `expensive`, until the list ends, 30 rows, 10 pages, or 15 s of the
    call's 30 s; at most 129 rows (59 with detail). A later page the
    limiter refuses returns the rows kept with `next_cursor` at that page;
    a 429 from Freshdesk ends there too (the limiter's hold refuses the
    retry). Any other failure fails the call.
  - One 30 s deadline from the call's start, the schema's load inside it.
- The orchestrator's two acceptance amendments (2026-11-24): the
  boundary-day clause (with `c79e6e7`) and the `detail: true` clause
  ("each text value cut at 1,000 code points with the marker", with the
  close commit).
- Full review round on `c9c232c..3cfe98a`: compliance Wireframes `none`;
  security 1 Medium, 2 Low; code 3 Medium, 3 Low; no High. Fixed in
  `eccf62f` by the orchestrator's decisions (detail bounded, scan progress
  on a limiter refusal, `SEARCH_FILTERS` guard, list cap); code L3 and a
  security Low note parked. Scoped round on `3cfe98a..eccf62f`: list A
  empty for all three; the wording items fixed in the close commit, lists
  B parked in `docs/improvements.md`, entry `eccf62f`. `make quality` exit
  0 on the close commit's tree.

## Dead ends
- A test that Freshdesk's 429 on a later scan page fails the call: it does
  not. The client's retry meets the limiter's hold, which refuses it as
  `rate_limited` with no status, so the call takes the partial-return
  branch. The test now asserts that (`::the uncategorized scan::Freshdesk's
  429 on a later page: …`).

## Open doubts
- The `SEARCH_FILTERS` guard (the handler throws when the built query
  names the other source) has no direct test: it is unreachable unless
  `buildTicketQuery` and the list drift. The seven-filter cursor test and
  the nine-filter URL test pin the mapping.
- A real 429 through all retries on a later scan page (a status on the
  final error) is untested: that half of the partial-return condition.
- Whether Freshdesk's page 300 carries a `Link` when more exists is
  documented, not measured; a full page 300 is taken as cut either way.
- `detail: true` has no whole-response bound: each value is cut at 1,000
  code points, the number of fields is not bounded.
- A partial scan return carries no `retry_after_s`: the model learns of
  the refusal only by calling again.
- The search date boundary and time zone (T-055, proposed): a one-day
  widening can under-return on one side in an account far from UTC.

## Context pressure
ok

## Next action
none: done.
