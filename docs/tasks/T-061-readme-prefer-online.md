# T-061 — README `npx` commands run with `--prefer-online`

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-25)
- **Depends on:** T-060
- **Created:** 2026-11-25

## Goal
Every `npx` command in the README runs with `--prefer-online`, so a user
gets the version npm serves now and not npm's cached metadata (owner,
2026-11-25, his answer to the "pin or `--prefer-online`" doubt in HANDOFF
`2664688`).

## In scope
- `README.md`: `npx -y @zanichelli/freshdesk-mcp` becomes
  `npx -y --prefer-online @zanichelli/freshdesk-mcp` everywhere: the
  install snippet, the pinned form in the pin advice
  (`npx -y --prefer-online @zanichelli/freshdesk-mcp@<version>`), the
  "replace … with" sentence of the "Not yet published" block, the
  `claude mcp add` line; the JSON `"args"` arrays (`.mcp.json`, Claude
  Desktop) become `["-y", "--prefer-online", "@zanichelli/freshdesk-mcp", …]`.
- The pin advice stays: pinning answers trust, `--prefer-online` answers
  the stale cache; the `notarget` in `docs/journal.md` (T-060, 0.2.0
  release) hit a pinned `npx`.
- `test/package.test.ts`: the existing assertions on `npx -y ${pkg.name}`
  and on `ARGS` changed to the new text; one new case that fails if any
  `npx -y` in the README (the shell form) is not followed by
  ` --prefer-online`, or any `"args"` array starting with `"-y"` lacks
  `"--prefer-online"` right after it. `"command": "npx"` lines carry no
  flag by design: the `"args"` rule covers them.
- If the owner removes the "Not yet published" block first, its line
  leaves this list.

## Out of scope
- Removing or rewriting the "Not yet published" block (stale since 0.1.0
  is on npm); only its snippet text changes here. Raised to the owner
  (planning session, 2026-11-25).
- A release; RFC texts (`docs/rfc/active/`) that quote the old command.

## Spec sections to read
- SPEC.md §11

## Files expected to change
- `README.md`
- `test/package.test.ts`

## Wireframes
`none`

## Acceptance
`test/package.test.ts`: the README contains `npx -y --prefer-online ${pkg.name}`, the pinned form `npx -y --prefer-online ${pkg.name}@<version>`, and in the Claude Code and Claude Desktop sections `-- npx -y --prefer-online ${pkg.name} --export-dir /absolute/path/to/exports` and `"args": ["-y", "--prefer-online", "${pkg.name}", "--export-dir", "/absolute/path/to/exports"]`; a new case fails if any `npx -y` in the README is not followed by ` --prefer-online` (the shell form; `"command": "npx"` lines are checked by the `"args"` rule) or any `"args"` array starting with `"-y"` lacks `"--prefer-online"` right after it (shown failing on the README of the commit T-061 starts from); the pin advice stays; `make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
