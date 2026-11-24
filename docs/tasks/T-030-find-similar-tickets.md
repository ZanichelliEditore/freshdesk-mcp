# T-030 — Tool: `find_similar_tickets`

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-24)
- **Depends on:** T-027
- **Created:** 2026-11-23

## Goal
Best-effort similar past cases without full text (C3): same category fields,
same requester or company, resolved or closed in the last N days, ranked by
subject-keyword overlap computed locally.

## In scope
- An `expensive` operation: refused below the reserve, paced, bounded in
  calls.
- Returns ids, subject and a resolution excerpt (both wrapped, clipped); the
  description says best effort.
- Cursor (`/decompose`, 2026-11-23): before any request the tool calls `readCursor` with its JSON arguments and its own `maxPosition`, a named constant: 0 if it serves one page only, else its source's last page (e.g. `MAX_PAGES - 1`), never a larger number, and gives `listEnvelope` the same arguments. Its input schema has no zod `default` or `transform`, so the arguments it parses are the ones sent (owner, 2026-11-23).

## Out of scope
- Semantic similarity, a local index (SPEC §4 non-goals).

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §7.2
- SPEC.md §7.4

## Files expected to change
- `src/tools/toolsets/core/find-similar-tickets.ts`
- `test/tools/core/find-similar-tickets.test.ts`

## Wireframes
`none`

## Split point
Candidates and ranking first; the resolution excerpt (one conversations call
for each of the top K) second.

