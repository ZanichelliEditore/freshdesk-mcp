# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-24T10:57:30+01:00`
- **Describes commit:** `c7e4b3c`
  (`c7e4b3cb90c52b9c7c4a605907f9903a3170c6b4`), pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45370198847
  (workflow `quality`, ran on `c7e4b3c`; observed through the public API).
  This file's hash and CI line arrive in the commit right after it.

- **Current task:** T-042 `done (2026-11-24)`,
  `docs/tasks/T-042-ticket-row.md` ("Done"). Commits `d38404f` (status),
  `5db3dea` (build), `44ffa71` (full-round fixes), `861b4ff` (task file,
  parked items, journal). `src/tools/rows.ts`: `ticketRow` and
  `ticketDetail`; category from `uncategorised_fields` (a nested level's
  name selects its parent field) or the first nested field; deduplicated
  keys. Built by a builder agent under the orchestrator (owner's
  instruction of 2026-11-23).

- **Next action:** `/pickup`. By PLAN's rule it takes **T-043** (filters:
  name → id resolver and request builder). It must match category fields
  exactly as `rows.ts` does (a level name selects its parent nested
  field) and record that rule in `docs/architecture/ticket-queries.md`
  (parked `44ffa71`, code B2).
  - **The owner:** Homebrew relinked `node` to v26.13.1 on 2026-11-24 at
    10:52 (likely a formula that depends on `node`); the project targets
    Node 22 (CI: 22.19 and 24). To return to 22: `brew unlink node &&
    brew link --overwrite node@22`.
  - **The owner**, Dependabot PRs (unchanged; T-044 "Done").

- **Read before anything else:** PLAN row T-043 and its task file;
  `docs/architecture/ticket-queries.md`.

- **Reviews:**
  - **Full round** on `72d89b6..5db3dea`, R1 = `5db3dea`. The four quotes
    matched for all three. compliance: Wireframes `none`. security: none.
    code-reviewer: 2 Medium (a listed nested level gave an empty
    category; category labels overwrote each other), 3 Low; one no-op
    Bash call, said so. Fixed in `44ffa71`.
  - **Scoped round** on `5db3dea..44ffa71`. The four quotes matched for all
    three; no Bash calls. List A empty for all three; compliance `none`.
    Lists B parked, entry `44ffa71` (day overflow: `Date.parse` rolls
    2026-02-30 to 03-02, checked by the orchestrator).

- **Proposed plan changes:** none new. T-036/T-037 cost argument: see
  HANDOFF at `8c90427`. T-041 can be sized (OD-4 answered). Carried:
  T-052, T-049 `proposed (2026-11-23)`.

- **Open doubts (owner):**
  - **T-042:** calendar-impossible days roll over instead of `null`.
  - **T-025 → T-026, T-024, T-022 (confirm):** see HANDOFF at `26e6101`,
    `8c90427`, `fe4c24c`.
  - **Earlier tasks:** see HANDOFF at `c79a23b`, `ae9da29`, `fcca38f`,
    `65be293`, `f286c82`, `470124f`, `876ec68`, `20f4b2f`, `d20c83b`.

- **Dead ends:** none this task. From before: see HANDOFF at `fe4c24c`,
  `ae9da29`, `876ec68`.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0, from the builder's run before
  `861b4ff` (local Node v26.13.1 after the Homebrew relink; CI is the
  reference on 22.19 and 24):
  - eslint clean, ruff "All checks passed!";
  - prettier "All matched files use Prettier code style!";
  - `tsc --noEmit` clean;
  - vitest "Test Files 24 passed (24)", "Tests 1608 passed (1608)";
  - `tools/checks` "Ran 54 tests", OK;
  - `npm run build` clean;
  - both gitleaks scans passed.
