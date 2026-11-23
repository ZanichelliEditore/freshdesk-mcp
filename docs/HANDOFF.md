# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-23T15:50:19+01:00`
- **Describes commit:** STAMP-HASH, pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** STAMP-CI. This file's hash and
  CI line arrive in the commit right after it.

- **Current task:** sizing of T-050 (`/decompose`, scoped to that row; task
  file `docs/tasks/PLAN.md`), `done (2026-11-23)`. Commits `3479402`
  (T-050 `todo`, `docs/tasks/T-050-runtime-privacy.md`), `f61f70b`
  (full-round fixes) and the one this file describes (scoped round's list A
  as wording, documents). No `src/` or `test/` file changed.

- **Next action:** `/pickup` takes T-047
  (`docs/tasks/T-047-caller-deadline.md`). Then T-050; T-016, T-019, T-042
  and T-043 are not taken before T-050 is `done`.

- **Read before anything else:** `docs/tasks/PLAN.md`, rows T-047 and
  T-050.

- **Reviews:**
  - `planner` review and full round, range `b330f08..3479402`, R1 =
    `3479402`; the four quotes matched for all three, no Bash calls.
    security-reviewer: 3 Medium, 4 Low. code-reviewer: 3 Medium, 4 Low.
    planner: 3 findings. compliance-reviewer: Wireframes `none`. All
    applied in `f61f70b`.
  - Scoped round, range `3479402..f61f70b`; quotes matched for all three,
    no Bash calls; compliance `none`. security-reviewer: list A 2.
    code-reviewer: list A 1. Applied in the commit this file describes as
    acceptance wording (task files and PLAN rows of T-050 and T-016),
    **not reviewed again**. List B parked: `docs/improvements.md`, entry
    stamped `f61f70b`. No third round.

- **Proposed plan changes:** T-041 and T-049 stay `proposed (2026-11-23)`:
  T-041 waits on the owner's smoke run (OD-4), T-049 on the owner's
  confirm or drop.

- **Open doubts (owner):**
  - T-050's lint block gained a second pattern in the scoped round's
    wording pass (a regex refusing `./../config.js` and
    `../tools/../config.js`, which the anchored globs let through). It was
    tried in memory only (`docs/tasks/T-050-runtime-privacy.md`, In scope,
    Lint) and not reviewed.
  - A4: `limiter` is dropped from `AppContext`, not given a read-only
    view (the orchestrator's brief, the builder's choice of the smaller);
    to confirm.
  - Until T-050 is `done`: the client's `host` and `limiter`, the
    limiter's state and the schema service's cache are ordinary
    properties.
  - Threat model: private fields protect against a tool's mistake or a
    cast, not against hostile code in the process (`process.env` keeps the
    key); the owner's model is the former.
  - T-048: approve the mechanism that authorises a publish (the RFC
    recommends), then set it up before the first tag.
  - T-038: evidence that the organisation owns the npm scope and the
    publisher is a member, before the README names the package.
  - The npm token, if T-048 keeps one, and the explicit go for the first
    publish (0.1.0, after T-039).
  - OD-2 and OD-3 (per-tool writable fields, safety core): by the RFC of
    T-040; the parked note stamped `da373b7` (every tool holds a client
    that can POST) feeds it.
  - OD-4: the owner runs `make smoke` after T-016, then T-022's probes;
    T-022 to T-024, T-043, T-026 to T-030, T-036 and T-037 wait on it.
  - Orchestrator's choices of 2026-11-23, to confirm: choice names
    stripped of HTML and capped like labels (SPEC §7.4); `count_tickets`
    refuses a group-by field of a non-closed type (SPEC §8.2, T-036); the
    variable name `FRESHDESK_EXPORT_DIR` (SPEC §10, T-037); hidden fields
    "not guaranteed" in rows, counts and exports (SPEC §7.3).
  - `examples/team-config.example.json` still carries `export_dir` and
    three toolsets until T-019 and T-037 change it.
  - From before, still open: schemas follow the API v2 docs, not a live
    account (T-016 measures it); CI's gitleaks step not shown to fail on a
    planted secret (T-001); hashes quoted up to `59e3395` predate the
    history rewrite; two Dependabot branches on the remote (T-044).

- **Dead ends:** none in this session. From before: a root `server.json`
  and an MCP Registry listing were withdrawn by the owner on 2026-11-23:
  not parked, do not raise again unasked.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (Node 22): eslint clean, ruff "All
  checks passed!"; prettier "All matched files use Prettier code style!";
  `tsc --noEmit` clean; vitest "Test Files 14 passed (14)", "Tests 518
  passed (518)"; `tools/checks` "Ran 54 tests", OK; `npm run build`
  (`tsc -p tsconfig.build.json`) clean; both gitleaks scans passed.
