# T-047 — Caller deadline through `requestWithRetry`, `paginate` and the schema load

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
- **Depends on:** T-015
- **Created:** 2026-11-23

## Goal
A caller's deadline reaches every request of a many-call operation, so a
cold schema load ends within 30 s (owner, 2026-11-23). Today
`requestWithRetry` takes none (`src/client/http.ts:252-254`), `paginate`
gives each page its own 30 s, and the resources take only `http`.

## In scope
- `requestWithRetry` takes an optional caller deadline that can only shorten
  its own 30 s; `paginate` takes one deadline for all its pages.
- `listTicketFields`, `listAgents`, `listGroups` and `listAll` accept it and
  pass it on.
- `SchemaService` sets one 30 s deadline for a cold load (ticket fields,
  agents, groups). On expiry no further request is started and the error is
  T-013's: `network`, `http_status: null`, `retryable: true`; a limiter wait
  refused because it would reach the deadline stays `rate_limited`. The
  failure is not cached.
- Runs after T-015 (both touch `src/schema/index.ts`) and before T-014,
  which changes the same function.

## Out of scope
- T-014's minimum time for a write.
- A deadline for a tool's own many-call operation: each tool task bounds its
  calls.

## Spec sections to read
- SPEC.md §7.1
- SPEC.md §7.3
- SPEC.md §7.2

## Files expected to change
- `src/client/http.ts`
- `src/client/resources/ticket-fields.ts`, `agents.ts`, `groups.ts`,
  `list-all.ts`
- `src/schema/index.ts`
- `test/client/http-retry.test.ts`
- `test/client/paginate.test.ts`
- `test/schema/output.test.ts`
- `docs/architecture/overview.md`

## Wireframes
`none`

## Split point
`requestWithRetry` and `paginate` first; the resources and the schema load
second.

## Acceptance
`test/client/http-retry.test.ts` (MockAgent, fake clock): `requestWithRetry`
given a deadline 5 s away returns at or before it and sends nothing after; a
caller deadline later than 30 s does not lengthen the call; with none the
behaviour is unchanged; `test/client/paginate.test.ts`: a `paginate` given a
deadline asks for no page after it and ends with the error, not with a short
list passed off as complete; `test/schema/output.test.ts` (fake clock): a
cold load whose answers would pass 30 s returns `network` with `retryable:
true` at or before 30 s, the MockAgent count does not grow afterwards, and
the next `get()` loads again; a limiter wait that would reach the deadline
comes back `rate_limited`; a load that ends sooner is unchanged; `make
quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
