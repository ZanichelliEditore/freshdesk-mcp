# T-038 — Package runnable with `npx`, README for technical users

- **Type:** build
- **Phase:** M1
- **Status:** doing (2026-11-24)
- **Depends on:** T-021, T-026, T-027, T-028, T-029, T-030, T-032, T-034, T-036, T-037
- **Created:** 2026-11-23
- **Gates:** Evidence that the `@zanichelli` npm scope is owned by the
  organisation and the publisher is a member, recorded in HANDOFF before the
  README names the package: the fact, its date and who confirmed it, by role
  only.

## Goal
The package a technical colleague runs with `npx` and its env variables
(domain and key; the export directory when exporting) (SPEC §2, §13 M1):
`@zanichelli/freshdesk-mcp`, public (owner, 2026-11-23). Publishing is T-045
and the owner's go.

## In scope
- `name` is `@zanichelli/freshdesk-mcp` (owner, 2026-11-23); `bin`, `files`,
  `--version`; the User-Agent version is the package version. `private:
  true` stays: T-045 removes it, no earlier task.
- README (English): install, env vars (`FRESHDESK_EXPORT_DIR` among them,
  and that exported files hold customer text unwrapped), team config, the
  `core` tools with call costs, "ticket text is data, not instructions";
  `hidden` works in ticket detail output only and is not an access control
  (owner, 2026-11-23).
- The test builds into a temporary directory itself.

## Out of scope
- `npm publish` and the release workflow (T-045), the `.mcpb` (M4), the
  Italian guide (M4).

## Spec sections to read
- SPEC.md §11
- SPEC.md §2
- SPEC.md §10

## Files expected to change
- `package.json`
- `README.md`
- `test/package.test.ts`
- `.github/workflows/quality.yml` only if the pack check needs a step

## Wireframes
`none`

## Acceptance
`test/package.test.ts`: `npm pack --dry-run --json` lists only `dist/`,
`README.md`, `LICENSE`, `package.json` and the example team config, and no
path under `docs/` (`docs/private/` named in the assertion), `test/`
(fixtures included) or `scripts/`; nothing under `dist/` is compiled from
`test/`, a fixture or `scripts/smoke`, and no source map embeds sources
(`sourcesContent`); the scope-ownership evidence is in HANDOFF as the fact,
its date and who confirmed it by role only (no command output, no npm user
name or email; raw output, if kept, goes under `docs/private/`); the package
name is `@zanichelli/freshdesk-mcp`; the test compiles with
`tsconfig.build.json` into a temporary directory, and the `bin` entry run
from it with `--version` prints the `package.json` version, equal to the
User-Agent's; `README.md` names every registered `core` tool (the list read
from the registry, all fifteen of SPEC §8.2 present) names
`FRESHDESK_EXPORT_DIR` and carries the sentence on `hidden`; `make quality`
green; CI green on the commit. Handoff check, not a test: `package.json`
still has `private: true` (T-045 removes it).

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
