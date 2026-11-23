# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-23T14:50:30+01:00`
- **Describes commit:** `HASH_PENDING`. **CI:** CI_PENDING. This file's
  hash and CI line arrive in the commit right after it.

- **Current task:** M1 decomposition (`/decompose M1`, a `plan` session;
  its task file is `docs/tasks/PLAN.md`), `done (2026-11-23)`. Commits
  `8399b60` (plan and owner decisions), `342758a` (full-round fixes) and
  the one this file describes (scoped-round wording). Documents only: no
  `src/` or `test/` change.

- **Next action:** `/pickup` takes T-015
  (`docs/tasks/T-015-app-context.md`).

- **Read before anything else:** `docs/tasks/PLAN.md`, section M1: its
  notes, the "Owner decisions" table and the rows (execution order, not id
  order).

- **Reviews:**
  - `planner` on the first draft: 3 High, 7 Medium, applied before
    `8399b60`.
  - Full round, range `d06ba09..8399b60`, R1 = `8399b60`; the four quotes
    matched for all three, no Bash calls. security-reviewer: 2 High, 5
    Medium, 5 Low. code-reviewer: 6 Medium, 11 Low. compliance-reviewer:
    Wireframes `none`. A `planner` re-check: 4 findings. All applied in
    `342758a`.
  - Scoped round, range `8399b60..342758a`; quotes matched for all three,
    no Bash calls; compliance `none`. List A: security 3, code 4, all
    acceptance wording, applied in the commit this file describes and
    **not reviewed again** (no third round, rule 9). List B parked:
    `docs/improvements.md`, entry stamped `342758a`.

- **Proposed plan changes:** T-041 (`ticketInput`: agent, group, product
  by the measured shape) and T-049 (maintainer's check of a pull request's
  range for account values), both `proposed (2026-11-23)`, to confirm or
  drop at the next `/decompose`.

- **Open doubts (owner):**
  - T-048: approve the mechanism that authorises a publish (the RFC
    recommends), then set it up before the first tag.
  - T-038: evidence that the organisation owns the npm scope and the
    publisher is a member, before the README names the package.
  - The npm token, if T-048 keeps one, and the explicit go for the first
    publish (0.1.0, after T-039).
  - OD-2 and OD-3 (per-tool writable fields, safety core): by the RFC of
    T-040.
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

- **Dead ends:** a root `server.json` and an MCP Registry listing were
  planned and then withdrawn by the owner on 2026-11-23: not
  parked, do not raise again unasked.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (Node 22): eslint and ruff "All
  checks passed!"; prettier "All matched files use Prettier code style!";
  `tsc --noEmit` clean; vitest "Test Files 13 passed (13)", "Tests 503
  passed (503)"; `tools/checks` "Ran 54 tests", OK; both gitleaks scans
  passed.
