# T-009 — Client resources: agents and groups (read)

- **Type:** build
- **Phase:** M0
- **Status:** done (2026-11-23)
- **Depends on:** T-008
- **Created:** 2026-11-20

## Goal
Typed, runtime-validated lists of agents and groups, paged, for id → name mapping.

## In scope
- `src/client/resources/agents.ts`, `groups.ts`: zod schemas, list functions over the pagination iterator.
- Synthetic fixtures (invented names, `example.com`).

## Out of scope
- Writes on these resources.
- Mapping logic (T-010).

## Spec sections to read
- SPEC.md §7.3
- SPEC.md §8.3

## Files expected to change
- `src/client/resources/{agents,groups}.ts`
- `src/client/resources/list-all.ts` (added at build, the shared paged list; judged justified by code-reviewer)
- `test/client/resources/{agents,groups}.test.ts`
- `test/fixtures/`

## Wireframes
`none`

## Acceptance
MockAgent tests list agents and groups across 2+ pages with the expected id → name values; a malformed item fails with a defined error; `make quality` green.

---
*Filled at `/handoff`:*

## Done
- `e85b3db`: `src/client/resources/agents.ts` (`listAgents`),
  `groups.ts` (`listGroups`), `list-all.ts` (100 per page, at most 10
  pages, each page checked by zod before the next), fixture
  `test/fixtures/agents-groups.ts`, tests
  `test/client/resources/{agents,groups}.test.ts`, line in
  `docs/architecture/overview.md`.
- `9676d5b` (review fixes): `paginate` returns `{ truncated }`,
  `ListResult` carries `truncated`; literal `per_page=100` in the tests;
  7 tests in `test/client/paginate.test.ts::"paginate: whether a cap cut
  the list"`.
- Acceptance: `agents.test.ts::"follows Link across two pages and yields
  every agent's id and name"`, `::"refuses %s on page 2 as server, with no
  body text"` (7 rows), and the same in `groups.test.ts` (6 rows);
  `::"stops after 10 pages when page 10 still has a Link, and says the list
  is cut"`. 15 and 13 tests. `make quality` green on `9676d5b`: 422 vitest,
  54 `tools/checks`.

## Dead ends
none

## Open doubts
- A malformed page is `server` with its real status, not retryable, fixed
  message, as T-008: builder's choice, accepted by the orchestrator for the
  owner on 2026-11-23.
- Schemas follow Freshdesk's API v2 documentation, not a live account: an
  agent without a `contact.name` or a group without a `name` fails the
  whole list (fail-closed).
- The page cap is 10 pages of 100 (1,000 items); a cut list now says
  `truncated: true`, but nothing reads it yet (T-010).

## Context pressure
low

## Next action
none (done).
