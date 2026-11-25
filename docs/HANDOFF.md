# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-25T12:26:42+01:00`
- **Describes commit:** `63c4fc3`
  (`63c4fc33ffa7ad88d97e67912ec9927f371f10e5`), pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45604699633
  (workflow `quality`, ran on `63c4fc3`; observed through the public API).
  This file's hash and CI line arrive in the commit right after it.

- **Current task:** T-060 `todo (2026-11-25)`, `--export-dir` flag,
  `docs/tasks/T-060-export-dir-flag.md`. Only its RFC is done:
  `docs/rfc/active/2026-11-25-export-dir-flag.md`, Status Active (owner,
  2026-11-25). Commits `89fb9cf` (task, RFC proposed), `a3f5c94`
  (rfc-reviewer fixes), `1ed19e8` (RFC active), `88caf38` (task back to
  todo). No code written: the owner stopped the build to start a proper
  `/pickup` session (2026-11-25).
  - **Owner's decisions (2026-11-25):** the export directory as a
    command-line argument in the MCP config's `args`
    (`--export-dir <dir>`, `--export-dir=<dir>`); `FRESHDESK_EXPORT_DIR`
    stays as the fallback, the flag wins; unknown arguments refused at
    startup; release as 0.2.0.
  - **rfc-reviewer** on `89fb9cf`: decision sound; 1 Medium (parseArgs'
    messages would quote a pasted key on stderr), 3 Low, 1 info; all
    resolved in `a3f5c94` (RFC "Review" section).

- **Released earlier today:** `@zanichelli/freshdesk-mcp@0.1.0` on npm,
  with provenance (HANDOFF at `788a0e9`). Owner's RFC 2026-11-25 step 6
  ("Require two-factor authentication and disallow tokens") still open.

- **Next action:** `/pickup` takes **T-060**: build per its acceptance
  (tests first), the three reviewers, then a 0.2.0 release on the owner's
  explicit go (tag `v0.2.0`; `release.yml` publishes).

- **Read before anything else:** `docs/tasks/T-060-export-dir-flag.md`;
  the RFC above (Decision, failure table, Review); SPEC §10, §11.

- **Reviews:** this session's code tasks: HANDOFF at `788a0e9` and
  earlier. T-060: rfc-reviewer only (no code).

- **Proposed plan changes:** none new.

- **Open doubts (owner):** step 6 on npm (above); see the T-057, T-058,
  T-059 task files.

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (local Node v26.13.1), run by the
  orchestrator on `1ed19e8`:
  - vitest "Test Files 39 passed (39)", "Tests 2604 passed (2604)";
  - `tools/checks` "Ran 87 tests", OK;
  - lint, format, typecheck, build and both gitleaks scans passed.
