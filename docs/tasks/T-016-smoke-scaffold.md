# T-016 — Smoke script: read-only by construction, schema shape report

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-23)
- **Depends on:** T-015, T-050 (its first half, if T-050's split point is
  taken)
- **Created:** 2026-11-23

## Goal
A manual script the owner runs against the real account (SPEC §11): it can
only send GET, and its first report gives the shape of `/ticket_fields`,
`/agents` and `/groups` without any account value. Its run answers OD-4 and
the doubt "schemas follow the API v2 docs, not a live account".

## In scope
- The smoke client: a subclass of `HttpClient` that adds no instance field
  and whose guard overrides `request`, refusing any method but GET before
  anything is sent. `request` is the base entry: `requestWithRetry` calls
  `this.request` and `paginate` calls `requestWithRetry`, so one override
  covers the three. It is never a `Proxy` of a client and never a separate
  class holding one. After T-050 the client is frozen and its internals are
  `#` members: a `Proxy` receiver does not have them, a subclass field
  cannot be added to a frozen instance, and a class that only holds a client
  is not assignable to the resources' `HttpClient` parameter (code-reviewer
  B7, range `da373b7..b4a1571`; review rounds on `b330f08..3479402` and
  `3479402..f61f70b`). Note from T-050's review (2026-11-23, code-reviewer,
  range `dd191ec..416641e`): a subclass gets no instance fields of its own;
  the base freezes the instance in its constructor, so a public field
  throws, and a `#` field relies on engines still allowing a private field
  on a frozen object (the "nonextensible applies to private" proposal would
  refuse it).
- `schema` report: per default field and per custom-field type, the shape of
  `choices` (list, name → id record, id → names record, tree depth) and
  counts; whether the zod schemas of T-008/T-009 accepted the payloads. No
  label, name, id or choice value in the output.
- `make smoke` target with a one-line description; reads the same env as the
  server.
- The session does not run it (SPEC §14 rule 1). The owner runs it and keeps
  the output in the gitignored `docs/private/account-facts.md`; the tracked
  task file records shapes only.
- How `scripts/smoke.ts` is run is the builder's choice within the admitted
  stack. If this needs a package or a runner the runtime RFC (2026-11-23)
  does not admit, stop and raise an RFC.

## Out of scope
- Tool-level smoke (T-039).
- Any fix to `ticketInput` (T-041).

## Spec sections to read
- SPEC.md §11
- SPEC.md §14
- SPEC.md §7.3

## Files expected to change
- `scripts/smoke.ts` (or a `smoke` subcommand, builder says which)
- `Makefile`
- `test/smoke.test.ts`
- `test/fixtures/ticket-fields.ts` (a variant with name → id `choices` on
  agent, group, product)

## Wireframes
`none`

## Acceptance
`test/smoke.test.ts` (MockAgent): each of POST, PUT, DELETE and (through a
cast) PATCH is refused with no request sent through the smoke client's
`request`, through its `requestWithRetry`, and through its `paginate` given
the method through a cast; the smoke client is an
`instanceof HttpClient`, `util.types.isProxy` of it is false,
`Reflect.ownKeys` of it is empty, and `listTicketFields` takes it with no
cast (`make typecheck`); on a fixture whose
`default_agent`, `default_group` and `default_product` carry a name → id
`choices` record the report says so, and on the current fixture it says they
carry none; no label, name, id or choice value of the fixture, and neither
the `FRESHDESK_DOMAIN` value nor the API key, appears in the output; a
failure prints its error code only, never the message; a payload the zod
schema refuses is reported as refused, exit non-zero; `make help` lists
`smoke`; `make quality` green.

---
*Filled at `/handoff`:*

## Done
- Build `2850999`: `scripts/smoke/smoke.ts` (`SmokeClient`, `choicesShape`,
  `runSmoke`, `smoke`), `scripts/smoke/cli.ts` (entry point, builds the
  Agent), `tsconfig.smoke.json`, `make smoke`, the fixture variant
  `ticketFieldsWithEntityChoices` in `test/fixtures/ticket-fields.ts`, and
  `test/smoke.test.ts`. The files differ from "Files expected to change":
  `scripts/smoke/` holds two files instead of `scripts/smoke.ts`, so the one
  that builds the real Agent is named `cli.ts` and the existing `**/cli.ts`
  lint ban keeps it out of tests; `tsconfig.smoke.json` is new.
- "In scope" was wrong that one override on `request` covers the three: it
  covers `requestWithRetry`, but the base `paginate` builds its first page
  from path, query and cost only, so a method given through a cast would be
  sent as a GET, not refused. `paginate` has its own guard
  (`test/smoke.test.ts` "%s through paginate (cast): refused, nothing sent").
- RFC 2026-11-23 rule 2 ("only `cli.ts` builds the one keep-alive Agent") is
  read as: only an entry point builds a real dispatcher, and no test imports
  one. `scripts/smoke/cli.ts` is a second entry point under that reading
  (accepted by the orchestrator for the owner, 2026-11-23).
- Full review fixes (range `c95fd04..2850999`): the compiled output loaded
  only by Node's syntax detection, since Node stops looking for package.json
  at `node_modules/`; `node --no-experimental-detect-module` on it failed
  with "Failed to load the ES module", exit 1. `make smoke` now writes
  `{"type":"module"}` into the out dir and runs Node with
  `--no-experimental-detect-module`.
  `env -u FRESHDESK_DOMAIN -u FRESHDESK_API_KEY -u FRESHDESK_HOST_OVERRIDE make smoke`
  printed, before and after the fix, `config: fail (...)` and make exited 2
  (the script 1); nothing was sent. Also: refusal with
  `FRESHDESK_HOST_OVERRIDE` set; only `ConfigError` gives the config line,
  any other error the fixed `smoke: fail (unexpected error)` (`main`);
  "not JSON" told apart from "refused by the schema"; the banner says where
  the output is kept. Commit `2f20509`; tests in `test/smoke.test.ts`:
  "refuses to start when FRESHDESK_HOST_OVERRIDE is set: nothing sent",
  "a 2xx that is not JSON is reported as not JSON, not as a schema
  refusal", "main: an unexpected error" (three cases), "the banner".
- Scoped round (`2850999..2f20509`): list A empty for all three; list B
  parked in `docs/improvements.md`, entry `2f20509`.
- Not run against the real account by this session (SPEC §14 rule 1).

## Dead ends
- Running `scripts/smoke/*.ts` with Node's type stripping: `src/` imports
  `./x.js`, which Node does not map to `.ts`; compiled with `tsc` instead.

## Open doubts
- The "not JSON" label relies on the prefix of `src/client/http.ts:262`'s
  fixed message (parked, `2f20509`).
- RFC rule 2 read by its purpose for the second Agent builder
  (`scripts/smoke/cli.ts`), accepted for the owner by the orchestrator.

## Context pressure
ok

## Next action
The owner runs `make smoke` against the real account (HANDOFF); its
`OD-4 name_to_id choices:` line answers OD-4.
