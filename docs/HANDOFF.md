# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-23T17:35:05+01:00`
- **Describes commit:** `ea97d1c`
  (`ea97d1ce2cc31aa68c1d9ae7fd588a007a8e957d`), pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45218344196
  (ran on `ea97d1c`: `quality (22.19)`, `quality (24)`, `checks`). This
  file's hash and CI line arrive in the commit right after it.

- **Current task:** T-016 `done (2026-11-23)`,
  `docs/tasks/T-016-smoke-scaffold.md`. Commits `2850999` (build),
  `2f20509` (full review fixes) and the one this file describes.

- **Next action:**
  1. **The owner** runs the smoke script against the real account, from the
     repository root, with `FRESHDESK_DOMAIN` and `FRESHDESK_API_KEY` set
     (and `FRESHDESK_MCP_CONFIG` if a team file is used;
     `FRESHDESK_HOST_OVERRIDE` must be unset, or the run refuses to
     start): `make smoke`. The output goes to
     `docs/private/account-facts.md` (gitignored); only shape lines go into
     tracked files. The `OD-4 name_to_id choices:` line answers OD-4. The
     run unblocks T-022 (then T-023, T-024, T-043) and decides T-041.
  2. Meanwhile `/pickup` takes **T-044** (Dependabot branches, spike): by
     PLAN's rule the first `todo` row whose dependencies are `done` (none),
     above T-017, T-018 and T-051 in row order.

- **Read before anything else:** `docs/tasks/PLAN.md` (T-044 row, OD
  table); `docs/tasks/T-016-smoke-scaffold.md`, "Done".

- **Reviews:**
  - **Full round** on `c95fd04..2850999`, R1 = `2850999`. The four quotes
    matched for all three, no Bash calls. compliance-reviewer: Wireframes
    `none`. security-reviewer: 0 High or Medium, 3 Low, 2 info.
    code-reviewer: 0 High, 3 Medium, 7 Low. Fixed in `2f20509` or parked
    in `docs/improvements.md`, entry `2850999` (by the orchestrator's
    decisions).
  - **Scoped round** on `2850999..2f20509`. The four quotes matched for
    all three, no Bash calls. List A empty for all three; compliance
    `none`. List B parked, entry `2f20509`.

- **Proposed plan changes:** none new. T-041 and T-049 stay
  `proposed (2026-11-23)`: T-041 waits on OD-4, T-049 on the owner's
  confirm or drop.

- **Open doubts (owner):**
  - **T-016:** RFC 2026-11-23 rule 2 read by its purpose for the second
    Agent builder, `scripts/smoke/cli.ts` (accepted by the orchestrator,
    2026-11-23); the "not JSON" label relies on the prefix of a fixed
    message in `src/client/http.ts` (parked, `2f20509`).
  - **T-051's list** is drawn from the M1 task files (see HANDOFF at
    `31ce639`).
  - **Carried from before**, unchanged; see HANDOFF at `81ee087`:
    - T-050: `.constructor`; `rate-limit.ts` not banned.
    - The 5 s lint-test timeout (`97c11e8`).
    - T-047's builder choices.
    - T-048 and T-038 publish gates.
    - OD-2, OD-3, OD-4.
    - The orchestrator's choices of 2026-11-23.
    - `examples/team-config.example.json`, until T-019 and T-037.
    - Schemas taken from the docs, not measured (the owner's smoke run
      measures them).
    - The gitleaks planted-secret check (T-001).
    - Hashes from before the history rewrite.
    - Two Dependabot branches (T-044).

- **Dead ends:** running the smoke script through Node's type stripping
  (`src/` imports `./x.js`); compiled with `tsc` instead. From before: the
  shortest-form grammar for T-051; the root `server.json` and the MCP
  Registry listing, withdrawn by the owner on 2026-11-23. Do not raise
  them again unasked.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (Node 22):
  - eslint clean, ruff "All checks passed!";
  - prettier "All matched files use Prettier code style!";
  - `tsc --noEmit` clean;
  - vitest "Test Files 15 passed (15)", "Tests 668 passed (668)";
  - `tools/checks` "Ran 54 tests", OK;
  - `npm run build` clean;
  - both gitleaks scans passed.
