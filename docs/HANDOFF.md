# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-24T09:29:58+01:00`
- **Describes commit:** `fcca38f`
  (`fcca38f54faadf59415013ab5e485c9fff1bfb32`), pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45356744333
  (workflow `quality`, ran on `fcca38f`; observed through the public API).
  This file's hash and CI line arrive in the commit right after it.

- **Current task:** T-021 `done (2026-11-24)`,
  `docs/tasks/T-021-list-agents-groups.md` ("Done"). Commits `c5e255d`
  (status), `7ecae5d` (build), `cefd11a` (full-round fixes), `7ae1efe`
  (task file, T-054 row, parked items). Built by a builder agent under the
  orchestrator (owner's instruction of 2026-11-23).

- **Next action:** `/pickup`. By PLAN's rule it takes **T-054**
  (`api_calls_used` counts every attempt), added 2026-11-24 right after
  T-021.
  - Smoke run of 2026-11-24 and OD-4: see HANDOFF at `f286c82`.
  - **The owner**, Dependabot PRs (unchanged; T-044 "Done").

- **Read before anything else:** PLAN's M1 re-plan note of 2026-11-24
  (T-021's acceptance amended, T-054 added), and T-054's task file.

- **Reviews:**
  - **Full round** on `c6b1fab..7ecae5d`, R1 = `7ecae5d`. The four quotes
    matched for all three; no Bash calls. compliance: Wireframes `none`.
    code-reviewer: 2 Medium (`api_calls_used` vs the MockAgent count on a
    retry; email untested), 3 Low (shared email schema widening the
    schema load's failure, hard-coded numbers, no per-call deadline).
    security-reviewer: 1 Low (the same shared-schema point), 1 info.
    Fixed in `cefd11a`: shared schema reverted, the tool checks the email,
    email tests, limitation stated and pinned, description numbers tested,
    one 30 s deadline per call.
  - **Scoped round** on `7ecae5d..cefd11a`. The four quotes matched for all
    three; no Bash calls. compliance `none`; security list A none.
    code list A: the retry test falsifies "matches the MockAgent count".
    **Orchestrator's decision** (owner's delegation, `/decompose`
    authority for this change): T-021's acceptance records the limitation
    until T-054, and T-054 (`todo`) makes the count exact; no third round
    on T-021 (rule 9). Lists B parked, entry `cefd11a`.

- **Proposed plan changes:** none new (T-054 added as `todo`, see above).
  T-041 can be sized (OD-4 answered). Carried: T-052, T-049
  `proposed (2026-11-23)`.

- **Open doubts (owner):**
  - **T-021 / T-054:** the acceptance amendment was made by the
    orchestrator, not by a `/decompose` you ran; revert it if you
    disagree. An empty-string email gives `""`, not `null`; a non-email
    string passes as email after `plainName`.
  - **T-020, T-019, T-053, T-051:** see HANDOFF at `65be293`, `f286c82`,
    `470124f`, `876ec68`.
  - **Carried**, unchanged: see HANDOFF at `20f4b2f` and `d20c83b`.

- **Dead ends:** T-021: checking the email in the shared agents schema
  (one odd email would fail the schema service's whole load). From
  before: see HANDOFF at `876ec68`.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (Node 22.23.5), from the builder's
  run before `7ae1efe`:
  - eslint clean, ruff "All checks passed!";
  - prettier "All matched files use Prettier code style!";
  - `tsc --noEmit` clean;
  - vitest "Test Files 20 passed (20)", "Tests 1413 passed (1413)";
  - `tools/checks` "Ran 54 tests", OK;
  - `npm run build` clean;
  - both gitleaks scans passed.
