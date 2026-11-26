# T-091 — Spike: Claude Desktop facts with a throwaway bundle (owner installs)

- **Type:** spike
- **Phase:** M4
- **Status:** todo (2026-11-26)
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
