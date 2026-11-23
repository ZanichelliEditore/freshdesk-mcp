# T-039 — Smoke over the `core` tools; M1 acceptance

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
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
- C9 and C10 are exercised as the use cases read: the KB or canned reads
  plus recent tickets by category through `search_tickets`.
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

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
