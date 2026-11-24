# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-24T15:53:18+01:00`
- **Describes commit:** filled by the stamp commit. **CI:** filled by the
  stamp commit.

- **Current task:** T-055 `done (2026-11-24)` (spike),
  `docs/tasks/T-055-search-date-boundary.md` ("Done"). Commits `4f466de`
  (status), `31428d7` (probes, `make smoke-date-probes`), `8ed5436`
  (measured boundary, exact `created_between`), `1fae0e3` (full-round
  fixes), `d252727` (scoped list A wording, done). **Measured**
  (2026-11-24, orchestrator on the owner's authorisation, 31 GETs, days
  2026-11-17..19): search `created_at:>'D'` and `<'D'` keep day D and the
  day is the UTC day (1 of 8 readings fits all 15 totals). Raw output in
  the gitignored `docs/private/account-facts.md`. `updated_at` is not
  measured and keeps a one-day widening plus the local instant check.
  Built by a builder agent under the orchestrator (owner's instruction of
  2026-11-23).

- **Next action:** `/pickup`. By PLAN's rule it takes **T-036**
  (`count_tickets`). It counts exactly from
  `created_at:>'from' AND created_at:<'to'` when `total` ≤ 300; see the
  T-035 task file's Open doubts (named page sizes, `probe`, stop a list
  scan at the budget).
  - **The owner (needed for T-038):** confirm the organisation owns the
    `@zanichelli` npm scope and who is a member (fact and date only).
  - **The owner:** local `node` is v26.13.1 (HANDOFF at `c7e4b3c`);
    Dependabot PRs (T-044 "Done").

- **Read before anything else:** PLAN row T-036 and its task file;
  `docs/architecture/ticket-queries.md` ("Date boundary", "Past 300
  results", cost classes).

- **Reviews:**
  - **Full round** on `eab6caa..8ed5436`, R1 = `8ed5436`. The four quotes
    matched for all three; no Bash calls. compliance: Wireframes `none`.
    security: 1 Low (`updated_at` assumed), 1 info. code-reviewer: 1 High
    (the `search_tickets` description still told the model to widen a
    day, now known to over-return), 1 Medium (`updated_at` widening
    dropped on an assumption), 4 Low. Fixed in `1fae0e3`.
  - **Scoped round** on `8ed5436..1fae0e3`. The four quotes matched for
    all three; no Bash calls. compliance `none`; security list A none;
    code list A one item (the description extended the measured rule to
    every date field): fixed as wording in `d252727`, **not reviewed
    again** (rule 9); the orchestrator re-ran `make quality` on `d252727`
    (exit 0). Lists B parked, entries `8ed5436`, `1fae0e3`.

- **Proposed plan changes:** none new. Still `proposed`: T-041 (can be
  sized), T-052, T-049.

- **Open doubts (owner):**
  - **T-055:** `updated_at`'s day rule is not measured (widened by a day
    meanwhile); the time-zone fallback is Europe/Rome when the account's
    zone is unreadable (it was readable).
  - **Earlier, still open for you:** `uncategorised_fields` any-empty rule
    (T-022, HANDOFF at `fe4c24c`); `find_similar_tickets` shows other
    customers' tickets (T-030, HANDOFF at `cae6a52`); the orchestrator's
    acceptance amendments (T-021, T-026, T-027, T-043; PLAN re-plan notes).
  - **Other tasks:** see HANDOFF at `91ea50c`, `3539bef`, `36bb6fc`,
    `4d37b3e`, `4894e33`, `cae6a52`, `f1fee04`, `86e2cea`, `85afd63`,
    `0b830e0`, `e8c3120`, `46c8af8`, `c7e4b3c`, `26e6101`, `8c90427`,
    `c79a23b`, `ae9da29`, `fcca38f`, `65be293`, `f286c82`, `470124f`,
    `876ec68`, `20f4b2f`, `d20c83b`.

- **Dead ends:** none this task. From before: HANDOFF at `4d37b3e`,
  `85afd63`, `fe4c24c`, `ae9da29`, `876ec68`.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (local Node v26.13.1), run by the
  orchestrator on `d252727`:
  - eslint, prettier, ruff, `tsc --noEmit`, `npm run build` clean;
  - vitest "Test Files 35 passed (35)", "Tests 2388 passed (2388)";
  - `tools/checks` "Ran 54 tests", OK;
  - both gitleaks scans passed.