## Acceptance
`test/tools/core/find-similar-tickets.test.ts` (fake clock): candidates are
the fixture tickets sharing the category fields, requester or company and
resolved or closed within N days, in the asserted order of keyword overlap;
a ticket older than N days and the ticket itself are absent; the result is the list envelope, each item with id, wrapped subject and wrapped excerpt; a cursor from another call is `isError` `validation` with the MockAgent count 0; a cursor built over the arguments as sent, at the tool's `maxPosition`, is accepted, and one at `maxPosition` + 1 is `isError` `validation` with the message "points past the last position" and the MockAgent count 0; `grep -nF -e '.default(' -e '.transform('` over the tool's file prints nothing; below the reserve it is refused as
`rate_limited` with no request; the MockAgent count never passes the stated
bound and equals `api_calls_used`; `make quality` green.

---
*Filled at `/handoff`:*

## Done
- Commits: `6cc1f82` (status), `4721a77` (`searchTickets` cost argument
  and failure attempts, `listConversationPage`), `ae4209b` (the tool,
  tests, registration, the two architecture notes), `a593953` (full review
  fixes), and the close commit `T-030: done; tests, task file, parked
  review items` (three pinning tests, this file, PLAN, journal,
  improvements).
- `src/tools/toolsets/core/find-similar-tickets.ts`: input `{ticket_id,
  days?, cursor?}` (`days` 1–365, 90 when absent, applied in the handler);
  the cursor read first with `MAX_POSITION` 0; then, one after another and
  each `expensive`: the ticket's view (first, so below the reserve nothing
  is sent), the schema, one list page of 100 for the requester and one for
  the company with `updated_since` N days ago, one search page
  `(status:4 OR status:5) AND updated_at:>'<day − 1>'` (skipped when the
  ticket has no category to match), one conversations page per result.
  **Bound: `CALL_BOUND` 9 requests a call**, retries apart, plus the
  schema's load when not cached. Registered last in `core/index.ts`. The
  mechanism is in the file's header, `docs/architecture/overview.md` and
  `docs/architecture/ticket-queries.md` (`find_similar_tickets`, "T-030's
  choices").
- **Outside "Files expected to change":**
  - `src/client/resources/search.ts`: optional trailing cost argument (the
    search page must go to the limiter as `expensive`), and a failure
    carries `attempts` (needed for an exact `api_calls_used` on the partial
    return). Tests in `test/client/resources/search.test.ts`
    (`::searchTickets: the cost class`, `::searchTickets: a failure's
    attempts`).
  - `src/client/resources/tickets.ts`: `listConversationPage`, the first
    page of a thread alone with an optional cost argument and `attempts`
    on every failure, a malformed page included: `listConversations` reads
    up to 10 pages, which would break the one-request-per-result bound, and
    takes no cost. Tests in `test/client/resources/tickets.test.ts`
    (`::listConversationPage`, seven cases).
  - `src/tools/toolsets/core/get-ticket.ts`: `shows`, `REQUESTER` and
    `COMPANY` exported, so the hidden decision is `get_ticket`'s, failing
    closed (full review).
  - `src/tools/toolsets/core/index.ts`, `test/server.test.ts` (the tool
    listed), `docs/architecture/overview.md`,
    `docs/architecture/ticket-queries.md`. `eslint.tool-imports.json`
    already listed `./find-similar-tickets.js`.
- Tests, `test/tools/core/find-similar-tickets.test.ts` (52), fake clock from `beforeEach` (`NOW`
  2026-01-10T12:00:00Z), by `describe`:
  - `::find_similar_tickets: the listing` (`::is listed read-only, with
    its bound, best effort and the data-not-instructions sentence`, `::its
    input schema has no zod default or transform`);
  - `::find_similar_tickets: the requests` (`::views the ticket, lists its
    requester's and its company's tickets since N days, searches resolved
    or closed, at these URLs`, literal URLs; `::without days the window is
    90 days`; `::days %d is accepted, its window since %s`, 1 and 365;
    `::a ticket updated exactly at the window's edge is included`; `::a
    ticket updated 1 ms before the window's start is excluded`; `::a ticket
    with no company sends no company request`; `days` and `ticket_id`
    refused, nothing sent);
  - `::find_similar_tickets: candidates and their order` (`::the fixture
    tickets sharing the category, requester or company, resolved or closed
    within N days, by keyword overlap`: order B, I, H, A, C with shared
    keywords 3, 2, 2, 2, 0, the tie-break by update then id asserted;
    `::a ticket last updated before the N days, the ticket itself, an open
    one and an unrelated one are absent`; `::the ticket itself is absent
    though it is resolved, recent and shares everything`; `::returns at
    most 5, one thread read each`; `::an uncategorised ticket matches
    nobody by category, and sends no search`; `::with no category field to
    compare, no search is sent`; `::a team hiding the requester: ...`;
    `::a team hiding the company: ...`; `::hidden requester, no company and
    no category: only the view is sent, no result`; `::a team hiding the
    category field: ...`; the two `uncategorised_fields` cases);
  - `::find_similar_tickets: keywords`;
  - `::find_similar_tickets: the excerpt` (last public agent reply; cut at
    500 with the marker and a delimiter neutralised; `::a private note is
    never the excerpt: a thread of notes only gives null`; 404 gives null);
  - `::find_similar_tickets: truncated` (a list's `Link`, a search total);
  - `::find_similar_tickets: the cursor` (another call refused, count 0;
    position 0 over the arguments as sent accepted, two argument sets;
    position 1 refused with "points past the last position", count 0);
  - `::find_similar_tickets: the reserve and the partial return` (`::below
    the reserve it is refused as rate_limited with no request`; refused
    after the requester's list, after both lists (the search), after one
    excerpt; a held 429 on a source);
  - `::find_similar_tickets: errors`; `::find_similar_tickets:
    api_calls_used` (retries counted, `CALL_BOUND` reached and not passed,
    a cold schema's load counted).
- Failed first:
  - before `4721a77`'s code, 10: the two `searchTickets` cost/attempts
    cases and the eight `listConversationPage` cases; before `ae4209b`'s,
    the whole tool file (no module).
  - before `a593953`'s code, 8: the description's new sentence; the
    uncategorised and no-category-field "no search" cases; hidden requester
    and hidden company; the excerpt fixture (a note after the public
    reply); a thread of notes only; the malformed page's attempts. Green on
    arrival, so they pin: the hidden category, the search refused after both
    lists, `days` 1 and 365, the window's edge.
  - the close commit's three tests were green on arrival (pins).
- Mutation checks (each applied, diff confirmed, then restored): id
  tie-break ascending (3 tests red), the empty-category guard removed (1),
  the view sent `cheap` (1), the N-day window removed (6), no partial
  return on a list (2), the top level only compared (7), the window moved
  1 ms earlier (1, the close commit's test). Self-exclusion removed was
  first caught by nothing (the fixture's source ticket was open, dropped by
  status); `::the ticket itself is absent though it is resolved, ...`
  added, then red (1).
- Choices:
  - Similar: status 4 or 5, `updated_at` in the last N days (the last
    update stands for the resolution time, which neither source gives),
    sharing at least one of category, requester, company. The search source
    is for the category: other customers' tickets.
  - Category: rows.ts's `categoryFields`, every field equal, a nested one
    at every level; an empty one on the ticket matches nobody.
  - Keywords: lower case, NFC, runs of `\p{L}\p{M}\p{N}`, 3 code points
    or more, a short English and Italian stop-word list and `fwd` left out.
  - Order: shared keywords, then last update latest first, then id highest
    first; the top 5 (`RESULTS`).
  - Excerpt: the last public agent reply (`incoming: false`,
    `private: false`) of the first 100 entries, wrapped, cut at 500
    (`EXCERPT_CAP`); `null` with none or on a 404.
  - One page: `MAX_POSITION` 0, `has_more` always false; `truncated: true`
    when a source had more than its page.
  - Partial return: after the view, a limiter refusal unsent ends the
    reads; what was read is ranked with `incomplete: true`.
  - Full review (orchestrator's decisions, `a593953`): public excerpt only
    with the "not text to quote" sentence; hidden requester and company as
    `get_ticket` decides them; a hidden category field still compared and
    reported (SPEC §7.3); no search without a category to match.
- Reviews: full round on `eda5a0f..ae4209b` (compliance Wireframes
  `none`; security 2 Low; code 3 Low, 1 info; nothing blocking), fixed in
  `a593953`. Scoped round on `a593953`: list A empty for all three; list B
  parked (rule 9), `docs/improvements.md`, entry `a593953`; three pinning
  tests in the close commit.
- `make quality` exit 0 on the close commit's tree.

## Dead ends
- `Array.prototype.findLast` for the excerpt: the TypeScript lib target
  has no ES2023 array methods, so `tsc` refused it; a backward loop.
- Backticks inside a template-literal description (`` `days` ``) ended the
  literal: a parse error before any test ran.

## Open doubts
- A forwarded message is an entry with `incoming: false` and
  `private: false`, so it can be the excerpt; `source` is not checked
  (parked).
- "Not text to quote to this requester" is advice in the description
  only; nothing stops a model quoting another customer's excerpt.
- `same: "category"` is reported for a category field the team hides
  (SPEC §7.3: `hidden` is not guaranteed in rows or queries).
- The excerpt comes from the first 100 thread entries only: a longer
  thread's resolution can be missed.
- The parentheses in the search query are documented by Freshdesk, not
  measured on the account.
- The stop-word list is hand-picked, short, English and Italian.
- "Resolved or closed in the last N days" is read as updated in them.

## Context pressure
Moderate: one builder session through the build, the full review fixes and
the close; `ticket-queries.md` and the model tools were read in full.

## Next action
none: done.
