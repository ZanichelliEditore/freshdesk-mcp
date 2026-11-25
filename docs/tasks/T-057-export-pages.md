# T-057 — `export_tickets` pages: `max_tickets` and a cursor, one file per call

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-25)
- **Depends on:** T-037, T-039
- **Created:** 2026-11-25

## Goal
The caller asks for `n` tickets and pages a large export: each call writes
up to `max_tickets` rows to its own file and returns `next_cursor` while the
period has more (owner's request, 2026-11-25). Today one call writes what
fits in 30 s (about 4,000 tickets, about 40 with threads) and stops with
`truncated: true`.

## In scope
- `max_tickets` input (1 to a named cap); `cursor` input; `next_cursor` in
  the result while more remain, absent on the last page.
- The cursor uses the existing cursor helper (`src/tools/list.ts`,
  `readCursor` with its `maxPosition`): bound to the call's other
  arguments, tampering refused with no request and no file.
- One file per call under a new generated name; never appending to or
  overwriting an earlier file (T-037's file rules unchanged).
- Each ticket exactly once across the pages of a period (the read keeps a
  stable order; the position resumes after the last ticket written).
- Description and README (`export_tickets` section) updated.

## Out of scope
- Background or resumable-after-crash exports; any other format.

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §8.4
- SPEC.md §7.2

## Files expected to change
- `src/tools/toolsets/core/export-tickets.ts`
- `src/tools/toolsets/core/count-tickets.ts` (the shared read) if needed
- `test/tools/core/export-tickets.test.ts`
- `README.md`, `docs/architecture/overview.md`

## Wireframes
`none`

## Acceptance
`test/tools/core/export-tickets.test.ts` (temporary directory, MockAgent):
`max_tickets` (1 to a named cap) bounds the rows a call writes; a call that
stops before the period's end (the caller's `max_tickets`, the budget, the
time limit or a limiter refusal) returns `next_cursor`, and the same
arguments with that cursor write the next tickets to a new file under a new
generated name, never appending to or overwriting the earlier one; the
pages of a period read in sequence hold each fixture ticket exactly once; a
cursor given with other arguments, or tampered, is refused with no request
and no file; the last page has no `next_cursor`; the description names
`max_tickets`, the cursor and one file per call; the file rules of T-037
are unchanged (its tests still pass); `make quality` green.

Amended by the orchestrator (2026-11-25, scoped review round): a call cut
before it wrote any row returns `truncated: true` without `next_cursor`
(loop safety), so "returns `next_cursor`" holds for a call that stopped
after writing at least one row.

---
*Filled at `/handoff`:*

## Done
Commits `69d7fc8` (status), `c9f2b3d` (build), `97709eb` (full review
fixes), `ba6ea89` (scoped round fixes), and the closing commit (done).

Acceptance, clause by clause (`test/tools/core/export-tickets.test.ts`, describe "export_tickets: pages,
max_tickets and the cursor (T-057)", unless named):

- `max_tickets` 1 to a named cap (`MAX_TICKETS`, 10,000) bounds the rows:
  `::max_tickets bounds the rows a call writes; more left: next_cursor, not
  truncated`, `::max_tickets: MAX_TICKETS is accepted`, `::max_tickets %s:
  refused, nothing sent or written` (0, cap + 1, 1.5, -1).
- A call stopped before the period's end returns `next_cursor` and the
  cursor writes the next tickets to a new file: by `max_tickets`, `::search:
  the pages of a period, in sequence, ...`, `::list scan: the pages hold
  each ticket once, ...`; by the budget, `::list scan: a page cut at the
  budget gives next_cursor ...`, `::threads cut at the budget give
  next_cursor; ...`, `::search: the budget is checked before each later
  page, ...`; by the time limit, `::the time limit gives next_cursor; ...`;
  by a limiter refusal, `::a later page the limiter refuses gives
  next_cursor; another session resumes from the last page written`.
- New file under a new generated name, the earlier one untouched: `::search:
  the pages of a period, in sequence, hold each ticket once, each in a new
  file` (names distinct, matching T-037's pattern, the first file's bytes
  unchanged), `::the time limit gives next_cursor; ...`.
- Each fixture ticket exactly once across the pages: `::search: the pages
  of a period, ...`, `::list scan: the pages hold each ticket once, ties in
  a second and a ticket updated between calls included`, `::search: a
  ticket created between calls goes first; ...`, `::search: written tickets
  that left the results move the rest a page back; ...`.
- Cursor with other arguments, or tampered, refused with no request and no
  file: `::a cursor refused: no request, no file > with %s` (format,
  `max_tickets`, none, conversations, period, a filter, `confirm`) and `>
  %s` (digest edited, position edited, not a cursor, a number); `::scoped
  round fixes (R2) > a search position below id 1 is refused before any
  request`.
- Last page has no `next_cursor`: the third call of each sequence test,
  `::max_tickets equal to what the period holds: one file, no next_cursor`.
- Amendment (2026-11-25): a cut before any row gives `truncated: true`
  without `next_cursor`: `::a cut before any row is written gives no
  next_cursor (no loop) ...`, `::scoped round fixes (R2) > stepping back
  counts against the budget: ...`.
- Description names `max_tickets`, the cursor and one file per call:
  `::the description names max_tickets, the cursor and one file per call`,
  `::scoped round fixes (R2) > the description gives the zero-row advice`.
- T-037's file rules unchanged: all 50 T-037 tests in the file pass
  unchanged; `count_tickets`' 47 tests pass unchanged.
- `make quality` green (2,565 tests at `ba6ea89`).

Tests first: the 25 build tests failed before `c9f2b3d`'s code (two of the
27 passed early only because zod dropped the unknown `max_tickets`); the
full round's 5 new tests failed before `97709eb`'s code. In the scoped
round the code was written first; its 6 new tests were then run against
`97709eb`'s code and all 6 failed. Mutation checks by hand (each fix
removed, a test fails): tie skip, earlier-second skip, list resume
`updated_since`, `truncated` on a `max_tickets` stop, the `max_tickets`
bound, the estimate's limit, the search boundary skip, the step back, the
search budget check, the zero-row cursor.

