# T-055 — Measure search date boundary and time zone; widen accordingly

- **Type:** spike
- **Phase:** M1
- **Status:** todo (2026-11-24)
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
Commits and tests, not narration.

## Dead ends
none

## Open doubts
none

## Context pressure
low | ok | tight | overflowed — and, if tight or overflowed, how it should
have been split.

## Next action
Only if the status is still `doing`: the exact first step for the next
session.
