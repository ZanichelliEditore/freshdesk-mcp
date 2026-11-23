# T-015 — App context: client, limiter and schema service built from config

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
- **Depends on:** T-011
- **Created:** 2026-11-23

## Goal
One function builds the `HttpClient`, the limiter and the `SchemaService`
from a `Config`; every tool gets its schema and team `fields` from it. Sized
from the `proposed` row of 2026-11-23; not folded into the first tool (SPEC
§14.1: the mechanism first).

## In scope
- `limits.schema_ttl_s` is the service's TTL; the team `fields` reach
  `ticketOutput` through the context, not through each tool.
  `ticketOutput`'s hiding stays as T-010 built it and is not extended
  (owner, 2026-11-23).
- The agents and groups name maps cannot be changed at runtime, not only by
  type (`docs/improvements.md` `460a596` B1).
- `make quality` runs `build` (owner, 2026-11-23), as CI already does.

## Out of scope
- MCP server, tools (T-019 on).
- A warning for a `hidden` key that matches no field: parked, hidden fields
  are not handled further for now (owner, 2026-11-23),
  `docs/improvements.md`.
- The 30 s deadline of a cold schema load: T-047, which needs a caller
  deadline through `requestWithRetry` and `paginate`.

## Spec sections to read
- SPEC.md §7.3
- SPEC.md §10

## Files expected to change
- `src/tools/context.ts` (name is the builder's)
- `src/schema/index.ts`
- `test/tools/context.test.ts`
- `test/schema/output.test.ts` (frozen-map case)
- `Makefile`
- `docs/architecture/overview.md`

## Wireframes
`none`

## Acceptance
`test/tools/context.test.ts` (MockAgent, fake clock): with a team file
setting `limits.schema_ttl_s: 60` the schema is fetched once within 60 s and
again after it; a field the team file hides is absent from `ticketOutput`
called through the context (T-010's behaviour, unchanged); `set` on the
agents or groups map throws or has no effect at runtime; `make quality` runs
the build and is green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
