# T-035 — Cost estimate and per-call budget

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
- **Depends on:** T-019
- **Created:** 2026-11-23

## Goal
The mechanism of SPEC §7.2's last bullet: an operation needing many calls
estimates them first, reports the estimate and is refused beyond a budget
unless `confirm: true`.

## In scope
- An estimate function and a gate used by `count_tickets` and
  `export_tickets`; the budget is a new team-file key, `limits.call_budget`,
  default 250 (owner, 2026-11-23), the example file updated.
- `confirm: true` never overrides the limiter: below the reserve the refusal
  stands.
- While in `src/config.ts`: the comment on `hidden` (`:73`, "Left out of
  every output") is corrected to what SPEC §7.3 now says.

## Out of scope
- `confirm.ts` for sends (M3).

## Spec sections to read
- SPEC.md §7.2
- SPEC.md §10

## Files expected to change
- `src/tools/budget.ts`
- `src/config.ts`
- `examples/team-config.example.json`
- `test/tools/budget.test.ts`
- `test/config.test.ts`

## Wireframes
`none`

## Acceptance
`test/tools/budget.test.ts`: 2,000 tickets with conversations estimate 2,020
calls; an estimate over the budget without `confirm` is refused with the
estimate and the budget in the message and no request sent; with `confirm:
true` it runs; below the reserve it is refused as `rate_limited` even with
`confirm: true`; an estimate at exactly the budget runs;
`test/config.test.ts`: `limits.call_budget` defaults to 250, rejects 0 and a
non-integer, and the example file parses; `make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
