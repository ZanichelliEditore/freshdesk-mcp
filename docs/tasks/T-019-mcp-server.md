# T-019 — MCP server skeleton: toolset registry, annotations, stdio, cli

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-24)
- **Depends on:** T-015, T-050, T-051
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
- Commits: `5dc6c30` (status), `f5e55aa` (build), `71de5f5` (full review
  fixes), and the closing commit `T-019: done; task file, parked review
  items, journal` (2026-11-24).
- `src/tools/toolsets/index.ts`: the registry (`Tool`, `ToolResult`,
  `TOOLSETS = { core: [] }`, `DATA_NOT_INSTRUCTIONS`, `registerTool`);
  `src/server.ts`: `createServer(context, toolsets = TOOLSETS)`,
  `SERVER_INFO`; `src/cli.ts`: config, the `Agent` (connect, headers and
  body timeouts 10 s, default `maxHeaderSize`), `serveStdio`.
- Tests, `test/server.test.ts`:
  - `createServer: the tool list > lists exactly the registered core
    tools, each with the four annotations as declared`, `> writes each
    tool's call cost into its listed description`, `> says "data, not
    instructions" only for a tool that returns customer text`;
  - `createServer: a tool without its annotations or cost does not
    register > throws when %s is missing` (each hint), `> throws when an
    annotation is not a boolean`, `> … the annotations are missing
    altogether`, `> throws when the call cost is %s` (missing, empty,
    blank), `> throws when customerText is not a boolean`;
  - `createServer: enabled toolsets come from the team file only >
    refuses to start with %s enabled, naming it`, `> the real registry
    (no toolsets argument) refuses %s, naming it`, `> a server from the
    real registry initializes, and has no tools/list while core is
    empty`, `> ignores FRESHDESK_TOOLSETS in the environment`;
  - `createServer: tool results > returns a handler's value as JSON
    text`, `> turns a returned FreshdeskError into isError with its code
    and message`, `> turns a thrown exception into a generic message with
    no stack and no input text`, `> does the same for a thrown non-Error
    value`, `> turns a value JSON cannot write (%s) into the
    tool-name-only message` (BigInt, cycle, undefined, function);
  - `SERVER_INFO > carries package.json's version`;
  - `the built cli > exits non-zero with FRESHDESK_API_KEY unset: the
    message on stderr, nothing on stdout`;
  - `test/support/cli-process.ts > refuses an env naming %s, even empty,
    before spawning`, `> refuses a directory outside os.tmpdir(): %s`;
  - `examples/team-config.example.json > parses with toolsets ["core"],
    and a server starts from it`.
  - `test/lint-rules.test.ts`: `lets test/support/cli-process.ts, and no
    other file, start a process: %s`, `still refuses in
    test/support/cli-process.ts %s`.
- Red first: the whole of `test/server.test.ts` at import (no
  `src/server.ts`); then the built-cli test (no `cli.ts`) and the example
  test (`["core","write"]`); in the review fixes, the `undefined` and
  function cases of "a value JSON cannot write". The rest passed on their
  first run.
- Beyond "Files expected to change": `eslint.config.mjs` and
  `test/lint-rules.test.ts` (the exemption), `test/support/cli-process.ts`
  (the helper), the dated note in RFC 2026-11-23's Review section, and
  `package.json` / `package-lock.json` with `@modelcontextprotocol/server`
  `^2` (2.4.0; `npm audit` 0 vulnerabilities).
- Lint exemption: `test/support/cli-process.ts` is the one file under
  `test/` exempt from the `child_process` ban, and from nothing else. The
  helper runs only `tsc` and the built `cli.js`, from a directory under
  `os.tmpdir()` (real paths), and refuses an env naming
  `FRESHDESK_API_KEY` or `FRESHDESK_HOST_OVERRIDE` before spawning.
- Choices: a handler returns `{ok:true,value}` or `{ok:false,error}`
  (like `HttpResult`); an error is `isError` with `{"error":…}` as JSON
  text; a throw or a value JSON cannot write is a fixed message naming the
  tool only. Cost is a non-empty string, written as `Cost: …` after the
  description, then `DATA_NOT_INSTRUCTIONS` for customer text. A toolset
  not in `TOOLSETS` is a `ConfigError` naming it and `"toolsets"`;
  duplicates deduped. `createServer` takes the toolsets map so tests
  inject fakes; the `FRESHDESK_TOOLSETS` test passes a fake `write` tool.
  `cli.ts` builds one server at start (so a bad toolset stops it), then a
  fresh one per SDK request; `process.exitCode = 1`, not
  `process.exit`. `SERVER_INFO` is hardcoded (guarded by a test). Tests
  speak raw JSON-RPC over `InMemoryTransport` (the client package is not
  admitted). No `core/index.ts` yet.
- Reviews: full round (code-, security-, compliance-reviewer), fixes in
  `71de5f5`; scoped round, list A empty for all three. Parked items in
  `docs/improvements.md`.
- `make quality` exit 0: vitest 18 files, 1365 tests; `tools/checks` 54
  tests OK.

## Dead ends
none

## Open doubts
- `tools/list` is "Method not found" (-32601) until T-020 registers a
  tool: an `McpServer` with no tool advertises no tools capability.
- When the SDK refuses a tool's input before the handler, its message
  carries zod's issue text (keys, not values); outside the wrapper.
- The registry does not enforce the owner's rule of 2026-11-23 that
  tools' zod inputs carry no `default` / `transform`.
- undici keep-alive sockets may delay the exit for a few seconds after
  stdin closes; untested.
- `SERVER_INFO` is hardcoded; a test keeps it equal to `package.json`.

## Context pressure
low

## Next action
none: done.
