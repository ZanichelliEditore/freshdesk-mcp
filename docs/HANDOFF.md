# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-24T20:41:58+01:00`
- **Describes commit:** `6dd1a61`
  (`6dd1a61f7d30a35073a95b3690bac15b056ea882`), pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45473182373
  (workflow `quality`, ran on `6dd1a61`; observed through the public API).
  This file's hash and CI line arrive in the commit right after it.

- **Current task:** T-038 `done (2026-11-24)`, package runnable with
  `npx`, README, `docs/tasks/T-038-npx-package.md` ("Done"). Commits
  `3dd9a63` (status), `82ab7a6` (npx package, `--version`, README),
  `03561f8` (full-round fixes: shebang and no-map checks, npm home in tmp,
  README host and key), `5e2547c` (lists B parked, done). Built by a
  builder agent under the orchestrator (owner's instruction of
  2026-11-23).
  - **Scope-ownership evidence (acceptance clause, checked here):** on
    2026-11-24 the project owner confirmed that the organisation owns the
    `@zanichelli` npm scope.
  - **Handoff check:** `package.json` still has `"private": true`
    (line 4); T-045 removes it.
  - **CI green on the commit:** the CI line above, filled by the stamp.

- **Next action:** `/pickup`. By PLAN's rule it takes **T-039** (smoke
  over the `core` tools; M1 acceptance; needs the owner's smoke run, which
  the orchestrator may run on the owner's authorisation of 2026-11-23,
  GET only).
  - **The owner, before T-045:** confirm the publisher is a member of the
    `@zanichelli` scope (role only); choose a license (no `LICENSE`, no
    `license` field).
  - **The owner:** local `node` is v26.13.1 (HANDOFF at `c7e4b3c`).

- **Read before anything else:** PLAN row T-039 and
  `docs/tasks/T-039-m1-smoke.md`; `scripts/smoke/`.

- **Reviews:**
  - **Full round** on `cff5d24..82ab7a6`, R1 = `82ab7a6`. The four quotes
    matched for all three. compliance: Wireframes `none`. code-reviewer: 3
    Medium (shebang untested; README's `FRESHDESK_HOST_OVERRIDE` text
    wrong; the Gate's publisher half unrecorded), 3 Low, info.
    security-reviewer: 1 Medium (a pack from a working tree ships a stale
    `dist/`, parked for T-045), 2 Low, 1 info. Fixed in `03561f8` or parked
    (`docs/improvements.md`, entry `82ab7a6`).
  - **Scoped round** on `82ab7a6..03561f8`. The four quotes matched for
    all three; list A empty for all three. Lists B parked, entry
    `03561f8`. The code-reviewer made one Bash call (`ls -a` of the repo
    root, no write), against rule 8; its findings are unaffected. The
    orchestrator re-ran `make quality` on `5e2547c` (exit 0).

- **Proposed plan changes:** none new. Still `proposed`: T-041 (can be
  sized), T-052, T-049.

- **Open doubts (owner):**
  - **T-038:** publisher membership of the scope; license; T-045 must
    publish from a fresh CI build (task file "Open doubts").
  - **T-037, needs your decision:** one call exports about 4,000 tickets,
    or about 40 with their threads (30 s call deadline); SPEC §7.2's
    2,000-with-conversations example does not fit one call.
  - **Earlier, still open for you:** see HANDOFF at `f1dde79` and
    `41de8bc`.

- **Dead ends:** none this task.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (local Node v26.13.1), run by the
  orchestrator on `5e2547c`:
  - vitest "Test Files 39 passed (39)", "Tests 2495 passed (2495)";
  - `tools/checks` "Ran 54 tests", OK;
  - lint, format, typecheck, build and both gitleaks scans passed.
