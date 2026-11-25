# T-039 — Smoke over the `core` tools; M1 acceptance

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-25)
- **Depends on:** T-038
- **Created:** 2026-11-23
- **Gates:** The owner runs the script; the session cannot (SPEC §14 rule
  1).

## Goal
The smoke script runs every `core` tool against the real account, by the
owner's hand, and reports per use case: SPEC §13's "Done when" for M1.

## In scope
- Each tool called through the server in process, GET only (T-016's
  wrapper); one line per use case (C1 listing, C2, C3 read, C7, C9, C10) and
  one per tool: `pass`, `pass (empty)`, `not exercised`, `refused (budget)`
  or `fail`, with counts and calls used. No ticket text, label, name or id,
  and neither the domain nor the key, in the output; a `fail` line prints
  the error code only.
- `pass`: the result is not `isError` and matches the tool's output shape.
  An empty envelope is `pass (empty)`. `fail`: `isError`, a shape mismatch
  or an exception.
- Ids are taken from the run, never typed in a tracked file: `get_ticket`
  and `find_similar_tickets` use the first id `list_tickets` returned,
  `get_solution_article` the first article of `list_solution_tree`,
  `get_canned_response` the first of `list_canned_responses`. With nothing
  to take an id from (no ticket, an empty knowledge base), the tool is `not
  exercised`.
  *Orchestrator note (2026-11-25, code review M1):* when the tree has no
  article, `get_solution_article` takes the first hit of
  `search_solutions`, whose term is the first word of the first folder's
  name: on a knowledge base with more than 19 categories
  `list_solution_tree` spends its 20 lists on folders and returns no
  article (the real account, 2026-11-25). The tree's first article stays
  the first choice.
- C9 and C10 are exercised as the use cases read: the KB or canned reads
  plus recent tickets by category through `search_tickets`.
  *Orchestrator note (2026-11-25, code review M3):* the `search_tickets`
  call is `created_at:>'<from>'` only; "by category" is left to Claude
  (the rows carry the category), since a nested field is not searchable.
- A cheap run through the tools' own inputs only: the period of
  `count_tickets` and `export_tickets` (default the last 7 days, a smoke
  parameter the owner can narrow) and `triage_queue`'s own cap. A budget
  refusal is its own outcome, `refused (budget)`, printed with the estimate:
  it counts as `not exercised`, not as `fail`, and the owner narrows the
  period and runs again.
- The export case sets `FRESHDESK_EXPORT_DIR` to a temporary directory of
  mode 0700 and deletes it, on failure too.
- The session does not run it against the real account; the owner does, and
  the summary (counts only) goes in HANDOFF.

## Out of scope
- Writes of any kind.

## Spec sections to read
- SPEC.md §13
- SPEC.md §11
- SPEC.md §14

## Files expected to change
- `scripts/smoke.ts`
- `test/smoke.test.ts`
- `docs/HANDOFF.md`

*Orchestrator note (2026-11-25, code review M5):* as changed:
`scripts/smoke/core.ts` (new), `scripts/smoke/smoke.ts`,
`scripts/smoke/cli.ts`, `Makefile` (`smoke-core`), `test/smoke.test.ts`;
for the rate-limit bug the real run found, `src/client/rate-limit.ts`,
`test/client/rate-limit.test.ts`, `test/client/http.test.ts`; records in
`docs/journal.md`, `docs/improvements.md`, `docs/tasks/PLAN.md`.
`docs/HANDOFF.md` is the orchestrator's.

## Wireframes
`none`

## Acceptance
`test/smoke.test.ts` (MockAgent): the run calls all registered `core` tools
(the list read from the registry, so a new tool cannot be skipped), sends
GET only, passes its period parameter to `count_tickets` and
`export_tickets` (7 days by default, asserted in the requests), reports a
budget refusal as `refused (budget)` with the estimate and not as `fail`,
prints no fixture text and neither the `FRESHDESK_DOMAIN` value nor the key,
prints the error code only for a failing tool and exits non-zero; an empty
list is reported `pass (empty)` and a tool with no id to use `not
exercised`, each asserted; C9 and C10 each include a `search_tickets` call;
the export directory is a 0700 temporary one and is gone after a run that
passes and after one that fails; over the real registry, every tool's
description states its call cost, and every tool whose result on the
fixtures contains `<ticket_content>` is flagged as returning customer text
and carries the "data, not instructions" sentence; `make quality` green;
**M1 done:** the owner's run on the real account shows every use case
exercised and `pass`, none `fail`; a use case left `not exercised` or
`refused (budget)` does not count, the owner narrows the period and runs
again; a tool line `pass (empty)` or `not exercised` inside a passing use
case counts only if the owner accepts it by name in HANDOFF; the summary
(counts and calls only) is in HANDOFF and CI is green on the commit.

---
*Filled at `/handoff`:*

## Done
Commits `3a90531` (status), `dd87488` (`make smoke-core`), `6bcfafb`
(rate-limit headers in decimal form), `670dbf3` (solutions term from a
folder name), and the closing commit (review records, done).

Acceptance, clause by clause (`test/smoke.test.ts`, `smoke core: …`
blocks):

