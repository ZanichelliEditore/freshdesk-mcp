# T-015 — App context: client, limiter and schema service built from config

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-23)
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
- `src/client/http.ts`, `src/config.ts`, `test/config.test.ts`,
  `docs/improvements.md` (added 2026-11-23 with the full review round's
  fixes, approved by the orchestrator for the owner)

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
- `da373b7`: `createContext(config, dispatcher)` in `src/tools/context.ts`;
  `FrozenMap` for the agents and groups name maps in `src/schema/index.ts`;
  `build` in `make quality`. `b4a1571`: the full round's fixes
  (`#authorization`, `#dispatcher`, `#http`; a deep-frozen clone of the team
  settings and a frozen context object; `limits.floor_pct` above
  `reserve_pct` a `ConfigError`; class and prototype of `FrozenMap` frozen).
  The handoff commit: wording only, after the scoped round.
- Acceptance, by test:
  - TTL: `test/tools/context.test.ts::fetches the schema once within 60 s and again after it`.
  - Hidden: `test/tools/context.test.ts::leaves a field the team file hides out of ticketOutput called through the context`.
  - Maps: `test/tools/context.test.ts::refuses set, delete and clear on agents` (and `groups`);
    `test/schema/output.test.ts::hands out a frozen schema: a mutation throws and the cache is unchanged`.
  - Build: `make -n quality` lists `npm run build`; `make quality` exit 0.
- Review fixes, by test: `test/tools/context.test.ts::exposes the client, the limiter, the schema service and the team settings, not the key`,
  `::freezes the team settings and the context object`,
  `::keeps its own copy of the team settings: changing the config afterwards changes nothing`;
  `test/config.test.ts::a floor above the reserve`.
- Notes:
  - `#dispatcher` was not asked for by the review: the mock's call history
    keeps the Authorization header, so the "not printed" test needs it.
  - `test/tools/context.test.ts::sends through the context's client to the configured domain`
    intercepts one request with an empty list instead of queueing a whole
    schema load (code-reviewer L3: only what the test uses).
  - A test in `test/schema/output.test.ts` serialises the maps with
    `instanceof FrozenMap`, no longer `instanceof Map`.
  - `docs/improvements.md`: three older entries marked done in part; parked
    entries stamped `da373b7` and `b4a1571`.

## Dead ends
none

## Open doubts
- The scoped round's security list A (4 items) needs another mechanism
  change: the owner chose on 2026-11-23 to close T-015 and make it a task
  of its own before T-019 (PLAN, `proposed` T-050). Until then `host`,
  `limiter`, the limiter's state and the schema service's cache are
  ordinary properties: nothing claims a tool cannot change them.
- Threat model: private fields protect against a tool's mistake or a cast,
  not against hostile code in the process (`process.env` keeps the key).
  The owner's model is the former.
- The fixes of the scoped round's wording pass (handoff commit) were not
  reviewed again (rule 9).

## Context pressure
ok

## Next action
none for this task. Next: `/decompose` sizes T-050, then `/pickup`.
