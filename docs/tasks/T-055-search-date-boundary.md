# T-055 — Measure search date boundary and time zone; widen accordingly

- **Type:** spike
- **Phase:** M1
- **Status:** done (2026-11-24)
- **Depends on:** T-043
- **Created:** 2026-11-24

## Goal
Know, by measurement on the real account, whether Freshdesk's search
`created_at:>'D'` / `<'D'` (and `updated_at`) keep the boundary day and
whose day they use (UTC or the account's time zone), so `count_tickets`
(T-036) and `export_tickets` (T-037) count exactly. Raised by T-043's
scoped review (2026-11-24, code-reviewer B1, security-reviewer B5): a
one-day widening can undercount for an account not on UTC.

## In scope
- GET-only probes in `scripts/smoke/` (through the smoke client, output
  counts and yes/no only: no id, subject, name, domain or key), with
  tests in `test/smoke.test.ts` as for T-022's probes:
  - for one recent day D (a weekday with tickets), the search totals of
    `created_at:'D'`, `created_at:>'D-1' AND created_at:<'D+1'`,
    `created_at:>'D' AND created_at:<'D+1'` and similar variants that
    tell inclusive from exclusive;
  - a local count, from the list endpoint (`updated_since` before D,
    `order_by=created_at`), of tickets whose `created_at` falls on D in
    UTC and on D in the account's time zone (the zone read from the
    account settings endpoint if one is readable, else Europe/Rome as a
    stated assumption).
- The orchestrator runs the probes and sends the output back.
- `docs/architecture/ticket-queries.md`: the measured semantics, with the
  date; the Open row closed.
- `src/tools/ticket-query.ts`: keep the one-day widening or change it to
  the measured amount; a test that a ticket at each measured boundary is
  returned and one just outside is not.

## Out of scope
- `count_tickets` and `export_tickets` themselves (T-036, T-037).

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §7.2

## Files expected to change
- `scripts/smoke/smoke.ts`, `test/smoke.test.ts`
- `docs/architecture/ticket-queries.md`
- `src/tools/ticket-query.ts`, `test/tools/ticket-query.test.ts`

## Wireframes
`none`

## Acceptance
`scripts/smoke/` gains GET-only probes printing counts and yes/no only
(no id, subject, name, domain or key), with `test/smoke.test.ts` cases as
for T-022's probes: for one recent day D, the search totals of
`created_at:'D'`, `created_at:>'D-1' AND created_at:<'D+1'` and the
inclusive/exclusive variants, compared with a local count from the list
endpoint of tickets whose `created_at` falls on D in UTC and on D in the
account's time zone; the orchestrator runs them on the real account;
`docs/architecture/ticket-queries.md` records, measured with the date,
whether `>`/`<` keep the boundary day and whose day they use, and the
Open row is closed; `src/tools/ticket-query.ts`'s widening is kept or
changed to the measured amount, with a test that a ticket at each
measured boundary is returned and one outside is not; `make quality`
green.

---
*Filled at `/handoff`:*

## Done
- Commits: `4f466de` (status), `31428d7` (probes), `8ed5436` (measured
  boundary, exact date queries), `1fae0e3` (full review fixes), and
  `T-055: scoped list A wording, done`. Built by a builder agent under the
  orchestrator (owner's instruction of 2026-11-23); the orchestrator ran
  the probes.
- Scoped review round (2026-11-24): security list A empty; code list A one
  item, A1 (`search_tickets`' description extended the measured rule to
  every date field, while only `created_at` was measured), fixed as wording
  only (the rule on `created_at`, "widen the range by a day" for any other
  date field) and not reviewed again (rule 9). Lists B: `dayBefore`
  boundary tests added (leap day, month end); the rest parked in
  `docs/improvements.md`, entry `1fae0e3`.
- Probes: `make smoke-date-probes` (`runDateProbes` in
  `scripts/smoke/smoke.ts`, cli `--dates`); tests in
  `test/smoke.test.ts::runDateProbes`, `::probeDays`, `::the date probes'
  zone helpers`.
- Measured 2026-11-24 on the real account (days 2026-11-17, 2026-11-18,
  2026-11-19; account zone readable and resolved; tickets on a different
  day in UTC and in the zone present, so the zone is told apart):
  `probe date_verdict: 1 of 8 readings predict all 15 totals: > inclusive,
  < inclusive, UTC day`. Recorded in `docs/architecture/ticket-queries.md`
  ("Date boundary"); the Open row is closed.
- Acceptance, "a ticket at each measured boundary is returned and one
  outside is not": met by the measurement itself (the search keeps day D
  on both sides, UTC); the unit test below is a regression pin of the
  query and of the local guard, not the proof.
- `src/tools/ticket-query.ts`: `created_between` is exact,
  `created_at:>'<from>' AND created_at:<'<to>'`. `updated_since` beside a
  search filter keeps its one-day widening, `updated_at:>'<UTC day − 1>'`,
  with the instant checked locally: `updated_at` was not measured (full
  review, 2026-11-24). `search_tickets`' description states the measured
  rule instead of "widen the range by a day". Tests: `test/tools/ticket-query.test.ts::created_between keeps
  00:00:00Z on from and 23:59:59Z on to, not the second either side
  (T-055)`, `::created_between is a search of exactly its days (inclusive,
  UTC; T-055), the days also checked locally`, `::with a search filter,
  updated_since is a day earlier in the query (updated_at not measured,
  T-055) and the instant checked locally`;
  `test/tools/core/search-tickets.test.ts::its description names the
  300-result cap, no full text and how the query is written`;
  `test/smoke.test.ts::runDateProbes > names the one reading a search
  under %j agrees with` (all eight readings); `test/tools/core/list-tickets.test.ts::created_between: the
  search asks exactly the days; a ticket outside them is still absent`.
- Choices: the `created_between` local check is kept as a guard (it drops
  nothing the measured search returns; keeping it is the smaller change and
  keeps T-027's local-check tests meaningful). The date probes are their
  own make target, not part of `smoke-probes`. Three Tue–Thu days, so one
  of them is likely to hold a ticket near midnight.
- **Outside "Files expected to change":** `Makefile`,
  `scripts/smoke/cli.ts` (the target), `docs/architecture/overview.md`,
  `src/tools/toolsets/core/list-tickets.ts` (comments only),
  `test/tools/core/list-tickets.test.ts` (query strings),
  `src/tools/toolsets/core/search-tickets.ts` (description) and its test,
  `docs/improvements.md`.

## Dead ends
none

## Open doubts
- `updated_at`'s day operators are assumed to behave as `created_at`'s
  (inclusive, UTC day) but were not measured: `updated_since` stays widened
  by a day, checked locally, until they are.
- The date probes assume Europe/Rome when the account's zone cannot be read
  or resolved; on 2026-11-24 it was read and resolved, so the fallback was
  not used.
- `find_similar_tickets` still widens its own `updated_at` day by one
  (harmless, an over-fetch checked locally): parked in
  `docs/improvements.md`, entry `8ed5436`.

## Context pressure
ok

## Next action
none: done.
