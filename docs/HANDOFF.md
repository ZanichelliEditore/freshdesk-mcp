# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-24T11:16:15+01:00`
- **Describes commit:** filled by the stamp commit. **CI:** filled by the
  stamp commit.

- **Current task:** T-043 `done (2026-11-24)`,
  `docs/tasks/T-043-ticket-filters.md` ("Done"). Commits `a8a0384`
  (status), `e3af096` (build), `d3091cb` (full-round fixes), `e80ad04`
  (task file, T-055 proposed, parked items). `src/tools/ticket-query.ts`:
  `buildTicketQuery` (names → ids, list parameters or search query) and
  `matchesLocal` (the local checks: `uncategorized`, `updated_since`,
  `created_between`). Built by a builder agent under the orchestrator
  (owner's instruction of 2026-11-23).

- **Next action:** `/pickup`. By PLAN's rule it takes **T-026**
  (`get_ticket`).
  - **The owner:** local `node` is v26.13.1 since the Homebrew relink of
    2026-11-24 (HANDOFF at `c7e4b3c`); CI (22.19, 24) is the reference.
  - **The owner**, Dependabot PRs (unchanged; T-044 "Done").

- **Read before anything else:** PLAN row T-026 and its task file (its
  acceptance was amended on 2026-11-23: field values through
  `fieldValue`, duplicate labels, cursor clause); T-025's open doubt
  (names come back raw; skip `getCompany` on a null `company_id`).

- **Reviews:**
  - **Full round** on `901cb00..e3af096`, R1 = `e3af096`. The four quotes
    matched for all three; no Bash calls. compliance: Wireframes `none`.
    security: 3 Low (control characters in a tag; type names unstripped
    in one message; non-boolean `uncategorized` ignored). code-reviewer:
    2 Medium (the quote clause of the acceptance not met as written;
    `updated_since` with search resting on the open boundary question),
    Lows. **Orchestrator's decisions** (owner's delegation): the
    acceptance now reads "refused, not escaped" (PLAN and task file);
    date filters on search are widened by a day with a local check. Fixed
    in `d3091cb`.
  - **Scoped round** on `e3af096..d3091cb`. The four quotes matched for all
    three; no Bash calls. List A empty for all three; compliance `none`.
    Lists B parked, entry `d3091cb`; both reviewers' B on the widening
    became the `proposed` row T-055.

- **Proposed plan changes:**
  - **T-055** `proposed (2026-11-24)`: measure whether search's
    `created_at`/`updated_at` `>`/`<` keep the boundary day and whose
    time-zone day they use; a one-day widening can undercount for an
    account not on UTC. To size before T-036 (`count_tickets`).
  - T-027 and T-036 acceptance should gain "a ticket on the widened
    boundary day is absent from the output" (they must call
    `matchesLocal`); T-036/T-037 cost argument (HANDOFF at `8c90427`).
  - T-041 can be sized (OD-4 answered). Carried: T-052, T-049
    `proposed (2026-11-23)`.

- **Open doubts (owner):**
  - **T-043:** the acceptance amendment was the orchestrator's; a tag or
    type with `'`, `"`, `\` or a control/format character can never be
    filtered; the T-055 question. See the task file.
  - **Earlier tasks:** see HANDOFF at `c7e4b3c`, `26e6101`, `8c90427`,
    `fe4c24c` (T-022 confirms), `c79a23b`, `ae9da29`, `fcca38f`,
    `65be293`, `f286c82`, `470124f`, `876ec68`, `20f4b2f`, `d20c83b`.

- **Dead ends:** none this task. From before: see HANDOFF at `fe4c24c`,
  `ae9da29`, `876ec68`.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (local Node v26.13.1), from the
  builder's run before `e80ad04`:
  - eslint clean, ruff "All checks passed!";
  - prettier "All matched files use Prettier code style!";
  - `tsc --noEmit` clean;
  - vitest "Test Files 25 passed (25)", "Tests 1688 passed (1688)";
  - `tools/checks` "Ran 54 tests", OK;
  - `npm run build` clean;
  - both gitleaks scans passed.
