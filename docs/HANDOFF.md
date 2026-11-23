# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-23T17:16:19+01:00`
- **Describes commit:** pending: this file's hash and CI line arrive in
  the commit right after it.

- **Current task:** plan session, `/decompose` scoped to T-051, the task
  file `docs/tasks/PLAN.md`. Commits `b3fdd32` (sized), `83acc09` (full
  review fixes) and the one this file describes (rewrite to an exact
  allow-list, the owner's option A). T-051 is `todo (2026-11-23)`,
  `docs/tasks/T-051-lint-import-allow-list.md`, right before T-019. T-019,
  T-042 and T-043 depend on it (rows and task files). T-016 does not, and
  it stays next.

- **Next action:** `/pickup` takes T-016 (`docs/tasks/T-016-*.md`).

- **Read before anything else:** `docs/tasks/PLAN.md`, the M1 note on
  T-051 and row T-051; `docs/tasks/T-051-lint-import-allow-list.md`,
  "Re-plans".

- **Reviews:**
  - **Full round** on `81ee087..b3fdd32`, R1 = `b3fdd32`, plus the
    `planner`'s review. The four quotes matched for all three reviewers,
    with no Bash calls. compliance-reviewer: Wireframes `none`.
    security-reviewer: 1 Medium, 1 Low, 2 info. code-reviewer: 3 Low.
    planner: 1 finding and notes. All were applied in `83acc09` by the
    orchestrator's decisions.
  - **Scoped round** on `b3fdd32..83acc09`. The four quotes matched for
    all three. compliance-reviewer: `none`. code-reviewer made one Bash
    call, a no-op `echo`, and said so.
    - code-reviewer, list A (1): a generated `%2e` or tab case at position
      0 yields a bare specifier the rule cannot refuse.
    - security-reviewer, list A (1): the planned rule checked only
      specifiers starting with `.`, `/` or `file:`, which is weaker than
      T-050's deny regex (`ms/../../src/./config.js`, a `file:` with a
      leading space).

    Under rule 9 this was reported to the owner, who chose option A: an
    exact allow-list, rewritten in the handoff commit. The rewrite was not
    reviewed again as a plan (owner, 2026-11-23); the reviews of T-051's
    build cover it. No third round.

- **Proposed plan changes:** none new. T-041 and T-049 stay
  `proposed (2026-11-23)`: T-041 waits on OD-4, T-049 on the owner's
  confirm or drop.

- **Open doubts (owner):**
  - **Parking not done.** The orchestrator asked to park code B1–B5 and
    security B1–B3 from the scoped round in `docs/improvements.md`. Their
    text did not reach this session, so they are not parked yet. The
    orchestrator holds them.
  - **T-051's places.** The M1 task files put the tools in
    `src/tools/toolsets/core/`. T-050's lint tests and its depth test
    assumed `src/tools/core/`, at most one subfolder deep. T-051 follows
    the task files, moves those cases and replaces the depth test. To
    confirm.
  - **T-051's list** is drawn from the M1 task files: modules, eight
    resources, `node:path`, `node:fs/promises`, `node:crypto`, and the root
    entry of `@modelcontextprotocol/server`. A task that needs another
    module adds it as a reviewed config line.
  - **Carried from before**, unchanged; see HANDOFF at `81ee087`:
    - T-050: `.constructor`; `rate-limit.ts` not banned.
    - The 5 s lint-test timeout (`97c11e8`).
    - T-047's builder choices.
    - T-048 and T-038 publish gates.
    - OD-2, OD-3, OD-4.
    - The orchestrator's choices of 2026-11-23.
    - `examples/team-config.example.json`, until T-019 and T-037.
    - Schemas taken from the docs, not measured.
    - The gitleaks planted-secret check (T-001).
    - Hashes from before the history rewrite.
    - Two Dependabot branches (T-044).

- **Dead ends:** the shortest-form grammar for T-051 (`b3fdd32`,
  `83acc09`). Each review round found a form it missed, and the exact
  allow-list replaced it. From before: the root `server.json` and the MCP
  Registry listing were withdrawn by the owner on 2026-11-23. Do not raise
  them again unasked.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (Node 22):
  - eslint clean, ruff "All checks passed!";
  - prettier "All matched files use Prettier code style!";
  - `tsc --noEmit` clean;
  - vitest "Test Files 14 passed (14)", "Tests 615 passed (615)";
  - `tools/checks` "Ran 54 tests", OK;
  - `npm run build` clean;
  - both gitleaks scans passed.
