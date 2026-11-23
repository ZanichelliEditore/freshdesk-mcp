# T-044 — Examine the two Dependabot branches and report

- **Type:** spike
- **Phase:** M1
- **Status:** doing (2026-11-23)
- **Depends on:** none
- **Created:** 2026-11-23

## Goal
A report on the two Dependabot branches on the remote, so the owner can
decide. Nothing is merged, pushed or deleted without the owner's go (owner,
2026-11-23).

## In scope
- Per branch: the package, the versions from and to, whether the bump stays
  inside the ranges RFC 2026-11-23 admits (outside them it needs `/rfc`,
  AGENTS.md rule 3), the changelog's breaking notes, and what `make
  quality`, then `make build`, print on a local worktree of the branch, run
  with `FRESHDESK_API_KEY` unset; or, instead, the pull request's CI result
  read with `gh`.
- A recommendation per branch: merge, close, or wait.

## Out of scope
- Merging, rebasing, closing or deleting a branch; any change to
  `package.json` on `main`.

## Spec sections to read
- SPEC.md §11

## Files expected to change
- `docs/tasks/T-044-dependabot-branches.md` (the report, under "Done")
- `docs/tasks/PLAN.md` (`proposed` rows only, if a bump needs work)

## Wireframes
`none`

## Acceptance
The task file's "Done" has one entry per Dependabot branch on the remote
(`git branch -r` output quoted): package, from → to, inside or outside the
RFC's range, the last lines `make quality` and `make build` printed on that
branch (or the CI run's URL and result), and a recommendation; `git log
origin/main` and the remote's branch list are unchanged by the session;
`make quality` green on `main`.

---
*Filled at `/handoff`:*

## Done

Read on 2026-11-23 from each pull request's own CI (`gh pr checks`,
`gh api …/jobs/<id>/logs`) and from `git diff origin/main...<branch>`;
nothing installed locally, nothing merged, pushed, closed or deleted.
`git branch -r` (three Dependabot branches, not two):

```
  origin/HEAD -> origin/main
  origin/dependabot/github_actions/dependencies-4561e6c454
  origin/dependabot/npm_and_yarn/dependencies-a3ce446e39
  origin/dependabot/npm_and_yarn/dependencies-b7ceb5d816
  origin/main
```

RFC 2026-11-23 (`docs/rfc/active/2026-11-23-adopt-runtime-stack.md`,
"Decision") admits `zod ^4.2`, `undici ^8`, `@modelcontextprotocol/server
^2`, `vitest ^5`, `@types/node ^22`. `typescript`, `eslint`, `prettier`
and `typescript-eslint` predate it (scaffold, T-001/T-003) and have no
range in any active RFC. GitHub Actions are not packages; no RFC covers them.

1. **`dependabot/github_actions/dependencies-4561e6c454`**, PR #1, open,
   head `a4f4d5d`, based on `68acf47`.
   - Bumps in `.github/workflows/quality.yml`: `actions/checkout` v6 → v7,
     `actions/setup-node` v6 → v7, `actions/setup-python` v6 → v7.
   - RFC: outside every RFC's scope (not a package); a version bump of
     actions already used, not a new dependency.
   - CI: run https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45141787906
     on `a4f4d5d`, success (`checks`, `quality (22.19)`, `quality (24)`).
     That run's base was `68acf47`, before `347b52d` added the
     `npm run build` step, so `make build` was not exercised there.
   - Conflicts with `main` (`git merge-tree`): `347b52d` inserted
     `- run: npm run build` on the line next to a bumped `setup-python`.
   - Release notes (v7.0.0 of each): all three move to ESM; checkout v7
     blocks fork-PR checkout under `pull_request_target`/`workflow_run`
     (unused here); setup-node v7 removes the dummy `NODE_AUTH_TOKEN`
     export (no publish step yet); setup-python v7 removes the
     `pip-install` input (unused). No breaking note touches this workflow.
   - **Recommendation: merge, after a rebase** (`@dependabot rebase` on
     PR #1) and a green CI on the rebased head.
2. **`dependabot/npm_and_yarn/dependencies-a3ce446e39`**, PR #3, open,
   head `da6f69a`, based on `f733ac1`; merges cleanly into `main`.
   - Bumps (devDependencies): `typescript` `^6.0.3` → `^7.0.2`,
     `@types/node` `^22.20.5` → `^26.6.6`.
   - RFC: `@types/node ^26` is **outside** the admitted `^22` (the RFC
     pins the types of the minimum supported Node, 22.19); `typescript`
     has no RFC range, and 6 → 7 is a major.
   - CI: run https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45153331978,
     failure: `quality (22.19)` and `checks` fail at `npm ci` with
     `ERESOLVE`: `peer typescript@">=4.8.4 <6.1.0" from
     typescript-eslint@8.73.0`; `quality (24)` cancelled. Neither
     `make quality` nor `make build` was reached.
   - **Recommendation: close.** TypeScript 7 waits for a
     `typescript-eslint` release that accepts it; `@types/node 26`
     contradicts the RFC and would need `/rfc` (not wanted while the floor
     is 22.19).
3. **`dependabot/npm_and_yarn/dependencies-b7ceb5d816`**, PR #2,
   **already closed** by Dependabot on 2026-11-23 ("typescript is
   updatable in another way", superseded by PR #3); head `68d0b13`; the
   branch is still on the remote.
   - Bumps: `typescript` `^6.0.3` → `^7.0.2`.
   - RFC: as for PR #3, no range for `typescript`; a major.
   - CI: run https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/44733275547,
     failure: `npm ci` `ERESOLVE`, same `typescript-eslint` peer range.
   - **Recommendation: close (already closed); the owner may delete the
     leftover branch.**

`make quality` on `main` (`e9df10e`), 2026-11-23: exit 0; vitest 15
files, 668 tests passed; `tools/checks` 54 tests OK; `npm run build`
clean; both gitleaks scans passed.

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
