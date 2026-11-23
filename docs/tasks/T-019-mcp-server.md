# T-019 — MCP server skeleton: toolset registry, annotations, stdio, cli

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
- **Depends on:** T-015
- **Created:** 2026-11-23

## Goal
`src/server.ts` builds an MCP server from the enabled toolsets and
`src/cli.ts` serves it on stdio (SPEC §7, §8.1). No real tool yet: the
registry is proven with a fake one.

## In scope
- Adds `@modelcontextprotocol/server ^2` (admitted by RFC 2026-11-23, no new
  RFC); lockfile committed.
- Registry: a tool = name, description, zod input, handler, the four
  annotations; a tool without them does not register.
- A tool declares its call cost and whether it returns customer-written
  text; the registry writes both into the description (SPEC §8.1 cost, §7.4
  "data, not instructions"), so no tool can leave them out.
- Enabled toolsets from the team file's `toolsets` only; there is no
  `FRESHDESK_TOOLSETS` env (owner, 2026-11-23); a toolset with no tool in
  this version (`write`, `send`) is a start error naming it.
- A handler's `FreshdeskError` becomes an `isError` result with code and
  message; a thrown exception becomes a generic error with no stack, body or
  key.
- stdout carries protocol frames only; the undici `Agent` is built here with
  explicit timeouts and the default `maxHeaderSize` (`docs/improvements.md`
  `2a0e56c` (1), `6d4013a` (2)).
- `examples/team-config.example.json`: `toolsets` becomes `["core"]`, the
  only toolset this version has.
- Tests never import `cli.ts` (runtime RFC, rule 4): the exit-code test
  spawns the built entry. If this needs a package or a runner the runtime
  RFC (2026-11-23) does not admit, stop and raise an RFC.

## Out of scope
- Any `core` tool.
- Packaging (T-038).

## Spec sections to read
- SPEC.md §7
- SPEC.md §8.1
- SPEC.md §9

## Files expected to change
- `package.json`, `package-lock.json`
- `src/server.ts`
- `src/cli.ts`
- `src/tools/toolsets/index.ts`
- `test/server.test.ts`
- `docs/architecture/overview.md`
- `examples/team-config.example.json`

## Wireframes
`none`

## Split point
Registry and server over the in-memory transport first; `cli.ts`, stdio and
the Agent second.

## Acceptance
`test/server.test.ts` (in-memory transport): a server built for `core` lists
exactly the registered tools, each with `readOnlyHint`, `destructiveHint`,
`idempotentHint` and `openWorldHint`; registering a tool with an annotation
or its call cost missing throws; the listed description of a fake tool
contains its call cost, and that of one flagged as returning customer text
contains the "data, not instructions" sentence; enabling `write` or `send`
fails at start with a message naming the toolset, read from the team file's
`toolsets`; as a guard against its return, a server built for `core` with
`FRESHDESK_TOOLSETS=write` in the environment still lists the `core` tools
only; a handler returning a `FreshdeskError` gives `isError` with its code,
a handler that throws gives a generic message with no stack and no input
text; the built `cli`, run as a spawned process from a build the test makes
in a temporary directory, with `FRESHDESK_API_KEY` unset exits non-zero, the
message on stderr, nothing on stdout; the example team file parses with
`toolsets: ["core"]`; `make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
