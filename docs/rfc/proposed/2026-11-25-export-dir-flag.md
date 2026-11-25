# The export directory as a command-line argument

- **Status:** Proposed
- **Date:** 2026-11-25
- **Author:** freshdesk-mcp team
- [ ] Implemented

## Context

`export_tickets` writes a file to a local directory. OD-5 (owner,
2026-11-23, `docs/tasks/PLAN.md`) settled that the directory is personal,
not a team setting, and never a tool input: a prompt-injected ticket could
otherwise steer where the file goes. SPEC §10 puts it in the personal
level, and 0.1.0 (published 2026-11-25) reads it from the environment
variable `FRESHDESK_EXPORT_DIR`. With it unset, `export_tickets` is refused
with a message saying how to set it; the path is checked at call time
(absolute, an existing directory, not a symlink).

The owner asked (2026-11-25) that the directory be a parameter of the MCP
configuration rather than an environment variable, and chose a
command-line argument in the client's `args`:

```json
"args": ["-y", "@zanichelli/freshdesk-mcp@0.2.0", "--export-dir", "/Users/x/Exports"]
```

Today `cli.ts` reads one argument, `--version` (`process.argv[2]`), and
ignores anything else. `process` is banned under `src/tools/**` (lint), and
tests cannot import `cli.ts`.

## Decision

1. The server takes `--export-dir <path>` and `--export-dir=<path>`.
   Arguments are parsed with Node's built-in `util.parseArgs` (no new
   dependency), in `src/config.ts`, from the list `cli.ts` passes
   (`process.argv.slice(2)`). The value reaches `export_tickets` through
   the context's `exportDir`, as the variable's does today.
2. **Fallback kept (orchestrator's default; the owner can overturn it):**
   `FRESHDESK_EXPORT_DIR` still works, so a 0.1.0 configuration keeps
   exporting after an upgrade. When both are given, the flag wins. No
   warning is printed when both are set: the flag is the documented way,
   the variable a fallback.
3. **Strict argument list.** Anything the server does not know is refused
   at startup, before serving: an unknown flag, a positional argument,
   `--export-dir` with no value or an empty one, `--export-dir` given
   twice. The message goes to stderr and names the flag; the exit code is 1;
   nothing is served and no request is sent (the existing `ConfigError`
   path in `cli.ts`). `--version` keeps printing the version and exiting.
4. **The path's checks do not move.** They stay at call time in
   `export_tickets`, the same for either source: a value that is relative,
   not an existing directory, or a symlink is refused with nothing sent.
   Checking at startup too would stop every tool for a problem only one
   tool has, which SPEC §10 rules out ("every other tool works" with the
   directory unset). The refusal messages and the tool description name the
   directory neutrally and say both ways to set it.
5. Released as 0.2.0. The README's install snippets (Claude Code
   `claude mcp add ... -- npx -y @zanichelli/freshdesk-mcp@<v> --export-dir <dir>`,
   `.mcp.json` and Claude Desktop `args`) show the flag; the environment
   table keeps the variable as the fallback. SPEC §10's personal row says
   "flag or env".

Why this is the simplest option that does what was asked: one optional
flag, parsed by a built-in, feeding the field that already exists; the
validation and the tool are unchanged apart from wording.

## Consequences

- **Public contract change in 0.x.** The command line becomes part of the
  contract: from 0.2.0 an unknown argument stops the server, where 0.1.0
  ignored it. A 0.1.0 configuration with stray `args` after the package
  name would stop starting; the README's 0.1.0 snippets have none. Semver
  0.x allows it in a minor; CHANGELOG says so.
- **Precedence is one rule:** flag, then variable, then unset (refused at
  call time). Easy to state, easy to test.
- **The directory sits in the client's configuration in plain sight**, next
  to the command. It is a path, not a secret; a path that names a person
  (`/Users/<name>/...`) stays in the user's own client file, never in this
  repository (rule 2).
- **No shell between the client and the server.** `args` are passed as
  they are, so `~/Exports` is not expanded and is refused as not absolute.
  The README says so.
- **Two ways to set one thing** until the variable is removed. Removal, if
  wanted, is a later decision (and a breaking change); this RFC does not
  schedule it.
- A strict argument list means a typo (`--export_dir`) fails loudly at
  startup instead of silently leaving exports refused.

How a bad value fails, by case:

| Case | When | Result |
| --- | --- | --- |
| Unknown flag, positional argument | startup | stderr names it, exit 1 |
| `--export-dir` with no value, `--export-dir=` | startup | stderr names `--export-dir`, exit 1 |
| `--export-dir` twice | startup | stderr names `--export-dir`, exit 1 |
| Relative, missing, not a directory, symlink | `export_tickets` call | `validation` refusal, nothing sent, other tools work |
| Neither flag nor variable | `export_tickets` call | refusal saying both ways to set it |

### RFCs this touches

- `docs/rfc/active/2026-11-23-adopt-runtime-stack.md`: no conflict. It
  keeps `cli.ts` as the one entry point that builds the undici `Agent` and
  bans `process` in `src/tools/**`; this RFC reads argv in `cli.ts` and
  parses it in `config.ts`, beside the environment. `util.parseArgs` is a
  Node built-in, not a dependency, so its "each other runtime dependency
  needs its own RFC" does not apply.
- `docs/rfc/active/2026-11-25-release-on-npm.md`: no conflict. 0.2.0 is a
  0.x minor (decision 4) published by the same tag-driven pipeline; this
  RFC does not change how a release is authorised.
- `docs/rfc/active/2026-11-20-adopt-agent-native-setup.md`: not touched.

## Alternatives considered

- **Environment variable only (0.1.0 as is).** Works today and needs no
  code. Rejected because the owner asked for a configuration parameter:
  `env` blocks are where the key lives, and the directory is easier to see
  and edit as an argument next to the package name.
- **Flag only, variable removed.** Simpler surface, but breaks every 0.1.0
  configuration that exports, a day after release, for no safety gain.
  Kept as the owner's option to overturn decision 2.
- **A directory in the tool's input.** Rejected (OD-5): the model chooses
  tool inputs, and a ticket's text could steer the write to any directory
  the user can write.
- **The team file.** Rejected (SPEC §10, owner 2026-11-23): the file is
  shared, and a shared file must not choose a local path on each user's
  machine.
- **`.mcpb` `user_config`.** M4, and complementary rather than an
  alternative: a bundle's manifest can map a `user_config` directory field
  into the same `--export-dir` argument, so Claude Desktop operators get a
  form field without a second mechanism.
- **Checking the path at startup.** Fails earlier, but stops all fifteen
  tools for a setting only one uses, and a directory can still vanish
  after startup, so the call-time check stays anyway.
