# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-24T14:57:05+01:00`
- **Describes commit:** `4d37b3e`
  (`4d37b3e0a2ac41348f579af9d52ed859913312fb`), pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45408860003
  (workflow `quality`, ran on `4d37b3e`; observed through the public API).
  This file's hash and CI line arrive in the commit right after it.

- **Current task:** T-032 `done (2026-11-24)`,
  `docs/tasks/T-032-kb-tools.md` ("Done"). Commits `cc44f2a` (status),
  `a42274d` (build), `3508be4` (full-round fixes), `2a4de40` (narrow tag
  strip, docs, done). Tools `search_solutions`, `get_solution_article`,
  `list_solution_tree`: titles through `plainName`, article text wrapped
  and capped, drafts and non-public content labelled, `customer_safe`
  (published and visible to all users) on every article, the tree's lists
  `expensive`. Built by a builder agent under the orchestrator (owner's
  instruction of 2026-11-23).

- **Next action:** `/pickup`. By PLAN's rule it takes **T-033** (client
  resource: canned responses), then T-034.
  - **The owner:** local `node` is v26.13.1 (HANDOFF at `c7e4b3c`).
  - **The owner**, Dependabot PRs (unchanged; T-044 "Done").

- **Read before anything else:** PLAN row T-033 and its task file.

- **Reviews:**
  - **Full round** on `b2585bf..a42274d`, R1 = `a42274d`. The four quotes
    matched for all three; no Bash calls. compliance: Wireframes `none`.
    security: 1 Medium (`get_solution_article` returned text with no
    visibility, failing open), 2 Low. code-reviewer: 2 Medium (a "no HTML
    tag" test that could not fail; the wrong reason for the missing
    visibility), 3 Low. **Orchestrator's decisions**: read the folder for
    visibility, `customer_safe` on every article, tree lists `expensive`.
    Fixed in `3508be4`.
  - **Scoped round** on `a42274d..3508be4`. The four quotes matched for all
    three. List A empty for all three; compliance `none`. code B1 showed
    the fix's `htmlToText` on plain text deleting `<`…`>` spans; narrowed
    in `2a4de40` to a strip of tag-shaped runs only, **not reviewed
    again**, no third round (rule 9); the orchestrator re-ran
    `make quality` on `2a4de40` (exit 0). Lists B parked, entries `2a4de40`.

- **Proposed plan changes:** none new. T-055 `proposed (2026-11-24)`
  (search date boundary; size before T-036). T-036 boundary-day line:
  HANDOFF at `46c8af8`. T-041 can be sized. Carried: T-052, T-049
  `proposed (2026-11-23)`.

- **Open doubts (owner):**
  - **T-032:** subfolder visibility and all solutions shapes are not
    measured (a smoke probe is due); `customer_safe` does not check the
    category's portal visibility; `HIT_CAP` 100 is ours. See the task
    file.
  - **T-031 and earlier:** see HANDOFF at `4894e33`, `cae6a52`, `f1fee04`,
    `86e2cea`, `85afd63`, `0b830e0`, `e8c3120`, `46c8af8`, `c7e4b3c`,
    `26e6101`, `8c90427`, `fe4c24c` (T-022 confirms), `c79a23b`,
    `ae9da29`, `fcca38f`, `65be293`, `f286c82`, `470124f`, `876ec68`,
    `20f4b2f`, `d20c83b`.

- **Dead ends:** T-032: `htmlToText` on plain article text. From before:
  HANDOFF at `85afd63`, `fe4c24c`, `ae9da29`, `876ec68`.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (local Node v26.13.1), run by the
  orchestrator on `2a4de40` plus the parked-items entry:
  - eslint, prettier, ruff, `tsc --noEmit`, `npm run build` clean;
  - vitest "Test Files 32 passed (32)", "Tests 2204 passed (2204)";
  - `tools/checks` "Ran 54 tests", OK;
  - both gitleaks scans passed.
