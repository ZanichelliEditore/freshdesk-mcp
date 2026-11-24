# T-035 — Cost estimate and per-call budget

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-24)
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
- Commits: `f4a8b98` (status), `293a780` (build), `40b6171` (full review
  fixes), and the close commit `T-035: done; task file, parked review
  items`. Built by a builder agent under the orchestrator (owner's
  instruction of 2026-11-23).
- `src/tools/budget.ts`: `estimateCalls({tickets, pageSize, conversations,
  probe?})` and `checkBudget(context, estimate, confirm)`; the mechanism is
  in the file's header and `docs/architecture/overview.md`. No caller yet
  (T-036, T-037).
- **Outside "Files expected to change":** `src/client/rate-limit.ts`
  (`reserveRefusal()`, read-only, no token, the same error `acquire` gives;
  `acquire` and it share `#belowReserve`) and `src/client/http.ts`
  (`reserveRefusal()` passing it on): the context does not expose the
  limiter (T-050), so its reserve could not be read otherwise; the client
  keeps no own keys and stays frozen. `test/client/rate-limit.test.ts`
  (its tests). `test/tools/rows.test.ts` and `test/tools/ticket-query.test.ts`:
  hand-built `TeamConfig` fixtures gained `call_budget: 250`, or
  `tsc --noEmit` failed. `docs/architecture/overview.md`, `docs/journal.md`,
  `docs/improvements.md`. `src/config.ts` and the example file were
  expected: `limits.call_budget` (`z.int().positive().default(250)`), the
  `hidden` comment now SPEC §7.3's wording, the example sets 250.
- Tests, `test/tools/budget.test.ts`:
  - `::estimateCalls` (`::2,000 tickets at 100 a page with conversations
    estimate 2,020 calls`; `::counts one page per pageSize tickets, one call
    per ticket for conversations, and the probe` (300 at 30 = 10; 245 at 30
    with conversations and probe 1 = 255); `::refuses a ticket count of
    %s`; `::refuses a page size of %s`; `::refuses a probe of %s`);
  - `::checkBudget: the per-call budget` (`::refuses an estimate over the
    budget without confirm, naming both, with no request sent`; `::lets an
    estimate over the budget run with confirm: true`; `::lets an estimate
    at exactly the budget run, and refuses one call more`; `::reads the
    budget from limits.call_budget`; `::refuses a malformed estimate (%s)
    with and without confirm (fails closed)` (NaN, -1, 1.5, ±Infinity,
    `null`, `"5"`); `::lets an estimate of 0 run`);
  - `::checkBudget: the reserve` (`::below the reserve refuses as
    rate_limited even with confirm: true, sending nothing`; `::below the
    reserve refuses an estimate within the budget too`; `::gives the same
    refusal the limiter gives the first expensive request`; `::lets the call
    run once the window has ended`; `::at the reserve, not below it, lets the
    call run`).
  - `test/client/rate-limit.test.ts::reserveRefusal: the reserve, read
    without a call` (`::below the reserve gives the refusal the next
    expensive acquire gives`; `::gives none at the reserve, with no headers
    seen, and once the window has ended`; `::takes no token and starts no
    pacing`).
  - `test/config.test.ts`: `::team config: defaults` (`call_budget: 250` in
    every default case, 1000 in `::returns what the file sets`); `::a call
    budget of zero`, `::a fractional call budget`;
    `::examples/team-config.example.json::parses, and sets every team key`
    (`call_budget` 250).
- **Failed first:** build: `test/tools/budget.test.ts` whole (no module),
  the three `reserveRefusal` cases, and five config cases (both defaults
  cases, `::keeps the other limits' defaults when one is set`, `::returns
  what the file sets`, the example). Review fixes: 16 (the page-size and
  probe example, 5 page sizes, 3 probes, 7 malformed estimates). Green
  before the code: `::a call budget of zero` and `::a fractional call
  budget` (the strict schema refused the unknown key at the same path;
  journal), the strengthened no-token test, `::lets an estimate of 0 run`.
- **Choices:**
  - `checkBudget` returns a `FreshdeskError` or `undefined` (a gate, not a
    wrapper around the run).
  - Order: the reserve first (for every estimate, within the budget too),
    then a malformed estimate, then the budget; so below the reserve an
    over-budget call without `confirm` gets `rate_limited`.
  - The budget refusal and the malformed-estimate refusal are `validation`,
    `http_status: null`, not retryable; `confirm: true` passes neither a
    reserve refusal nor a malformed estimate. The malformed message quotes
    no value.
  - The accessor covers the reserve only (the floor is below it, so it is
    covered and errs closed); the 429 hold and pacing stay `acquire`'s.
  - `probe` defaults to 0 inside the function (not a tool input schema).
- Reviews: full round (compliance Wireframes `none`; security 1 Low, a
  malformed estimate passed with `confirm`, fail-open; code 2 Medium, the
  page size and probe, the list-scan scope; 2 Low, the no-token assertion,
  the floor wording; 1 info), all fixed in `40b6171`. Scoped round: list A
  empty for all three; list B parked in `docs/improvements.md`.

## Dead ends
none

## Open doubts
- For T-036 and T-037: pass a named page-size constant per endpoint
  (search 30, list 100), never a literal; always pass `probe` (search page
  1); a call refused after the probe has still spent it, so do not report
  "nothing sent"; the estimate covers a path whose ticket count is known
  up front (search, `total` ≤ 300): a list scan must be stopped at the
  budget while it runs.
- `reserveRefusal` ignores a 429 hold: the gate passes during one, and
  `acquire` still refuses or waits on the first request.
- The team file can raise `call_budget` to any safe integer: it is trusted
  config, no upper bound.

## Context pressure
Low: one builder session; the task's files, `rate-limit.ts`, `http.ts`,
`context.ts`, `ticket-queries.md`, SPEC §7.2, §7.3 and §10.

## Next action
none: done.
