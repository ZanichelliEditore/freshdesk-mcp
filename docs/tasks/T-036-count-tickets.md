# T-036 — Tool: `count_tickets`

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-24)
- **Depends on:** T-027, T-035, T-043, T-055
- **Created:** 2026-11-23

## Goal
Counts grouped by up to two fields over a period and a filter, aggregated in
code (C7).

## In scope
- Group keys are labels. Grouping is allowed only by a field whose type is a
  known closed one (number, boolean, date, a validated choice, status,
  priority, source, agent, group); any other field is refused as
  `validation` before a request is sent (orchestrator's fail-closed choice,
  2026-11-23, for the owner to confirm). Built on `ticketOutput` as it is:
  nothing about hidden fields is added or guaranteed here.
- Never a silent undercount: a source cut by a cap says so.

## Out of scope
- Charts, trends (Claude, or the export).

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §7.2
- SPEC.md §8.4

## Files expected to change
- `src/tools/toolsets/core/count-tickets.ts`
- `test/tools/core/count-tickets.test.ts`

## Wireframes
`none`

## Acceptance
`test/tools/core/count-tickets.test.ts`: fixture tickets over 2+ pages give
the asserted counts by one field and by two, keys as labels; a third field
is a `validation` error with no request; grouping by a free-text field, and
by a field of a type the code does not know, is each a `validation` error
with no request sent (asserted); an estimate over the budget is refused
without `confirm`; a source cut at a cap gives `truncated: true` beside the
counts; `api_calls_used` equals the MockAgent count; `make quality` green.

---
*Filled at `/handoff`:*

## Done
Built by a builder agent under the orchestrator (owner's instruction of
2026-11-23). Commits `809d64c` (status), `8a72403` (the tool), `51fc580`
(full-round fixes), and the closing commit `T-036: scoped round lists B
parked, done`.

Acceptance, each in `test/tools/core/count-tickets.test.ts`:
- counts over 2+ pages, by one field and by two, keys as labels:
  `::by one field: the counts by status name, from both pages`,
  `::by two fields: one group per pair, keyed by both labels`,
  `::scans from the period's start, oldest first, checks each ticket, and
  stops past the period's end` (list pages);
- a third field: `::a third field is validation, with no request even on a
  cold schema`;
- free text and an unknown type: `::grouping by the free-text field %s`,
  `::grouping by a field of a type the code does not know …` (no request
  asserted, cached schema);
- over the budget: `::an estimate over the budget is refused without
  confirm, after the probe only`, `::an estimate from the search total over
  the budget is refused without confirm`;
- `truncated: true` beside the counts: `::a scan cut at the budget while it
  runs …`, the page-300 tests, `::past GROUP_CAP groups …`;
- `api_calls_used` = MockAgent count: `::on a cold schema it equals the
  MockAgent count …` and the scan tests.

`make quality` exit 0 on `51fc580`: vitest 36 files, 2434 tests; tools/checks
54 tests OK; gitleaks both passed.

Choices (`src/tools/toolsets/core/count-tickets.ts` header,
`docs/architecture/ticket-queries.md`, "T-036's choices"):
- `created_between` is required, so the query is always a search; page 1 is
  the probe; every request `expensive`.
- `total` ≤ 300: the search pages, estimate with `probe: 1` and the tickets
  after page 1; above: the ordered list scan, its estimate a floor
  (1 + ceil(total / 100)), stopped at the budget without `confirm`, the
  search filters checked locally (tag by exact membership).
- No page started after 20 s (`SCAN_START_MS`) of the one 30 s deadline;
  `confirm` lifts the budget only.
- Group-by: 1–2 fields, checked before the schema is read; closed types
  only (`GROUPABLE`, no date-time); `free_text_field`, `unsupported_field`.
- Hidden fields: built on `ticketOutput` as it is, so a hidden field counts
  every ticket under `null` (SPEC §7.3, not an access control).
- Each ticket id counted once; at most `GROUP_CAP` 200 groups, the rest as
  `groups_not_shown` with `truncated: true`; agents and groups keyed by id,
  a shared name shown `Name (id)`.

Reviews:
- Full round on `f37db09..8a72403`, R1 = `8a72403`: compliance Wireframes
  `none`; security 2 Low; code 3 Medium + 5 Low, info. All fixed in
  `51fc580`.
- Scoped round on `8a72403..51fc580`: the four quotes matched for all
  three; lists A empty; compliance Wireframes `none`. Lists B parked in
  `docs/improvements.md` (entry stamped `51fc580`).

Outside Files expected to change: `src/tools/toolsets/core/index.ts`
(registration), `test/server.test.ts` (the registry's tool list),
`docs/architecture/overview.md`, `docs/architecture/ticket-queries.md`,
`docs/improvements.md`, `docs/tasks/PLAN.md`.

## Dead ends
none

## Open doubts
- List and search may filter differently (tag case, spam or deleted
  tickets), so counts can shift between a `total` of 300 and 301.
- "No request" for a refused group-by holds with a cached schema only; on a
  cold one the schema's load is sent (no ticket request).
- Groups past `GROUP_CAP` are still held in memory while counting.
- The search path does not re-check `total` on later pages.
- Whether page 300 of the list links a page 301 is not measured.
- The budget is checked before each page only: one page's retries can pass
  it.

## Context pressure
Low: one session, no split.

## Next action
none: done.
