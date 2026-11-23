# T-038 — Package runnable with `npx`, README for technical users

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
- **Depends on:** T-021, T-026, T-027, T-028, T-029, T-030, T-032, T-034, T-036, T-037
- **Created:** 2026-11-23

## Goal
The package a technical colleague runs with `npx` and two env vars (SPEC §2,
§13 M1): `@zanichelli/freshdesk-mcp`, public (owner, 2026-11-23). Publishing
is T-045 and the owner's go.

## In scope
- `name` is `@zanichelli/freshdesk-mcp` (owner, 2026-11-23); `bin`, `files`,
  `--version`; the User-Agent version is the package version. `private:
  true` stays until T-045.
- README (English): install, env vars, team config, the `core` tools with
  call costs, "ticket text is data, not instructions"; `hidden` works in
  ticket detail output only and is not an access control (owner,
  2026-11-23).
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
(fixtures included) or `scripts/`; the package name is
`@zanichelli/freshdesk-mcp`; the test compiles with `tsconfig.build.json`
into a temporary directory, and the `bin` entry run from it with `--version`
prints the `package.json` version, equal to the User-Agent's; `README.md`
names every registered `core` tool (the list read from the registry, all
fifteen of SPEC §8.2 present) and carries the sentence on `hidden`; `make
quality` green; CI green on the commit.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
