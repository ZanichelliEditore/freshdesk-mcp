# T-010 — Schema service: load, TTL cache, output mapping

- **Type:** build
- **Phase:** M0
- **Status:** done (2026-11-23)
- **Depends on:** T-004, T-009
- **Created:** 2026-11-20

## Goal
`src/schema/` loads fields, agents and groups once per TTL and turns raw ticket values into labelled output.

## In scope
- Cache with TTL from config; one load per TTL.
- Output `{label: value_label}`; status, priority, source, agent, group as names.
- Hidden fields from team config left out.
- Requester as a name is **not** in scope (needs contacts; M1). Untrusted-content wrapping (§7.4) of free-text fields is M1's `format.ts`, not this.

## Out of scope
- Input mapping (T-011).
- Untrusted-content wrapping (M1).

## Spec sections to read
- SPEC.md §7.3
- SPEC.md §8.4

## Files expected to change
- `src/schema/index.ts`, `src/schema/output.ts`
- `test/schema/output.test.ts`

## Wireframes
`none`

## Acceptance
`test/schema/output.test.ts`: one fetch per TTL (MockAgent count), refetch after TTL (fake clock); raw ticket → labelled output with names; hidden fields absent; `make quality` green.

---
*Filled at `/handoff`:*

## Done
- `f8d7db7`: `src/schema/index.ts` (`SchemaService.get()`: fields, agents, groups once per TTL, in-flight load shared, failure not cached, agents reduced to id and name, `truncated` kept), `src/schema/output.ts` (`ticketOutput`), `test/fixtures/schema.ts`, `test/schema/output.test.ts`.
- `460a596`: review fixes: hidden keys also match a default field's ticket key and compare trimmed/NFC/lower-cased; `TICKET_KEY` a Map, status choices via `Object.hasOwn`; schema readonly and deep-frozen; clock gone back expires the cache; empty nested top level shows no path.
- Acceptance: `test/schema/output.test.ts::SchemaService: load and TTL cache` (one fetch per TTL by MockAgent call history; `does not refetch 1 ms before the TTL ends, and refetches once it has`, fake clock); `ticketOutput: labelled values::maps a raw ticket to {label: value label}, ...`; `ticketOutput: hidden fields`. 34 tests.

## Dead ends
none

## Open doubts
- Builder's choices for the owner: hidden-field matching ignores case (and, since `460a596`, spaces and Unicode form; also the ticket key); a key the ticket does not carry leaves the field out while `null` stays `null`; requester, company and product show raw ids; a hidden key that matches no field is silent (warning parked, `docs/improvements.md` `f8d7db7`).
- Unresolved ids are strings (`unknown status 9`, `agent 9 (name not loaded: the agent list is incomplete)`), not a structured value: builder's choice.
- The TTL is a constructor argument; nothing builds a `SchemaService` from `limits.schema_ttl_s` yet, and T-011 does not either: PLAN row T-015 `proposed`.
- Still parked: about 5 min worst case per list load (T-009 Low 4); §7.4 wrapping of names and free text before `ticketOutput`'s first tool caller.

## Context pressure
ok

## Next action
none (done).
