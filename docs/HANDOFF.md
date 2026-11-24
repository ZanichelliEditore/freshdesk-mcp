# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-24T15:32:01+01:00`
- **Describes commit:** filled by the stamp commit. **CI:** filled by the
  stamp commit.

- **Current task:** T-035 `done (2026-11-24)`,
  `docs/tasks/T-035-call-budget.md` ("Done"). Commits `f4a8b98`
  (status), `293a780` (build), `40b6171` (full-round fixes), `8476ea1`
  (task file, parked items). `src/tools/budget.ts`: `estimateCalls`
  (pages at a given page size, plus a probe, plus one per ticket with
  conversations) and `checkBudget` (reserve first, malformed estimate
  refused, over `limits.call_budget` refused without `confirm: true`);
  the limiter's read-only `reserveRefusal()`. Built by a builder agent
  under the orchestrator (owner's instruction of 2026-11-23).

- **Next action:** `/pickup`. By PLAN's rule it takes **T-055** (spike:
  search date boundary and time zone), sized `todo` in this handoff;
  T-036 now depends on it.
  - **The owner:** local `node` is v26.13.1 (HANDOFF at `c7e4b3c`).
  - **The owner**, Dependabot PRs (unchanged; T-044 "Done").

- **Read before anything else:** PLAN row T-055 and its task file
  `docs/tasks/T-055-search-date-boundary.md`; the T-035 task file's
  "Open doubts" (for T-036/T-037).

- **Reviews:**
  - **Full round** on `a5fa1d6..293a780`, R1 = `293a780`. The four quotes
    matched for all three; no Bash calls. compliance: Wireframes `none`.
    security: 1 Low fail-open (a negative or `null` estimate passed
    without `confirm`). code-reviewer: 2 Medium (the estimate assumed 100
    tickets a page while search pages at 30; list scans cannot be
    estimated up front), 2 Low, 1 info. Fixed in `40b6171`.
  - **Scoped round** on `293a780..40b6171`. The four quotes matched for all
    three; no Bash calls. List A empty for all three; compliance `none`.
    Lists B parked, entry `40b6171`.

- **Plan changes (orchestrator, owner's delegation, `/decompose`
  authority):** T-055 sized from `proposed` to `todo` with a task file and
  acceptance; T-036 depends on T-055 (PLAN re-plan note of 2026-11-24).
  Still `proposed`: T-041 (can be sized), T-052, T-049.

- **Open doubts (owner):**
  - **T-035:** for T-036/T-037 — named page-size constants per endpoint,
    always pass `probe`, stop a list scan at the budget while it runs; a
    refused call has still spent its probe. See the task file.
  - **T-034 and earlier:** see HANDOFF at `3539bef`, `36bb6fc`, `4d37b3e`,
    `4894e33`, `cae6a52`, `f1fee04`, `86e2cea`, `85afd63`, `0b830e0`,
    `e8c3120`, `46c8af8`, `c7e4b3c`, `26e6101`, `8c90427`, `fe4c24c`
    (T-022 confirms), `c79a23b`, `ae9da29`, `fcca38f`, `65be293`,
    `f286c82`, `470124f`, `876ec68`, `20f4b2f`, `d20c83b`.

- **Dead ends:** none this task. From before: HANDOFF at `4d37b3e`,
  `85afd63`, `fe4c24c`, `ae9da29`, `876ec68`.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (local Node v26.13.1), from the
  builder's run on `8476ea1`'s tree:
  - eslint, prettier, ruff, `tsc --noEmit`, `npm run build` clean;
  - vitest "Test Files 35 passed (35)", "Tests 2340 passed (2340)";
  - `tools/checks` "Ran 54 tests", OK;
  - both gitleaks scans passed.
