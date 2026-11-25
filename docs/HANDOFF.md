# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-25T09:43:18+01:00`
- **Describes commit:** filled by the stamp commit. **CI:** filled by the
  stamp commit.

- **Current task:** T-045 `doing (2026-11-25)`, release workflow,
  `docs/tasks/T-045-release-workflow.md` ("Done" filled; "Next action"
  open). Commits `4bf3ade` (status), `2076c9f` (`release.yml`, `LICENSE`,
  package fields, `private: true` removed), `b3b8b07` (full-round fixes:
  `publishConfig.provenance`, whole-block copy check, secret and
  permission checks), `8600942` (lists B parked). Built by a builder agent
  under the orchestrator. Decision: RFC 2026-11-25 (active).
  - **Not yet met:** the acceptance's `workflow_dispatch` dry run observed
    green on GitHub. `gh` is not installed here, so the orchestrator cannot
    start it.
  - **Checked by the orchestrator (2026-11-25):** no tag on the remote
    (`git ls-remote --tags origin`: 0 lines); `npm view
    @zanichelli/freshdesk-mcp`: E404. Pushing `release.yml` publishes
    nothing: npm has no trusted publisher and the package does not exist.

- **Next action:** finish T-045, then the first release.
  1. **The owner or the orchestrator:** GitHub, Actions, "release", "Run
     workflow" on `main` (or `gh workflow run release.yml --ref main`).
     Expect quality (22.19), quality (24), gitleaks, build, dry-run green
     and publish skipped. Record the run URL here; confirm no tag and npm
     E404; tick the RFC's Implemented box; T-045 `done`.
  2. **The owner, before any `v*` tag:** RFC steps 0–2: environment `npm`
     ("Selected branches and tags", only the `v*` rule), `v*` tag ruleset,
     `main` ruleset (its bypass list must hold the maintainers, or the
     orchestrator's direct pushes to `main` stop).
  3. **The owner, on the go for 0.1.0:** RFC steps 3–6 (placeholder
     `0.0.0` by hand from an empty directory, npm trusted publisher, tag
     `v0.1.0` within 2 days, disallow tokens).
  4. Then T-057 (export pages) and T-058 (solution tree by category).

- **Read before anything else:** the T-045 task file's "Next action";
  `docs/rfc/active/2026-11-25-release-on-npm.md` (manual steps).

- **Reviews:**
  - **Full round** on `737b262..2076c9f`, R1 = `2076c9f`. The four quotes
    matched for all three. compliance: Wireframes `none`. security: 2
    Medium (a laptop `npm publish` skipped CI once `private` was gone; the
    `npm` environment can appear without its tag rule), 1 Low (new pins:
    the orchestrator checked `upload-artifact` v7.0.2 and
    `download-artifact` v8.0.2 with `git ls-remote`, both match), 1 info.
    code-reviewer: 3 Medium (copy check compared only `run:` lines; secret
    check fooled by `secrets['X']`; job-level permissions unchecked), 4
    Low. Fixed in `b3b8b07`.
  - **Scoped round** on `2076c9f..b3b8b07`. The four quotes matched for
    all three; list A empty for all three. Lists B parked, entry
    `b3b8b07`. The orchestrator re-ran `make quality` on `8600942` (exit
    0).

- **Proposed plan changes:** none new.

- **Open doubts (owner):**
  - **T-045:** the GitHub settings cannot be tested in the repo; after
    0.1.0 a dry run at the same version may be refused by npm (expected);
    `--provenance=false` typed by hand still overrides `publishConfig`
    (accepted, RFC threat model).
  - **Earlier:** see HANDOFF at `d1c7efe`, `fe81a3c`, `f1dde79`.

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (local Node v26.13.1), run by the
  orchestrator on `8600942`:
  - vitest "Test Files 39 passed (39)", "Tests 2528 passed (2528)";
  - `tools/checks` "Ran 87 tests", OK;
  - lint (actionlint included), format, typecheck, build and both
    gitleaks scans passed.