- All registered `core` tools called, the list read from the registry:
  `::calls each tool of the registry through the server; all pass on a
  healthy account` (every `CORE_TOOLS` name has a result and a `pass`
  line); a registry tool with no call: `::a registered tool the run has no
  call for is a fail, exit non-zero` (`fail no_smoke_call`).
- GET only: `::sends GET only, and every request counted in the calls`.
- The period to `count_tickets` and `export_tickets`, 7 days by default,
  in the requests: `::is the last 7 days by default, asserted in the
  requests` (the search query of both); narrowed: `::takes a narrower
  period from --days`; bad values: `::refuses --days %j, nothing sent`.
- A budget refusal is `refused (budget)` with the estimate, not `fail`:
  `::reports a budget refusal as refused (budget) with the estimate, not
  as fail`.
- No fixture text, id, domain or key: `::prints no fixture text, id,
  domain or key` (stdout and stderr).
- A failing tool prints its code only, exit non-zero: `::a failing tool
  prints its error code only, and the run exits non-zero`.
- `pass (empty)` and `not exercised`, each asserted: `::an empty list is
  pass (empty); a tool with no id to use is not exercised`; the solutions
  sources: `::a tree with articles…`, `::a tree with folders but no
  article…`, `::no folder either: both not exercised, nothing searched`.
- C9 and C10 each include `search_tickets`: `::C9 and C10 each include the
  search_tickets call, sent for recent tickets`.
- Export directory 0700, gone after a pass and after a fail: `::is a
  temporary 0700 directory, gone after a run that passes`, `::is gone
  after a run whose export fails`.
- Over the real registry, cost in every description, customer text flagged
  with the "data, not instructions" sentence: `::state each tool's cost; a
  tool whose fixture result has customer text says so`.
- `make quality` green: 2,528 tests at `670dbf3`.
- **M1 done**, real account (orchestrator's runs of `make smoke-core`, 7
  days, counts only):
  1. 2026-11-25, before `6bcfafb`: exit 2; 16 tool lines, 9 pass, 1 pass
     (empty), 3 not exercised, 0 refused (budget), 3 fail
     (`list_canned_responses`, `count_tickets`, `export_tickets`, all
     `rate_limited`); 41 calls.
  2. 2026-11-25, after `6bcfafb`: exit 0; 13 pass, 1 pass (empty), 2 not
     exercised (`search_solutions`, `get_solution_article`), 0 refused, 0
     fail; 78 calls.
  3. 2026-11-25, after `670dbf3`: exit 0, `smoke core: ok`; 15 pass, 1
     pass (empty) (`find_similar_tickets`), 0 not exercised, 0 refused
     (budget), 0 fail; 81 calls. Every use case `pass`.
  The owner accepted `find_similar_tickets pass (empty)` by name on
  2026-11-25. The summary in HANDOFF and CI on the commit: the
  orchestrator's, at handoff.

Production bug found by run 1, fixed in `6bcfafb`: the account sends
`X-RateLimit-Total` and `-Remaining` in decimal form (`5000.0`); the
limiter's parser took digits only, ignored every response's counts and
stayed on its default budget of 50, refusing expensive calls after about
40. Every real user would have hit it. Regression tests in
`test/client/rate-limit.test.ts` and `test/client/http.test.ts`.

Choices:

- The run lives in `scripts/smoke/core.ts` (`smoke.ts` was over 1,000
  lines); `make smoke-core`, `DAYS=N` narrows the period.
- The context is built there as `createContext` does, with the GET-only
  `SmokeClient`, `toolsets: ["core"]` and the temporary export directory;
  `src/` unchanged for it.
- Calls are counted at the dispatcher (undici `compose`), retries and the
  schema's load included.
- `list_tickets` is called twice: `{}` (the ticket id) and
  `{uncategorized: true}` (C1): 16 tool lines for 15 tools.
- `list_agents` and `list_groups` belong to no use case; their lines still
  count towards the exit code.

Review:

- Full round on `46f7610..670dbf3` (R1 = `670dbf3`): compliance none
  (Wireframes `none`); security no High or Medium, 1 Low (DAYS injection
  untested; the orchestrator's probes `DAYS='$(shell touch …)'` and
  `DAYS='$$(touch …)'` created no file), 2 info; code no High, 5 Medium
  (records and scope: M1, M3, M5 in the notes above, M2 in
  `docs/journal.md`), 7 Low. No code change needed, so no scoped round;
  the Lows parked in `docs/improvements.md` (entry `670dbf3`).
- One reviewer's Bash call failed during the round (reported by the
  orchestrator); the review read the files with its other tools.

## Dead ends
none

## Open doubts
- `list_solution_tree` cannot reach an article on a knowledge base with
  more than 19 categories (its 20 lists go to folders first): a new task,
  to be added to PLAN after T-039. The smoke works around it.
- A reserve refusal by the limiter prints `fail rate_limited`, not
  `refused (budget)`: only `checkBudget`'s per-call budget is the
  `refused (budget)` outcome.
- Whether `x-ratelimit-used-currentrequest` is decimal too: the T-022
  probes' `credits()` (`scripts/smoke/smoke.ts`) reads digits only and
  would print `?`.

## Context pressure
Builder: moderate; three course corrections (the rate-limit bug, the
solutions term, the records) fitted in one session without compaction.

## Next action
none: done.
