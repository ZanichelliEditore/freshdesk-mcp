# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-23T17:42:56+01:00`
- **Describes commit:** filled in the stamp commit. **CI:** filled in the
  stamp commit.

- **Current task:** T-044 `done (2026-11-23)`,
  `docs/tasks/T-044-dependabot-branches.md` ("Done" is the report).
  Commits `079e776` (report) and the one this file describes (review
  wording fixes).

- **Next action:**
  1. **The owner**, on the Dependabot pull requests (T-044 "Done"):
     - PR #1 (actions v6 → v7): comment `@dependabot rebase`; after a green
       CI on the rebased head and a `git diff origin/main...<head> --
       .github/` showing only the three `@v6` → `@v7` lines, merge.
     - PR #3 (`typescript` 7, `@types/node` 26): close.
     - Confirm or drop T-052 (`proposed`, Dependabot ignore rules).
  2. **The owner** runs `make smoke` against the real account (still
     pending; see HANDOFF at `e9df10e`, "Next action" 1). It unblocks
     T-022 (then T-023, T-024, T-043) and decides T-041.
  3. Meanwhile `/pickup` takes **T-017** (untrusted content): by PLAN's
     rule the first `todo` row whose dependencies are `done` (T-011).

- **Read before anything else:** `docs/tasks/PLAN.md` (T-017 and T-052
  rows); `docs/tasks/T-044-dependabot-branches.md`, "Done".

- **Reviews:**
  - **Full round** on `e9df10e..079e776`, R1 = `079e776`. The four quotes
    matched for all three. compliance-reviewer: Wireframes `none`.
    code-reviewer: 1 Medium, 3 Low; it made one read-only `git ls-tree`
    call and said so. security-reviewer: 1 Low, 1 check to add.
  - All findings were report wording (documents only), applied in the
    handoff commit; the Low on tag-pinned actions parked in
    `docs/improvements.md`, entry `079e776`.
  - **No scoped round:** wording-only changes to a report, by the
    orchestrator's decision (2026-11-23); not re-reviewed.

- **Proposed plan changes:** T-052 "Dependabot ignore rules for majors
  outside the runtime RFC", `proposed (2026-11-23)`. T-041 (waits on
  OD-4) and T-049 (owner's confirm or drop) stay `proposed (2026-11-23)`.

- **Open doubts (owner):**
  - **T-044:** checkout v7's `persist-credentials` default is not in its
    release notes; check it before merging PR #1.
  - **T-016:** RFC 2026-11-23 rule 2 read by its purpose for
    `scripts/smoke/cli.ts`; the "not JSON" label relies on a fixed message
    prefix in `src/client/http.ts` (parked, `2f20509`).
  - **T-051's list** is drawn from the M1 task files (see HANDOFF at
    `31ce639`).
  - **Carried from before**, unchanged; see HANDOFF at `81ee087`:
    T-050 `.constructor` and `rate-limit.ts` not banned; the 5 s lint-test
    timeout (`97c11e8`); T-047's builder choices; T-048 and T-038 publish
    gates; OD-2, OD-3, OD-4; the orchestrator's choices of 2026-11-23;
    `examples/team-config.example.json` until T-019 and T-037; schemas
    taken from the docs, not measured; the gitleaks planted-secret check
    (T-001); hashes from before the history rewrite.

- **Dead ends:** none this session. From before: running the smoke script
  through Node's type stripping; the shortest-form grammar for T-051; the
  root `server.json` and the MCP Registry listing (withdrawn by the owner
  on 2026-11-23). Do not raise them again unasked.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (Node 22):
  - eslint clean, ruff "All checks passed!";
  - prettier "All matched files use Prettier code style!";
  - `tsc --noEmit` clean;
  - vitest "Test Files 15 passed (15)", "Tests 668 passed (668)";
  - `tools/checks` "Ran 54 tests", OK;
  - `npm run build` clean;
  - both gitleaks scans passed.