Design:

- Cursor: `list.ts`'s `readCursor`, read before the directory check, any
  request or any file, bound to every other argument (`max_tickets` and
  `confirm` included). Position 0 is the start; odd, search (the lowest id
  written and the page that held it); even, the list scan (the UTC second
  of the latest ticket written and how many created in that second were
  written).
- Search: by `created_at` and id descending (the orchestrator's
  measurement, real account, `GET`, 2026-11-25, one day of 405 results,
  pages 1-3 read twice: the same order on both runs, not by `updated_at`,
  no duplicate id). The next call starts at the page of the last ticket
  written, steps back while that page starts below the boundary (each step
  counted against the budget and the time limit), and writes only lower
  ids. Ids must fall strictly on every page a resumed call reads, else it
  is refused with nothing kept; a fresh call past a disorder writes on but
  gives no cursor if it stops early.
- List scan: resumes from `updated_since` one second before the position's
  second, page 1 again (the 300-page cap counts anew each call); earlier
  seconds and the first `ties` of that second are skipped.
- `next_cursor` when the read stopped before the period's end and the call
  wrote a row (a `max_tickets` stop is seen by one ticket more, so a period
  of exactly `max_tickets` ends without one); `truncated: true` beside it
  for a cut, never for a `max_tickets` stop; alone for a cut before any row
  or a fresh read past a disorder.
- With `max_tickets` the estimate counts that many tickets at most; the
  budget is checked before each later search page as on the list scan.
- `readPeriod` takes `resume` and `limit` and gives `next`; `count_tickets`
  passes neither.

Reviews: full round on `57ebfdc..c9f2b3d` (R1 = `c9f2b3d`): compliance
none (Wireframes `none`); security 1 Low, 1 info; code 1 High, 1 Medium, 3
Low; fixed in `97709eb`, the info parked (improvements.md, `c9f2b3d`).
Scoped round on `c9f2b3d..97709eb`: compliance none; list A, two items
(A1 step-back budget, A2 id-order guard), fixed in `ba6ea89` with B3 and
B4; list B parked (improvements.md, `97709eb`). The list A fixes are not
reviewed again (rule 9).

Outside "Files expected to change": `docs/architecture/ticket-queries.md`
(T-037's "shorter periods" line, T-057's choices and the measurement),
`docs/improvements.md`, `docs/tasks/PLAN.md`.

## Dead ends
- A fake `Date` clock (`vi.useFakeTimers({ toFake: ["Date"] })`) to give
  each call its own millisecond: the limiter paces on `Date.now()` with
  real timers, so the calls hung (5 s timeouts). The tests wait for the
  real clock to move instead.
- A search offset as the position: Freshdesk's newest-first order puts a
  ticket created between calls at index 0, so offsets write one twice and
  skip one (full round, code High).

## Open doubts
- List scan, past 300 matches: ties in the position's second are skipped
  by count, not by id (a second and an id do not fit one position), so a
  tie that entered or left the filters between two calls makes one skipped
  or written twice. Documented in the description and README; awaiting the
  owner (an alternative: one `GET /tickets/{id}` per resumed call to key
  by id).
- Whether search sorts by `created_at` or by id is not measured (they
  agreed on the sample; an imported, back-dated ticket would set them
  apart). Guarded fail-closed: a resumed read refuses ids out of order.
- First-call snapshot semantics: the guarantees hold against the tickets
  that matched at the first call; a ticket created while the calls run can
  be left out, and one leaving the results during a single call can make
  an unchanged one skipped within it (parked, improvements.md `97709eb`).

## Context pressure
Moderate: one build session with two review rounds; no split needed.

## Next action
none: done.
