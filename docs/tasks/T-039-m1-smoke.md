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
  one per tool: `pass`, `pass (empty)`, `not exercised` or `fail`, with
  counts and calls used. No ticket text, label, name or id in the output.
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
- The export case sets `FRESHDESK_EXPORT_DIR` to a temporary directory and
  deletes it.
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
GET only, prints no fixture text, and exits non-zero when a tool fails; an
empty list is reported `pass (empty)` and a tool with no id to use `not
exercised`, each asserted; C9 and C10 each include a `search_tickets` call;
over the real registry, every tool's description states its call cost and
each of `get_ticket`, `list_tickets`, `search_tickets`, `triage_queue` and
`find_similar_tickets` carries the "data, not instructions" sentence; `make
quality` green; **M1 done:** the owner's run on the real account shows every
use case `pass`, none `fail`; a `pass (empty)` or `not exercised` line
counts only if the owner accepts it by name in HANDOFF; the summary (counts
and calls only) is in HANDOFF and CI is green on the commit.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
