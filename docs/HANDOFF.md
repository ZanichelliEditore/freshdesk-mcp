# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-25T09:54:23+01:00`
- **Describes commit:** `c6dba4b`
  (`c6dba4b1561cc0514b80c6e6d3785319e96f28da`), pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45580479733
  (workflow `quality`, ran on `c6dba4b`; observed through the public API).
  This file's hash and CI line arrive in the commit right after it.

- **Current task:** T-045 `done (2026-11-25)`, release workflow,
  `docs/tasks/T-045-release-workflow.md` ("Done", "Dry run observed").
  Commits `4bf3ade`, `2076c9f`, `b3b8b07`, `8600942`, `3a19cc7` (dry run
  observed, done). RFC 2026-11-25 Implemented box ticked.
  - **Dry run:** `workflow_dispatch` on `main` (`66cb17b`), started by the
    orchestrator with `gh` (owner logged in, 2026-11-25):
    https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45580075912,
    success: quality (22.19), quality (24), gitleaks, build, dry-run;
    publish skipped.
  - **After it:** no tag on the remote; `npm view
    @zanichelli/freshdesk-mcp` E404.

- **Next action:** the first release, the owner's steps of
  `docs/rfc/active/2026-11-25-release-on-npm.md` ("Owner's manual steps"):
  0. repository public (it is, 2026-11-25);
  1. environment `npm`, "Selected branches and tags", tag rule `v*` only,
     before any `v*` tag;
  2. `v*` tag ruleset and `main` branch ruleset, bypass list = who may
     release (the maintainers, so direct pushes to `main` keep working);
  3. on the go: placeholder `0.0.0` by hand from an empty directory, then
     deprecate it (2FA, an `@zanichelli` member);
  4. npm trusted publisher: `ZanichelliEditore` / `freshdesk-mcp` /
     `release.yml` / environment `npm`;
  5. within 2 days: tag `v0.1.0` on `main` (`package.json` is `0.1.0`);
  6. then "Require two-factor authentication and disallow tokens".
  Then `/pickup`: **T-057** (export pages), then **T-058** (solution tree
  by category).

- **Read before anything else:** the RFC's manual steps; PLAN rows T-057,
  T-058.

- **Reviews:** T-045's two rounds: HANDOFF at `e373c2e`. No code since.

- **Proposed plan changes:** none new.

- **Open doubts (owner):**
  - **T-045:** GitHub/npm settings untestable in the repo; after 0.1.0 a
    dry run at the same version may be refused (expected); a hand-typed
    `--provenance=false` overrides `publishConfig` (accepted).
  - **Earlier:** see HANDOFF at `d1c7efe`, `fe81a3c`, `f1dde79`.

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `8600942` (HANDOFF at
  `e373c2e`); `3a19cc7` changes docs only (pre-commit hooks passed).
