# T-056 — Schema service reports its load's requests

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-24)
- **Depends on:** T-026, T-054
- **Created:** 2026-11-24

## Goal
A tool that loads the schema can count that load in `api_calls_used`.
T-026's full review (2026-11-24) showed `get_ticket` under-reporting on a
cold schema: 7 requests sent, 4 reported.

## In scope
- `src/schema/index.ts`: `SchemaService.get()` also reports the requests
  its load sent (retries included, from T-054's `attempts`) to the call
  that started the load; a call served from the cache, or joining a load
  already in flight, gets 0. The builder picks the smallest form and
  keeps the service frozen and without own keys (T-050).
- `src/tools/context.ts` only if the context must pass the count on.
- `src/tools/toolsets/core/get-ticket.ts`: `api_calls_used` includes the
  schema load; the description and cost stop stating the gap.
- `docs/architecture/overview.md` brought to what is then true.

## Out of scope
- `get_ticket_schema`'s output (it has no `api_calls_used`).
- The resources' failed results (they report no attempts).

## Spec sections to read
- SPEC.md §7.2
- SPEC.md §7.3
- SPEC.md §8.4

## Files expected to change
- `src/schema/index.ts`
- `src/tools/context.ts` (only if needed)
- `src/tools/toolsets/core/get-ticket.ts`
- `test/schema/output.test.ts`, `test/tools/context.test.ts` as forced
- `test/tools/core/get-ticket.test.ts`
- `docs/architecture/overview.md`

## Wireframes
`none`

## Acceptance
`test/schema/output.test.ts` (MockAgent, fake clock): `SchemaService.get()`
reports the requests its load sent, retries included, to the call that
started the load, and 0 to a call served from the cache or joining a load
in flight; a failed load reports none and the next `get()` loads again;
`test/tools/core/get-ticket.test.ts`: on a cold schema `api_calls_used`
equals the MockAgent count, the "leaves out the schema's load" test is
replaced by it, and the description and cost no longer state the gap;
`get_ticket_schema` is unchanged in output; T-026's acceptance limitation
clause is then met by the plain rule; `make quality` green.

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
