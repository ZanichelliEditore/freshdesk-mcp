# T-028 — Tool: `search_tickets`

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-24)
- **Depends on:** T-027
- **Created:** 2026-11-23

## Goal
A thin wrapper of the Freshdesk query language, with its limits said out
loud.

## In scope
- Rows from T-042; the description documents the 300-result cap and the lack
  of full text.
- The query passes unchanged: no rule for hidden fields (owner, 2026-11-23).
- Cursor (`/decompose`, 2026-11-23): before any request the tool calls `readCursor` with its JSON arguments and its own `maxPosition`, a named constant: 0 if it serves one page only, else its source's last page (e.g. `MAX_PAGES - 1`), never a larger number, and gives `listEnvelope` the same arguments. Its input schema has no zod `default` or `transform`, so the arguments it parses are the ones sent (owner, 2026-11-23).

## Out of scope
- Parsing or rewriting queries.

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §5

## Files expected to change
- `src/tools/toolsets/core/search-tickets.ts`
- `test/tools/core/search-tickets.test.ts`

## Wireframes
`none`

## Acceptance
`test/tools/core/search-tickets.test.ts`: the query reaches
`/search/tickets` unchanged; a `total` above 300 gives `truncated: true` and
the description text names the cap and "no full text"; the rows come in the list envelope; a cursor from another call is `isError` `validation` with the MockAgent count 0; a cursor built over the arguments as sent, at the tool's `maxPosition`, is accepted, and one at `maxPosition` + 1 is `isError` `validation` with the message "points past the last position" and the MockAgent count 0; `grep -nF -e '.default(' -e '.transform('` over the tool's file prints nothing; Freshdesk's 400 comes
back as `isError` `validation` with its `errors[]`; `make quality` green.

---
*Filled at `/handoff`:*

## Done
- Commits: `0fc45a4` (status), `ec3a5bc` (the tool, tests, registration,
  `overview.md`), and the close commit `T-028: review fixes, done` (review
  wording, the constant's home, this file, PLAN, journal, improvements).
- `src/tools/toolsets/core/search-tickets.ts`: input `{query, cursor?}`;
  the cursor read first with `MAX_SEARCH_POSITION`, then the schema, then
  one page of `searchTickets` with the query as written; rows through
  `ticketRow` in `listEnvelope`; registered in `core/index.ts`. The
  mechanism is in the file's header and `docs/architecture/overview.md`.
- **Outside "Files expected to change":**
  - `src/client/resources/search.ts`: `MAX_SEARCH_POSITION`
    (`MAX_SEARCH_PAGE - 1`) moved here from `list-tickets.ts` (full
    review), imported from here by both tools.
  - `src/tools/toolsets/core/list-tickets.ts`: that import, and one
    comment line; nothing else.
  - `src/tools/toolsets/core/index.ts`, `test/server.test.ts` (the tool
    listed), `test/tools/core/list-tickets.test.ts` (the constant's
    import), `docs/architecture/overview.md`. `eslint.tool-imports.json`
    needed no entry.
- Tests, `test/tools/core/search-tickets.test.ts` (36), by `describe`:
  - `::search_tickets: the listing` (`::its description names the
    300-result cap, no full text and how the query is written`, `::its
    input schema has no zod default or transform`);
  - `::search_tickets: the query` (`::reaches /search/tickets unchanged,
    at this URL`, a literal URL; five queries `is sent as written`; five
    refused ones `is validation naming the parameter, nothing sent`; `::a
    refused query on a cold schema sends the schema's 3 requests and no
    search`; `::the longest query the client takes is sent`);
  - `::search_tickets: the rows, in the list envelope`;
  - `::search_tickets: paging` (`::has_more is the total's, not the row
    count's: a short page before the end still has more`);
  - `::search_tickets: truncated` (over the cap on every page; exactly the
    cap is not);
  - `::search_tickets: the cursor` (`::a cursor from another call is
    refused, nothing sent`, `::a cursor over the arguments as sent, at
    maxPosition, is accepted`, `::a cursor at maxPosition + 1 is refused,
    nothing sent`);
  - `::search_tickets: api_calls_used` (a retry counted; a cold schema's
    load counted);
  - `::search_tickets: errors` (`::Freshdesk's 400 comes back as
    validation with its errors[], wrapped by the registry`);
  - `::search_tickets: stderr`; `::search_tickets: one 30 s deadline per
    call`.
- Failed first: before `ec3a5bc`'s code the file failed whole (no
  module); with the tool written every test passed on its first run, so
  none was seen red one by one. The cold refused-query test (review) was
  green on arrival: it pins; its description lines were red until the
  wording changed.
- Mutation checks, each reverted, each red: `truncated` at `>=` (1 test);
  `has_more` from the row count (2); no last-page bound (1); the schema's
  `attempts` dropped (1); the query trimmed (1); the deadline not passed
  (1). Not mutation-checked: the cursor read after the schema.
- Choices:
  - The bound is the shared `MAX_SEARCH_POSITION`, not a constant of the
    tool's own: a position is a search page for both tools.
  - Cursor, schema, search, as in `list_tickets`, so the schema's load is
    inside the one 30 s deadline.
  - `query` is `z.string()`: a blank one is left to the client's refusal.
  - The refusal is the client's own message ("Not sent: query is not a
    valid value."); the rules are in the description.
  - The description lists the searchable fields and the syntax from
    `docs/architecture/ticket-queries.md`, and says of `:>` and `:<` that
    the day given may be left out (T-055 is open).
- The `account-patterns` hook refused the first commit attempt: a made-up
  field name and value in the description's example query matched an
  account pattern. Replaced before any commit with the fixture's
  `cf_model:'Blue sprocket'`; the orchestrator checked that the refused
  token is in no tracked file and that the hook passes on the whole tree.
- Full review round on `5703326..ec3a5bc`: compliance Wireframes `none`;
  security none; code 2 Medium (description wording), 3 Low; no High.
  Fixed in the close commit: "no search is sent", the nested-field
  sentence and "plain dropdown", the constant moved, the tool's own
  `CALL_DEADLINE_MS` (the export on `list-tickets.ts`'s reverted), one
  self-asserting test dropped. No mechanism changed: no scoped round
  (orchestrator). Parked: `docs/improvements.md`, entry `ec3a5bc`.
- `make quality` exit 0 on the close commit's tree.

## Dead ends
- An invented example for the description (a field name and value made up
  on the spot): the `account-patterns` hook refused it. Examples come from
  the fixtures.

## Open doubts
- A refused query on a schema not yet cached still spends the schema's
  requests (3 at least): the query is checked by the client, after the
  load. Pinned by a test, said in the description as "no search is sent".
- The refusal message does not say which rule failed (blank, `"`, `\`,
  length).
- A field the team hides can be searched: the owner's decision of
  2026-11-23. `hidden` hides output, not searchability; a query on a
  hidden field tells by its results which tickets have the value.
- The 30 s deadline test relies on the schema's three requests running in
  sequence (3 × 9 s before the search); loaded in parallel, it would pass
  without testing the shared deadline.

## Context pressure
Low: one builder session, the tool modelled on `list-tickets.ts`.

## Next action
none: done.
