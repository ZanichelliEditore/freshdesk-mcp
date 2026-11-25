# T-060 — The export directory as a command-line argument

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-25)
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
- `1d4463b`: `parseCliArgs` (`src/config.ts`; `util.parseArgs` with
  `strict: false, tokens: true`, each token checked here so no message quotes
  one), `loadConfig(env, args)` (flag, else `FRESHDESK_EXPORT_DIR`),
  `src/cli.ts` parses before reading env (`--version` anywhere, a refusal
  wins); `export_tickets` messages and description name "the export
  directory" and both ways to set it; README, SPEC §10, OD-5, overview,
  CHANGELOG 0.2.0 (unreleased), `package.json`/lock, `src/version.ts`; RFC
  Implemented box ticked.
- `16c6ff4`: full-round fixes (refusal reasons asserted exactly; ending names
  `--version`; comment; overview line 49; CHANGELOG).
- Tests (vitest 2604 → 2645):
  - `test/config.test.ts` › "command-line arguments (T-060, …)": both flag
    forms, precedence, `--version` anywhere, refusals by reason ("is refused
    naming --export-dir as the cause", "is refused without quoting it"), "an
    unknown token holding %s is not in the message" (API key, arbitrary).
  - `test/server.test.ts` › "the built cli" › "command line (T-060)": exit 1,
    stderr, stdout empty, token unquoted, no `FRESHDESK_API_KEY` in stderr
    (parse before env); `--version` prints `0.2.0` alone, after
    `--export-dir /a`, before `--export-dir=/a`, with env `{}`.
  - `test/tools/core/export-tickets.test.ts` › "a directory given by
    --export-dir (T-060)": written to; relative, missing, symlink refused, no
    request; unset refusal and description name both ways.
  - `test/package.test.ts` › "sets the export directory with --export-dir
    (T-060)": Claude Code (both forms), Claude Desktop, fallback row, `~`.
- Red first: config tests 27 failing before `parseCliArgs`; server
  `--version` 3 failing before the bump; export-tickets 7 failing before the
  wording; package 3 failing before README. Reason assertions shown able to
  fail: missing-value reason mutated to "an unknown option" → 5 failing.
- `make quality` on `16c6ff4`: vitest 39 files / 2645 tests passed,
  `tools/checks` 87 tests OK, exit 0.
- Release 0.2.0 (2026-11-25, owner's go in the session after the handoff
  `af6fe77`): `f3c53e0` dates CHANGELOG 0.2.0; `quality` green
  (https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45607931030);
  tag `v0.2.0` on `f3c53e0`; `release` green, publish job success
  (https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45608954525);
  npm `latest` = `0.2.0`; `npx -y --prefer-online
  @zanichelli/freshdesk-mcp@0.2.0 --version` printed `0.2.0`.

## Dead ends
- `util.parseArgs` in strict mode: its messages quote the token
  (`Unknown option '--<token>'`), and its error codes do not say which option
  an invalid value belongs to (`--version=1` and a missing `--export-dir`
  value share `ERR_PARSE_ARGS_INVALID_OPTION_VALUE`). Replaced by lenient
  tokens checked one by one.

## Open doubts
- README snippets are unpinned (`npx -y @zanichelli/freshdesk-mcp
  --export-dir …`), as the rest of the README and `test/package.test.ts`;
  the In-scope line wrote `@<v>`. Owner to say if pinned snippets are wanted.
- `--export-dir -` (a lone dash, separate) is refused as a missing value;
  `--export-dir=-x` is kept and refused by the tool as relative. Deliberate.

## Context pressure
ok

## Next action
none: done, and 0.2.0 released (2026-11-25).
