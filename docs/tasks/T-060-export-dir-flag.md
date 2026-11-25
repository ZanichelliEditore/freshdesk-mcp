# T-060 — The export directory as a command-line argument

- **Type:** build
- **Phase:** M1
- **Status:** doing (2026-11-25)
- **Depends on:** T-037, T-038
- **Created:** 2026-11-25

## Goal
The export directory is set in the MCP client's configuration as a
command-line argument, `--export-dir <path>`, in the server's `args` (owner's
request, 2026-11-25, option 1). `FRESHDESK_EXPORT_DIR` stays as a fallback
for 0.1.0 users; the flag wins when both are given. Released as 0.2.0.
Decided in `docs/rfc/active/2026-11-25-export-dir-flag.md`; no code is
written before that RFC is Active.

## In scope
- Parse `--export-dir <path>` and `--export-dir=<path>` with Node's built-in
  `util.parseArgs` (no new dependency). The parsing lives in `src/config.ts`
  (an exported function taking the argument list), so tests can call it:
  `cli.ts` cannot be imported by tests (lint) and `process` is banned under
  `src/tools/**`. `cli.ts` passes `process.argv.slice(2)` to it.
- The resolved directory reaches `export_tickets` through the context's
  `exportDir`, as today; the flag's value, when given, replaces the
  environment's.
- Unknown flags, positional arguments, `--export-dir` with no value or an
  empty one, and `--export-dir` given twice: refused at startup with a
  message on stderr, exit code 1, nothing served or sent. `parseArgs`'
  own message is never passed through (it quotes the token): the refusal
  names only `--export-dir`, or says "an unknown option" / "a positional
  argument" without quoting it.
- `--version` is an option `parseArgs` knows, valid anywhere: a parse
  refusal wins; otherwise, when present, it prints the version and exits
  0, ignoring other valid options and reading no environment.
- The path's checks are unchanged and stay at call time in `export_tickets`
  (absolute, an existing directory, not a symlink); refusal messages and the
  tool description name the directory neutrally and say both ways to set it.
- README: install snippets for Claude Code
  (`claude mcp add ... -- npx -y @zanichelli/freshdesk-mcp@<v> --export-dir <dir>`
  and `.mcp.json` `args`) and Claude Desktop (`args`); the environment table
  marks `FRESHDESK_EXPORT_DIR` as the fallback; a note that a client passes
  `args` without a shell, so `~` is not expanded.
- SPEC §10 amended: the export directory is personal, set by the flag or the
  environment variable; OD-5's row in `docs/tasks/PLAN.md` amended the same
  way ("personal env" to "flag or env", dated).
- `docs/architecture/overview.md` where it names `FRESHDESK_EXPORT_DIR`.
- Version 0.2.0 in `package.json`, `package-lock.json`, `src/version.ts`;
  CHANGELOG "0.2.0 (unreleased)".

## Out of scope
- A directory in the tool's input (still refused: OD-5, a prompt-injected
  ticket could steer the write).
- The export directory in the team file (shared; SPEC §10, owner
  2026-11-23).
- `.mcpb` `user_config` (M4; it can map a field to the same `args`).
- Moving any other setting (domain, key, team file, host override) to flags.
- Removing `FRESHDESK_EXPORT_DIR`.
- The tag, the release and the publish (the orchestrator's and the owner's).

## Spec sections to read
- SPEC.md §10
- SPEC.md §11

## Files expected to change
- `src/config.ts`, `src/cli.ts`, `src/tools/context.ts` (comments),
  `src/tools/toolsets/core/export-tickets.ts`, `src/version.ts`
- `test/config.test.ts`, `test/server.test.ts`,
  `test/tools/core/export-tickets.test.ts`, `test/package.test.ts`
- `README.md`, `SPEC.md`, `CHANGELOG.md`, `package.json`,
  `package-lock.json`, `docs/architecture/overview.md`
- `docs/rfc/active/2026-11-25-export-dir-flag.md` (Active by the owner's
  approval, 2026-11-25; its Implemented box ticked by the build)

## Wireframes
`none`

## Acceptance
`test/config.test.ts`: `--export-dir /a` and `--export-dir=/a` each give
`exportDir` `/a`; with `FRESHDESK_EXPORT_DIR=/b` also set the flag's `/a`
wins, and with no flag `/b` is used; an unknown flag, a positional argument,
`--export-dir` with no value, `--export-dir=` and `--export-dir` given twice
each throw `ConfigError`, naming `--export-dir` where it is the cause; an
unknown option whose token holds the API key's value, and one holding an
arbitrary value, give a message containing neither;
`test/server.test.ts` (built `cli.js`): an unknown flag and a missing value
each exit 1 with a message on stderr (`--export-dir`
named for the missing value, the unknown token not quoted), nothing on stdout and no request
sent, and `--version` prints `0.2.0` and exits 0, also after
`--export-dir /a` and with no environment set;
`test/tools/core/export-tickets.test.ts`: a directory given by the flag is
written to, and a relative, missing or symlinked one is refused with no
request, as with the variable (T-037's tests still pass); the description
and the unset refusal name both `--export-dir` and `FRESHDESK_EXPORT_DIR`;
README shows the Claude Code and Claude Desktop snippets with
`--export-dir` (asserted in `test/package.test.ts`); OD-5's row says "flag
or env"; SPEC §10 says "flag or env"; `package.json`,
`src/version.ts` and CHANGELOG say 0.2.0 (unreleased); the RFC is Active;
`make quality` green.

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
