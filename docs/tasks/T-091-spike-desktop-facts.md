# T-091 — Spike: Claude Desktop facts with a throwaway bundle (owner installs)

- **Type:** spike
- **Phase:** M4
- **Status:** done (2026-11-27)
- **Depends on:** none
- **Created:** 2026-11-26

## Goal
Facts T-090's RFC and T-092/T-093 rest on, measured rather than assumed:
which Node Claude Desktop runs a Node bundle on, and what it passes for
each kind of `user_config` field, set and unset.

## In scope
- The session writes, in the scratchpad (nothing tracked), a minimal
  `manifest.json` and an entry script that logs to stderr only shapes,
  never values: `process.version`; for each env var the manifest maps,
  one of `absent`, `empty`, `literal-placeholder` (starts with
  `${user_config.`), `set`. Fields: one required string, one `sensitive`
  string, one optional string, one optional `file`, one optional
  `directory`. It packs them with `zip` (no new dependency: AGENTS.md
  rule 3; `@anthropic-ai/mcpb` waits for T-090).
- The owner installs it in Claude Desktop by double-click, twice (all
  optional fields filled, then all left empty), and reads Claude
  Desktop's MCP log for the lines; the session gives the exact steps and
  the log's path.
- The owner checks whether the `sensitive` value appears in any
  plain-text Claude Desktop config file (by searching for a dummy value).
- Dummy values only; no Freshdesk call, no real domain or key.

## Out of scope
- The real server in a bundle (T-092).
- Any change to `src/`, the manifest of the project, or the workflows.
- Signing (OD-36).

## Spec sections to read
- SPEC.md §2
- SPEC.md §10

## Files expected to change
- `docs/tasks/T-091-spike-desktop-facts.md` ("Done" only)
- `docs/journal.md` (one learning, if any)

## Wireframes
`none`

## Acceptance
"Done" holds dated yes/no lines, from a bundle built in the scratchpad
with `zip` (no new dependency, nothing tracked) whose entry point logs
only shapes, never values: the Node version Claude Desktop runs it on and
whether it meets `>=22.19`; what an unset optional `user_config` string,
file and directory field arrives as (absent, empty string, or literal
`${user_config.<name>}`); whether a `sensitive` field is kept out of
plain-text config files; whether a `file` and a `directory` field work;
the Claude Desktop version and OS; no real-account call; `make quality`
green.

---
*Filled at `/handoff`:*

## Done
Measured 2026-11-27 by the owner on Claude Desktop `7.37095.0`, macOS
`27.2.1` (arm64), from a scratchpad bundle (`manifest.json` v0.2 and a
zero-dependency `server/index.js`, packed with `zip`; nothing tracked, no
dependency added) whose entry point logged only shapes. No Freshdesk call;
dummy values only. Two installs (run 1 all fields filled, run 2 optional
fields empty), then uninstalled.

- Node: yes, `v24.22.3`, meets `>=22.19`. Desktop runs a `server.type:
  "node"` bundle with `command: "node"` on its own Electron Node
  (`process.versions.electron` present, log prefix `UtilityProcess`), not
  the machine's Node (Homebrew `v22.23.5` on the same machine).
- Unset optional `string`, `file` and `directory` fields: each arrives as
  the literal `${user_config.<name>}`; not absent, not an empty string.
- Set fields: all five arrive set (required, `sensitive`, optional string,
  `file`, `directory`).
- `file` and `directory` fields work: yes; each value is an existing path
  of its kind (`statSync`: `file`, `directory`).
- `sensitive` kept out of plain-text config files: yes, as far as an
  ASCII search measures it. A `grep` of
  `~/Library/Application Support/Claude` and `~/Library/Logs/Claude` for
  the dummy secret, every `manifest.json` excluded, found nothing
  (`exit=1`); it would miss a UTF-16 or encoded copy and any other
  directory.
  The only hit without that exclusion was the extension's copy of the
  probe's `manifest.json`, whose field description held the dummy text
  (see Dead ends).
- T-093's trigger: yes. `loadConfig` turns only an empty string into
  unset (`src/config.ts:240-242`, `|| undefined`), so an unset
  `FRESHDESK_MCP_CONFIG` or `FRESHDESK_EXPORT_DIR` mapped through
  `user_config` would arrive as a literal placeholder and be taken as a
  path. Fail-closed, but it blocks a Desktop install: an empty team-file
  field stops the server at start (`readFileSync` ENOENT,
  `src/config.ts:206`, `ConfigError`); an empty export-directory field is
  refused by `export_tickets` (`!isAbsolute`,
  `src/tools/toolsets/core/export-tickets.ts:247`). T-093's fix must map
  the placeholder to unset for optional fields only, never accept it as
  a value or skip a check. Not changed here (out of scope).
- No real-account call: yes.
- `make quality`: exit 0 on `c40ec85`'s tree; Vitest "Test Files 58
  passed (58)", "Tests 4824 passed (4824)"; `tools/checks` "Ran 138
  tests", OK.
- Commits: `c40ec85` (results), then the handoff commit.

## Dead ends
- The first plain-text search for the `sensitive` dummy matched the
  installed `manifest.json`, because the probe's field description quoted
  the dummy value; rerun with `--exclude=manifest.json`. A later probe
  should not put its dummy value in the manifest.

## Open doubts
- Where Desktop keeps the `sensitive` value (keychain or an encrypted
  store) was not checked; only its absence from plain-text files.
- The one unfiltered hit, the installed probe's `manifest.json`, was put
  down to the dummy text in the field description; whether Desktop also
  wrote the value into that file was not counted (`grep -c`), and the
  folder was gone after the uninstall. Recheck before T-090 or T-092
  rely on the `sensitive` line: dummy only in the install form, not in
  the manifest, no exclusion. (code- and security-reviewer, 2026-11-27)
- Whether a `compatibility.runtimes.node` field in the manifest changes
  which Node Desktop uses was not tested.

## Context pressure
ok

## Next action
none (done).
