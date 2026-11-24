# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-24T10:43:23+01:00`
- **Describes commit:** filled by the stamp commit. **CI:** filled by the
  stamp commit.

- **Current task:** T-025 `done (2026-11-24)`,
  `docs/tasks/T-025-client-contacts-companies.md` ("Done"). Commits
  `f36b597` (status), `2d57a78` (modules), `82c5b91` (review Lows, done).
  `getContact` → `{name, email, company_id}`, `getCompany` → `{id, name}`,
  fixed allow-lists (phone, mobile, address and every unlisted key
  absent). Built by a builder agent under the orchestrator (owner's
  instruction of 2026-11-23).

- **Next action:** `/pickup`. By PLAN's rule it takes **T-042** (compact
  ticket row), then T-043.
  - **The owner**, Dependabot PRs (unchanged; T-044 "Done").

- **Read before anything else:** PLAN row T-042 and its task file.

- **Reviews:**
  - **Full round** on `8066d3b..2d57a78`, R1 = `2d57a78`. The four quotes
    matched for all three; no Bash calls. compliance: Wireframes `none`.
    security: none. code-reviewer: 3 Low (deadline untested; a missing
    `email` key's handling unpinned; 404 tests assert the code only),
    fixed in `82c5b91`.
  - **Scoped round:** not needed: no fix changed a mechanism (rule 9).

- **Proposed plan changes:** none new. Noted for T-036/T-037 (cost
  argument): see HANDOFF at `8c90427`. T-041 can be sized (OD-4
  answered). Carried: T-052, T-049 `proposed (2026-11-23)`.

- **Open doubts (owner):**
  - **T-025 → T-026:** name, email and company name come back raw; T-026
    must clean them and put them inside `<ticket_content>`, and skip
    `getCompany` when `company_id` is null.
  - **T-024, T-022 (confirm):** see HANDOFF at `8c90427`, `fe4c24c`.
  - **T-023, T-054, T-021, T-020, T-019, T-053, T-051:** see HANDOFF at
    `c79a23b`, `ae9da29`, `fcca38f`, `65be293`, `f286c82`, `470124f`,
    `876ec68`.
  - **Carried**, unchanged: see HANDOFF at `20f4b2f` and `d20c83b`.

- **Dead ends:** none this task. From before: see HANDOFF at `fe4c24c`,
  `ae9da29`, `876ec68`.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (Node 22.23.5), from the builder's
  run before `82c5b91`:
  - eslint clean, ruff "All checks passed!";
  - prettier "All matched files use Prettier code style!";
  - `tsc --noEmit` clean;
  - vitest "Test Files 23 passed (23)", "Tests 1580 passed (1580)";
  - `tools/checks` "Ran 54 tests", OK;
  - `npm run build` clean;
  - both gitleaks scans passed.
