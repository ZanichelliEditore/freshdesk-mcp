# T-038 — Package runnable with `npx`, README for technical users

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-24)
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
Commits `3dd9a63` (status), `82ab7a6` (package, `--version`, README),
`03561f8` (full review fixes), and the closing commit (scoped round
parked, done).

Acceptance, clause by clause (`test/package.test.ts` unless named):

- `npm pack --dry-run --json` lists only `dist/`, `README.md`, `LICENSE`,
  `package.json` and the example team config: `::packs only dist/,
  README.md, LICENSE, package.json and the example team config`.
- No path under `docs/` (`docs/private/` named), `test/` (fixtures
  included) or `scripts/`: `::packs nothing under docs/ (docs/private/
  included), test/ (fixtures included) or scripts/` (the copy holds them
  and a planted `docs/private/` file; the pack leaves them out).
- Nothing under `dist/` compiled from `test/`, a fixture or
  `scripts/smoke`; no source map embeds sources: `::ships a dist/ compiled
  from src/ only, with no source map embedding sources` (every file maps
  to a `src/*.ts`; no `.map` at all, and none with `sourcesContent`).
- Scope-ownership evidence in HANDOFF: checked at handoff by the
  orchestrator, not by a test (HANDOFF rewrites each session). HANDOFF at
  `cff5d24` records the fact, its date (2026-11-24) and who confirmed it
  by role ("project owner"); no command output, no npm user name or email.
- Package name `@zanichelli/freshdesk-mcp`: `::is named
  @zanichelli/freshdesk-mcp` (package.json and the pack's name).
- Compiled with `tsconfig.build.json` into a temporary directory; the
  `bin` entry run from it with `--version` prints the `package.json`
  version, equal to the User-Agent's: `::has a bin whose --version prints
  package.json's version, the User-Agent's too` (also the shebang as the
  built `cli.js`'s first line); the header sent:
  `test/client/http.test.ts::sends Basic auth, the UA and Accept to the
  configured host over https`; `test/server.test.ts::carries package.json's
  version`.
- README names every registered `core` tool (all fifteen of SPEC §8.2):
  `::names every registered core tool, all fifteen of SPEC §8.2, each with
  its call cost` (each tool's `cost` text verbatim); `FRESHDESK_EXPORT_DIR`:
  `::names the environment variables, FRESHDESK_EXPORT_DIR among them`;
  the sentence on `hidden`: `::carries the sentences on hidden, on ticket
  text and on exported files`; `::runs the package with npx`.
- `make quality` green (2,495 tests at `03561f8`). CI green on the
  commit: observed by the orchestrator at ship.
- Handoff check: `package.json` still has `private: true`.

Choices:

- The version is a constant, `src/version.ts`, used by `--version`, the
  server info and the User-Agent; tests fail when it and package.json
  differ. Reading package.json at run time would break `rootDir: src`.
- The MCP server name follows the package (`@zanichelli/freshdesk-mcp`);
  the User-Agent is `freshdesk-mcp/<version>` (`@` is not a token
  character).
- `test/support/cli-process.ts` also runs `npm pack --dry-run --json
  --ignore-scripts --offline` (`packDryRun`), with HOME, npm cache and npm
  config under `os.tmpdir()`: recorded as a note on the active RFC
  2026-11-23, in `eslint.config.mjs` and `docs/architecture/overview.md`.
- The pack runs on a copied tree (the repository without `.git`,
  `node_modules`, `.claude`, the root `dist`, `.env*` and `docs/private`)
  beside the test's own build; `--ignore-scripts` so a future `prepack`
  cannot replace that build, `--offline` so no registry is asked.
- No `quality.yml` change: the test builds for itself.

Review:

- Full round on `cff5d24..82ab7a6` (R1 = `82ab7a6`): compliance none
  (Wireframes `none`); code 3 Medium, 3 Low, info; security 1 Medium, 2
  Low, 1 info. Fixed in `03561f8` (shebang and no-`.map` checks, npm home
  in tmp, copy filter at any depth, README host and key, pin advice,
  "reads only from Freshdesk") or parked (`docs/improvements.md`, entry
  `82ab7a6`).
- Scoped round on `82ab7a6..03561f8`: lists A empty for all three; list B
  parked (`docs/improvements.md`, entry `03561f8`).

Outside Files expected to change: `src/version.ts`, `src/cli.ts`,
`src/client/http.ts`, `src/server.ts`, `package-lock.json`,
`test/client/http.test.ts`, `test/support/cli-process.ts`,
`eslint.config.mjs`, `docs/architecture/overview.md`,
`docs/rfc/active/2026-11-23-adopt-runtime-stack.md`,
`docs/improvements.md`.

## Dead ends
none

## Open doubts
- The Gate's second half, that the publisher is a member of the
  `@zanichelli` npm scope, is not yet confirmed by the owner; needed
  before T-045.
- No `LICENSE` file and no `license` field in package.json: owner
  decision before T-045.
- `files: ["dist"]` ships whatever is in the local `dist/`, stale files
  included: T-045 must publish from a fresh CI build.
- "CI green on the commit": observed by the orchestrator at ship.

## Context pressure
Moderate: one build session with two review rounds; no split needed.

## Next action
none: done.
