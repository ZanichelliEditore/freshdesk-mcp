# T-056 — Schema service reports its load's requests

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-24)
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
- Commits: `4b3c105` (status), `2a56dc9` (the service, `listTicketFields`,
  `get_ticket`, tests, overview), the close commit `T-056: review Lows,
  done` (frozen results, three test additions, overview sentence, this
  file, PLAN, journal).
- `src/schema/index.ts`: a loaded `SchemaResult` carries `attempts`: the
  three lists' `attempts` added up for the call that started the load, 0
  from the cache and for a call joining a load in flight; a failed result
  has none. Every result handed out is frozen (a failed one with its
  error). The service keeps its `#` fields and is frozen (T-050).
- `src/tools/toolsets/core/get-ticket.ts`: `api_calls_used` starts from the
  schema's `attempts`; the header and the description no longer state the
  gap. `src/tools/context.ts`, `get-ticket-schema.ts` and
  `eslint.tool-imports.json` are unchanged.
- **Outside "Files expected to change":**
  `src/client/resources/ticket-fields.ts` and its test. `listTicketFields`
  gave no `attempts`, so the load's first request could not be counted: it
  now passes `attempts` on success. That reverses T-054's note ("not this
  function's to pass on") for the success branch only; a failure is still
  `{ok, error}`. Also `test/tools/core/get-ticket-schema.test.ts` (one
  test, see below).
- Tests, failed first (12 red before `2a56dc9`'s code):
  - `test/schema/output.test.ts::SchemaService: the requests a load sent`:
    `::reports the load's requests to the call that started it, a retry
    included`, `::reports 0 to a call served from the cache`, `::reports 0
    to a call joining a load in flight, and the load's requests once`,
    `::reports the requests of each load: a load after the TTL counts
    again`, `::a load that fails at %s reports none, to the starter and to
    a joiner, and the next get() loads again` (the ticket fields, the
    agents, a malformed groups page);
  - `test/tools/core/get-ticket.test.ts::get_ticket: api_calls_used`:
    `::on a cold schema it equals the MockAgent count: the schema's load is
    in it` (replaces "leaves out the schema's load"), `::a cursor call on a
    cold schema loads it too, and counts the load the same way`, `::the
    call after a cold one counts its own requests only`, `::two calls on a
    cold schema at once count its load once between them`; `the
    listing::is listed read-only, with its cost and the
    data-not-instructions sentence` (the new sentence, and no "but not a
    load").
- Tests from the full review (close commit):
  - `test/schema/output.test.ts::hands out frozen results: the starter
    cannot swap the schema a joiner or a later call gets` and `::hands out
    a failed load's result frozen, its error too`: both red against
    `2a56dc9`'s service (checked by restoring it), green with the freeze;
  - `test/client/resources/ticket-fields.test.ts::reports the requests it
    sent: 1, and 2 after a retried 503`: green on arrival (the code was in
    `2a56dc9`); no exact-shape assertion in that file was red;
  - `test/tools/core/get-ticket-schema.test.ts::returns {fields} and
    nothing else, on a cold load and from the cache`: green on arrival. The
    existing tests read `.fields` only, so none would have caught an
    `attempts` key in the output; this one does.
- Choices: `attempts` on the success branch of the result, so the context
  passes nothing on; a joiner gets a frozen copy with `attempts: 0` and the
  same schema object; the tool's `cost` string is unchanged (its "at least
  3 … when the ticket-field schema is not cached" states the requests, not
  the gap); `settle` moved to module scope in `test/schema/output.test.ts`.
- Full review round on `29a34ff..2a56dc9`: no blocking finding
  (compliance: Wireframes `none`; security 1 Low, 1 info; code 4 Low).
  Scoped round on `2a56dc9..e09fd24` (the freeze of the results changed a
  mechanism): list A empty for all three; lists B parked in
  `docs/improvements.md`, entry `e09fd24`. `make quality` exit 0 on the
  close commit's tree.

## Dead ends
none

## Open doubts
- A schema load's requests are reported by no call's `api_calls_used` in
  three cases: the load was started by `get_ticket_schema` (no
  `api_calls_used`); it was started by a `get_ticket` call that then
  failed (an error result has none); the load itself failed. The limiter
  sees every request. Said in `docs/architecture/overview.md`.
- The freeze of a failed result reaches the client's error object
  (`deepFreeze`): no caller changes it today (suite green).

## Context pressure
ok

## Next action
none: done.
