# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-23T19:03:51+01:00`
- **Describes commit:** `20f4b2f`
  (`20f4b2fa2c9ede61d17f764eb77a579ad2912b54`), pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45234511244
  (workflow `quality`, ran on `20f4b2f`; observed through the public API, `gh`
  not installed on the new machine). This file's hash and CI line arrive in
  the commit right after it.

- **Current task:** scoped `/decompose` of HANDOFF `d20c83b`'s proposed
  plan changes, `done (2026-11-23)`. Commits `d0f5281` (plan), `e637848`
  (full-round fixes) and the handoff commit (scoped-round list A, parked
  items). No row changed status. New row T-053 `todo (2026-11-23)`.

- **Next action:** `/pickup`. By PLAN's rule it takes **T-051** (first
  `todo` with dependencies done), then T-053.
  - **The owner** runs `make smoke` against the real account (still
    pending since `e9df10e`): it unblocks T-022 (then T-023, T-024, T-043)
    and decides T-041. The key now lives in the gitignored
    `docs/private/freshdesk-api-key` (moved there from an untracked
    `key.txt` at the repo root, 2026-11-23); `FRESHDESK_DOMAIN` is still
    needed.
  - **The owner**, on the Dependabot pull requests (unchanged; T-044
    "Done"): PR #1 rebase, check and merge; PR #3 close; confirm or drop
    T-052.

- **Read before anything else:** `docs/tasks/PLAN.md` rows T-051, T-053 and
  the M1 paragraph "On 2026-11-23 a `/decompose` scoped to HANDOFF
  `d20c83b`".

- **Reviews:**
  - **Full round** on `e9c6525..d0f5281`, R1 = `d0f5281`. The four quotes
    matched for all three. compliance-reviewer: Wireframes `none`.
    code-reviewer: 2 Medium, 1 Low-medium, 3 Low; it made three Bash calls
    (one no-op, two `git grep`) and said so. security-reviewer: 1 Medium,
    2 Low. All fixed in `e637848` except code 5 (parked, entry `d0f5281`)
    and security's "checked" note on time-relative defaults (parked, same
    entry).
  - **Scoped round** on `d0f5281..e637848`. The four quotes matched for
    all three; no Bash calls. compliance `none`. security list A empty.
    code list A: A1 (T-026 duplicate-label clause order) and A2 (the
    "field not found is wrapped" clause unreachable through
    `ticketOutput`): fixed in the handoff commit as acceptance wording
    that leaves the mechanism to T-026 (hook in `ticketOutput` or its own
    mapping, said in its "Done"); not reviewed again, no third round
    (rule 9). Both lists B parked, entry `e637848`.

- **Proposed plan changes:** none new. Carried: T-052, T-041 and T-049
  stay `proposed (2026-11-23)`.

- **Open doubts (owner):**
  - **This session:** the owner's answers of 2026-11-23: `maxPosition` in
    its own row T-053; list tools keep zod `default`/`transform` out of
    their inputs (instead of the registry passing raw arguments); T-017's
    strict delimiter wording.
  - **T-026:** its scoped-round wording fix was not reviewed (see Reviews).
  - **T-018:** the cursor digest is unkeyed; `maxPosition` is the only
    guard on a forged position (parked `e637848`, B1).
  - **T-017:** a customer's `<` reads `‹` in every block.
  - **T-044:** checkout v7's `persist-credentials` default; check before
    merging PR #1.
  - **Carried from before**, unchanged; see HANDOFF at `d20c83b` and
    `81ee087`.

- **Dead ends:** none this session. From before: matching the delimiter
  word by pattern (T-017); running the smoke script through Node's type
  stripping; the shortest-form grammar for T-051; the root `server.json`
  and the MCP Registry listing. Do not raise them again unasked.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (Node 22.23.5, GNU Make 4.4.1, new
  machine set up 2026-11-23), filled from the run before the handoff
  commit:
  - eslint clean, ruff "All checks passed!";
  - prettier "All matched files use Prettier code style!";
  - `tsc --noEmit` clean;
  - vitest "Test Files 17 passed (17)", "Tests 846 passed (846)";
  - `tools/checks` "Ran 54 tests", OK;
  - `npm run build` clean;
  - both gitleaks scans passed.
