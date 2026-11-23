# T-047 — Caller deadline through `requestWithRetry`, `paginate` and the schema load

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-23)
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
- Commits `c44a36e` (build) and `97c11e8` (full review fixes).
- `requestWithRetry(request, callerDeadline)`, `paginate(request, cap,
  deadline)`, `listTicketFields`, `listAgents`, `listGroups` and `listAll`
  with an optional trailing deadline (epoch ms); `SchemaService` sets
  `LOAD_DEADLINE_MS` (30 s) for one load. A deadline already reached, or
  not a number, is refused in `request` before the limiter is asked.
- `test/client/http-retry.test.ts`, block "a caller's deadline": "5 s
  away: the GET in flight is aborted at it and nothing is sent after",
  "5 s away: a backoff that would cross it is not started", "a limiter
  wait that would end exactly at it is refused as rate_limited, with no
  sleep", "a limiter wait that ends one millisecond before it is served",
  "%d ms away does not lengthen the call past the 30 s", "%s: nothing is
  sent and the limiter is not asked", "passed, with a path that is not a
  template: the caller's mistake still throws", "a write refused at entry
  is not retryable, like any expiry of a write", "undefined is no
  deadline: the call is as without one".
- `test/client/paginate.test.ts`, block "paginate: one deadline for all
  its pages" (four cases).
- `test/schema/output.test.ts`, block "SchemaService: a cold load ends
  within 30 s" (five cases).
- `test/client/resources/ticket-fields.test.ts::listTicketFields: a
  caller's deadline`.
- Red before green: 30 cases failed on `da02ddf`'s `src/` (the new ones,
  and T-013's that quote the expiry message).
- `docs/architecture/overview.md`: the four entries the deadline touches.
- Split point not needed.

## Dead ends
none

## Open doubts
- Builder's choices, accepted by the orchestrator on 2026-11-23, for the
  owner to confirm: (1) the expiry message no longer names 30 s ("No
  answer from Freshdesk before the call's deadline: the call was given
  up."), which changed the text T-013's tests expect; (2) a deadline
  already reached, `NaN` included, is refused as `network` without asking
  the limiter, and a write so refused is `retryable: false` though it was
  not sent (T-014 decides); (3) `test/client/resources/ticket-fields.test.ts`
  changed, beyond "Files expected to change".
- `97c11e8` also rewrote the backoff check of `requestWithRetry` so that a
  deadline that is not a number starts no retry: a mechanism change beyond
  the review's list, seen by the scoped round.
- `test/lint-rules.test.ts:47`, first case: its 5 s timeout fails under
  machine load (not from this task; `docs/improvements.md`, `97c11e8`).

## Context pressure
ok

## Next action
none: `/pickup` takes T-050.
