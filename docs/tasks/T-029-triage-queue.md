# T-029 — Tool: `triage_queue`

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-24)
- **Depends on:** T-027
- **Created:** 2026-11-23

## Goal
Open and pending tickets with the urgency signals Claude ranks on (C2).

## In scope
- Signals: priority, `fr_due_by` / `due_by`, overdue flags, age, last
  customer message time, unanswered customer reply, escalation flags; from
  the ticket and its `stats`, with no call per ticket if
  `docs/architecture/ticket-queries.md` says `stats` carries them; otherwise
  within the per-call bound that note gives.
- Dates ISO 8601 with zone, durations in human form; a stated default order;
  a cap with `truncated`.
- Cursor (`/decompose`, 2026-11-23): before any request the tool calls `readCursor` with its JSON arguments and its own `maxPosition`, a named constant: 0 if it serves one page only, else its source's last page (e.g. `MAX_PAGES - 1`), never a larger number, and gives `listEnvelope` the same arguments. Its input schema has no zod `default` or `transform`, so the arguments it parses are the ones sent (owner, 2026-11-23).

## Out of scope
- Ranking or scoring (Claude does it).

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §8.4
- SPEC.md §3

## Files expected to change
- `src/tools/toolsets/core/triage-queue.ts`
- `test/tools/core/triage-queue.test.ts`

## Wireframes
`none`

