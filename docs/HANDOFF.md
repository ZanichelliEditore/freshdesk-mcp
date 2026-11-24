# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-24T15:06:43+01:00`
- **Describes commit:** filled by the stamp commit. **CI:** filled by the
  stamp commit.

- **Current task:** T-033 `done (2026-11-24)`,
  `docs/tasks/T-033-client-canned.md` ("Done"). Commits `ec6a469`
  (status), `cdb1457` (resource), `26f1f8f` (measured facts, done).
  `src/client/resources/canned.ts`: folders `{id, name, personal}`, a
  folder's responses `{id, title}`, one response
  `{id, title, text, folder_id, visibility}`; explicit allow-lists.
  **Measured** (2026-11-24, orchestrator, GET only, status and counts
  only): the key reads `/canned_response_folders`; `per_page` is accepted
  there and on `/solutions/categories`. Counts in the gitignored
  `docs/private/account-facts.md`. Built by a builder agent under the
  orchestrator (owner's instruction of 2026-11-23).

- **Next action:** `/pickup`. By PLAN's rule it takes **T-034** (tools
  `list_canned_responses`, `get_canned_response`). Take a folder's
  `personal` from `listCannedFolders` (`listCannedResponses` does not
  carry it); treat `visibility` other than 0, or `null`, as not shared
  with all agents; `truncated` comes from T-034's own cap.
  - **The owner:** local `node` is v26.13.1 (HANDOFF at `c7e4b3c`).
  - **The owner**, Dependabot PRs (unchanged; T-044 "Done").

- **Read before anything else:** PLAN row T-034 and its task file; the
  T-033 task file's "Open doubts".

- **Reviews:**
  - **Full round** on `3c37ca8..cdb1457`, R1 = `cdb1457`. The four quotes
    matched for all three; no Bash calls. compliance: Wireframes `none`.
    security: none (1 info for T-034). code-reviewer: 1 Medium (whether
    Freshdesk refuses `per_page` on the folder list: measured, accepted),
    1 Low (the allow-list deviation unrecorded: recorded), 1 info.
  - **Scoped round:** not needed: no code changed after the full round.

- **Proposed plan changes:** none new. T-055 `proposed (2026-11-24)`
  (search date boundary; size before T-036). T-036 boundary-day line:
  HANDOFF at `46c8af8`. T-041 can be sized. Carried: T-052, T-049
  `proposed (2026-11-23)`.

- **Open doubts (owner):**
  - **T-033:** a response's `visibility` on the view and an empty folder's
    shape are not measured; a non-admin key would get `forbidden`.
  - **T-032 and earlier:** see HANDOFF at `4d37b3e`, `4894e33`, `cae6a52`,
    `f1fee04`, `86e2cea`, `85afd63`, `0b830e0`, `e8c3120`, `46c8af8`,
    `c7e4b3c`, `26e6101`, `8c90427`, `fe4c24c` (T-022 confirms),
    `c79a23b`, `ae9da29`, `fcca38f`, `65be293`, `f286c82`, `470124f`,
    `876ec68`, `20f4b2f`, `d20c83b`.

- **Dead ends:** none this task. From before: HANDOFF at `4d37b3e`,
  `85afd63`, `fe4c24c`, `ae9da29`, `876ec68`.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (local Node v26.13.1), from the
  builder's run on `26f1f8f`'s tree:
  - eslint, prettier, ruff, `tsc --noEmit`, `npm run build` clean;
  - vitest "Test Files 33 passed (33)", "Tests 2261 passed (2261)";
  - `tools/checks` "Ran 54 tests", OK;
  - both gitleaks scans passed.
