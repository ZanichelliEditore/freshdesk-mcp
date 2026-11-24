# T-054 — `api_calls_used` counts every attempt

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-24)
- **Depends on:** T-021
- **Created:** 2026-11-24

## Goal
A list tool's `api_calls_used` equals the requests it sent, retries
included, so the per-call budget (T-035) and the envelope tell the truth.
T-021's scoped review (2026-11-24) showed a page retried after a 503
counting once.

## In scope
- `src/client/http.ts`: `paginate`'s return value (today
  `{ truncated }`) also gives the number of attempts sent for all its
  pages, retries and a deadline-cut attempt included. `requestWithRetry`
  reports its attempts in a way `paginate` can sum; the builder picks the
  smallest form (for example an `attempts` field on the result).
- `src/client/resources/list-all.ts`: `listAll`'s ok result gives
  `attempts` (keep or replace `pages`; say which).
- `src/tools/toolsets/core/list-agents.ts`, `list-groups.ts`:
  `api_calls_used` from the attempts; the cost lines and descriptions stop
  saying retries are not counted; the "recorded limitation" tests become
  plain equality with the MockAgent count.
- `docs/architecture/overview.md` brought to what is then true.

## Out of scope
- Any other caller of `requestWithRetry` (the schema service, the smoke
  script) beyond what a type change forces.
- An error result's count: a failed list returns no envelope.

## Spec sections to read
- SPEC.md §7.1
- SPEC.md §7.2
- SPEC.md §8.4

## Files expected to change
- `src/client/http.ts`
- `src/client/resources/list-all.ts`
- `src/tools/toolsets/core/list-agents.ts`, `list-groups.ts`
- `test/client/paginate.test.ts`, `test/client/http-retry.test.ts` if the
  result type changes there, `test/client/resources/*.test.ts` as forced
- `test/tools/core/list-agents-groups.test.ts`
- `docs/architecture/overview.md`

## Wireframes
`none`

## Acceptance
`test/client/paginate.test.ts` (MockAgent): a page answered 503 then 200 is
reported as 2 attempts by `paginate`'s result and by `listAll`; a page sent
once is 1; a page cut by the deadline counts the attempts sent;
`test/tools/core/list-agents-groups.test.ts`: the "recorded limitation"
tests are replaced by `api_calls_used` equal to the MockAgent count after a
503 then 200, for both tools, and both cost lines no longer say retries are
not counted; T-021's acceptance limitation clause is then met by the plain
rule; `make quality` green.

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