## Acceptance
`test/tools/core/triage-queue.test.ts` (fake clock): only open and pending
fixture tickets are returned; each row has the asserted priority name, both
due dates with zone, overdue flags, age and time since the last customer
message in human form, the unanswered flag and the escalation flags; the
default order is asserted; the MockAgent count equals the pages fetched,
with no per-ticket call, or stays within the bound
`docs/architecture/ticket-queries.md` gives if it says a per-ticket call is
needed, and `api_calls_used` matches; over the cap gives `truncated: true`; a cursor from another call is `isError` `validation` with the MockAgent count 0; a cursor built over the arguments as sent, at the tool's `maxPosition`, is accepted, and one at `maxPosition` + 1 is `isError` `validation` with the message "points past the last position" and the MockAgent count 0; `grep -nF -e '.default(' -e '.transform('` over the tool's file prints nothing;
a client error is `isError`; `make quality` green.

---
*Filled at `/handoff`:*

## Done
- Commits: `12b376c` (status), `b70efa6` (the tool, the `getTicket` cost
  argument, the probe, tests, registration, the two architecture notes),
  `74cb0bf` (full review fixes), and the close commit `T-029: done;
  wording, task file, parked review items` (wording, one pinning test,
  this file, PLAN, journal, improvements).
- `src/tools/toolsets/core/triage-queue.ts`: input `{reply_signals?,
  cursor?}`; the cursor read first with `MAX_SEARCH_POSITION`, then the
  schema, then one search page of `status:2 OR status:3`, any other status
  dropped locally; rows are `ticketRow` plus the signals, in
  `listEnvelope`; registered last in `core/index.ts`. The mechanism is in
  the file's header, `docs/architecture/overview.md` and
  `docs/architecture/ticket-queries.md` (`triage_queue`).
- **Reply signals are on request, not on every row.** PLAN's acceptance
  says "each row has ... time since the last customer message ..., the
  unanswered flag"; `docs/architecture/ticket-queries.md` allowed T-029 to
  "leave them out of the default and fetch them only on request". Read
  that way: with `reply_signals: true` each row has them, within the
  note's bound (1 + 30 = 31 requests a call, retries apart); without it a
  call is 1 request and the rows have no reply key.
- **The probe.** `view_include_stats` in `scripts/smoke/smoke.ts`
  (`runProbes`, GET only): `GET /tickets/{id}?include=stats` on the first
  recent ticket. Run by the orchestrator on 2026-11-24 (`make
  smoke-probes`, 22 GETs: 15 answered 200, 7 answered 400): all 8 `stats`
  keys present, 2 credits. Recorded in `ticket-queries.md`'s probe table;
  its "Open" row is closed.
- **Outside "Files expected to change":**
  - `src/client/resources/tickets.ts`: `getTicket` takes an optional
    trailing cost argument (`expensive` for the view per row, as
    `listTickets` has one), and a failed view carries `attempts`, so
    `api_calls_used` stays equal to the requests sent when a row's view
    fails and the call goes on. Tests in
    `test/client/resources/tickets.test.ts` (`::getTicket` `::cost class`,
    `::a failed view says how many requests it took`).
  - `scripts/smoke/smoke.ts`, `test/smoke.test.ts`: the probe (the
    orchestrator's instruction), needed to close the note's open question.
  - `src/tools/toolsets/core/index.ts`, `test/server.test.ts` (the tool
    listed), `docs/architecture/overview.md`,
    `docs/architecture/ticket-queries.md`. `eslint.tool-imports.json`
    needed no entry.
- Tests, `test/tools/core/triage-queue.test.ts` (85), fake clock from
  `beforeEach` (`NOW` 2026-01-10T12:00:00Z), by `describe`:
  - `::triage_queue: the listing` (`::its description states the order,
    the cap, what null means and the bound`, `::its input schema has no zod
    default or transform`);
  - `::triage_queue: open and pending tickets, with their signals`
    (`::asks search for status 2 or 3, at this URL`, a literal URL;
    `::returns only the open and pending tickets, each on T-042's row with
    the signals`: priority names, both due dates with zone, overdue and
    escalation flags, age, 1 request; `::without reply_signals no row has
    the reply keys and no ticket is viewed`);
  - `::triage_queue: the default order` (`::resolution due earliest first,
    a ticket with none last, ties by id`);
  - `::triage_queue: ages in human form` (nine ages; five `created_at`
    values that give none);
  - `::triage_queue: overdue and escalation flags`;
  - `::triage_queue: reply_signals, one view per row` (`::adds the last
    customer reply, the time since it and the unanswered flag`; `::no later
    customer reply: the last message is the opening one; ...`, four cases;
    eight unreadable `stats` shapes; `::first_response_overdue with
    reply_signals: ...`, seven cases, and without the flag; `::a ticket the
    view no longer finds keeps its row, the three signals null`; `::a full
    page stays within the bound: 31 requests, paced, each view asked
    once`; `::the reserve crossed after 2 views: every row comes back, the
    rest unviewed, and the result says so`; `::the first view answered 404,
    a later one refused by the limiter: the partial return, every signal
    null`; `::the views are expensive: below the reserve the first view is
    refused and the call is rate_limited`);
  - `::triage_queue: paging and truncated` (over the cap on every page;
    exactly the cap is not; `::has_more is the total's: a page whose rows
    were all dropped still has more`);
  - `::triage_queue: the cursor` (`::a cursor from another call is refused,
    nothing sent`; `::a cursor over the arguments as sent (...), at
    maxPosition, is accepted`, three argument sets; `::a cursor at
    maxPosition + 1 is refused, nothing sent`);
  - `::triage_queue: api_calls_used` (a retried search and a retried view
    counted; a cold schema's load counted);
  - `::triage_queue: errors` (`::a client error on the search is isError`;
    `::a 403 on a later view fails the call and stops the views, though one
    was answered`; `::a 429 on a later view, its retry refused by the
    limiter unsent: the partial return, the 429 counted`);
  - `::triage_queue: one 30 s deadline per call`.
  - `test/smoke.test.ts`: the probe's line, its path asked once, the
    skipped case, `::the one-ticket view: ...` (three cases).
- Failed first:
  - before `b70efa6`'s code: the whole tool file (no tool registered), the
    `getTicket` cost-class and failed-view tests, the probe's assertions.
    With the tool written, one test was red for a test-side reason (the
    shared fixture has no Pending status) and the rest green on first run.
  - before `74cb0bf`'s code, 13: the description's three new phrases; the
    reserve crossed after 2 views; the four opening-message cases and the
    unreadable `created_at` one; four `first_response_overdue` cases; and
    the main reply-signals test and the 404 test with their new
    expectations.
  - green on arrival, so they pin: the first-view refusal, the 403 on a
    later view, the date-only `first_response_overdue`, the 404-then-refused
    partial return (close commit). The 429 test was written expecting a
    failed call and showed a partial return: see "Open doubts".
- No mutation check was run.
- Choices:
  - Row keys named for what they say (`first_response_due`,
    `resolution_due`, `first_response_overdue`, `resolution_overdue`,
    `first_response_escalated`, `resolution_escalated`,
    `next_response_escalated`), not Freshdesk's (`fr_due_by`, `due_by`,
    `fr_escalated`, `is_escalated`, `nr_escalated`). `nr_due_by` is left
    out: the task names two due dates.
  - Human form: the two largest units of days, hours and minutes, rounded
    down; "under a minute". Ages are measured at the call's start, so
    pacing does not shift them.
  - Unknown is `null`: a date without a zone, a flag that is not a
    boolean, a negative duration, a `stats` key absent or unreadable.
  - Default order: a page's rows by resolution due time, earliest first,
    none last, ties by id; pages follow search's order, so it holds within
    a page only, said in the description.
  - A result whose status is not 2 or 3 is dropped locally; `has_more`
    stays the total's.
  - A view answered 404 leaves the row unviewed (search lags a few
    minutes) and counts as answered for the partial return.
  - Full review (orchestrator's decisions, `74cb0bf`): the partial return
    with `reply_signals_incomplete: true`; with no later customer reply the
    opening is the last customer message; `first_response_overdue` true
    only while no first response was sent, and, the builder's addition,
    `null` when the due time has passed and that is not known.
- Reviews: full round on `eb36755..b70efa6` (compliance Wireframes
  `none`; security 1 Medium, 2 Low; code 3 Medium and Lows; no acceptance
  line falsified), fixed in `74cb0bf`. Scoped round on `74cb0bf`: list A
  empty for all three; list B parked (rule 9), `docs/improvements.md`,
  entry `74cb0bf`. Wording and one pinning test in the close commit.
- `make quality` exit 0 on the close commit's tree.

## Dead ends
- A fake clock set after the schema was warmed: the clock went back from
  the real date to the fixture's, the schema's cache took that as expired,
  and every call reloaded it into a mock with no reply
  (`UND_MOCK_ERR_MOCK_NOT_MATCHED`). The clock is faked from `beforeEach`.
- A helper that runs the fake clock until the call settles, watching only
  for a resolved call: an unknown tool rejects, so the loop never ended
  (the first failing-first run hit the 120 s limit). It watches for a
  rejection too.

## Open doubts
- A 429 that Freshdesk still answers after the retries (an error with its
  HTTP status) fails the call and discards the views already answered;
  only the limiter's own refusal gives the partial return.
- With a slow `pacing_rps` (near 1 a second or below) a full page cannot
  finish in 30 s: every call, and every retry, stops at the same row. The
  call does not resume after the last answered row.
- The partial result carries no `retry_after_s`: the model is told to call
  again later, not when.
- A ticket an agent opened (an outbound email, a logged phone call) with
  no agent reply since reads as unanswered: its opening is counted as the
  customer's message. Said in the description.
- The search request stays `cheap` with the flag (`searchTickets` has no
  cost argument until T-036), so below the reserve a call spends 1 request
  before its first view is refused.
- The cursor binds `reply_signals`: asking the signals for a shortlist
  means reading the pages again with the flag.
- A ticket in a custom status is not in the queue (the note's
  `status:2 OR status:3`); said in the description. The owner may want
  them.

## Context pressure
Moderate: one builder session through the build, the full review fixes and
the close; the note and the two model tools were read in full.

## Next action
none: done.
