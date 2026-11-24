# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-24T16:13:34+01:00`
- **Describes commit:** filled by the stamp commit. **CI:** filled by the
  stamp commit.

- **Current task:** T-036 `done (2026-11-24)`, `count_tickets`,
  `docs/tasks/T-036-count-tickets.md` ("Done"). Commits `809d64c`
  (status), `8a72403` (tool), `51fc580` (full-round fixes: each ticket
  once, 200-group cap, no date-time group-by, agents and groups keyed by
  id, budget stop), `82cae23` (lists B parked, done). Built by a builder
  agent under the orchestrator (owner's instruction of 2026-11-23).

- **Next action:** `/pickup`. By PLAN's rule it takes **T-037**
  (`export_tickets`): `/security-review` is mandatory (OD-5);
  `FRESHDESK_EXPORT_DIR` from personal env, unset means refused.
  - **Fact for T-038 (scope ownership):** on 2026-11-24 the project owner
    confirmed that the organisation owns the `@zanichelli` npm scope.
    `package.json` keeps `private: true` (T-045 removes it).
  - **The owner:** local `node` is v26.13.1 (HANDOFF at `c7e4b3c`);
    Dependabot PRs (T-044 "Done").

- **Read before anything else:** PLAN row T-037 and its task file;
  `docs/architecture/ticket-queries.md` ("Past 300 results", the
  `count_tickets` section's scan bound, open for T-037).

- **Reviews:**
  - **Full round** on `f37db09..8a72403`, R1 = `8a72403`. The four quotes
    matched for all three. compliance: Wireframes `none`. security: 2 Low
    (no group cap; retries could pass the budget). code-reviewer: 3
    Medium (no de-dup by ticket id; no group cap and `custom_date_time`;
    untested branches), 5 Low. Fixed in `51fc580`.
  - **Scoped round** on `8a72403..51fc580`. The four quotes matched for
    all three. compliance `none`; security list A none; code list A none.
    Lists B (5 code, 5 security) parked in `docs/improvements.md`, entry
    `51fc580`. The orchestrator re-ran `make quality` on `82cae23` (exit 0).

- **Proposed plan changes:** none new. Still `proposed`: T-041 (can be
  sized), T-052, T-049.

- **Open doubts (owner):**
  - **T-036:** see the task file's Open doubts (list vs search filtering
    at 300/301; budget overshoot by one page's retries; page 300 linking
    page 301 unmeasured).
  - **Earlier, still open for you:** `uncategorised_fields` any-empty rule
    (T-022, HANDOFF at `fe4c24c`); `find_similar_tickets` shows other
    customers' tickets (T-030, HANDOFF at `cae6a52`); the orchestrator's
    acceptance amendments (T-021, T-026, T-027, T-043; PLAN re-plan notes);
    `updated_at`'s day rule not measured (T-055, HANDOFF at `41de8bc`).
  - **Other tasks:** see HANDOFF at `41de8bc`.

- **Dead ends:** none this task. From before: HANDOFF at `4d37b3e`,
  `85afd63`, `fe4c24c`, `ae9da29`, `876ec68`.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (local Node v26.13.1), run by the
  orchestrator on `82cae23`:
  - vitest "Test Files 36 passed (36)", "Tests 2434 passed (2434)";
  - `tools/checks` "Ran 54 tests", OK;
  - lint, format, typecheck, build and both gitleaks scans passed.
