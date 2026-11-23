# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-23T15:33:52+01:00`
- **Describes commit:** `<hash>`, pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** `<pending>`. This file's hash
  and CI line arrive in the commit right after it.

- **Current task:** T-015, app context
  (`docs/tasks/T-015-app-context.md`), `done (2026-11-23)`. Commits
  `da373b7` (build), `b4a1571` (full-round fixes) and the one this file
  describes (wording after the scoped round, documents).

- **Next action:** `/decompose` sizes the `proposed` row T-050 (and may
  confirm or drop T-041 and T-049); then `/pickup` takes T-047
  (`docs/tasks/T-047-caller-deadline.md`). T-019 is
  not taken before T-050 is `done`.

- **Read before anything else:** `docs/tasks/PLAN.md`, rows T-050 and
  T-047; `docs/tasks/T-015-app-context.md`, "Open doubts".

- **Reviews:**
  - Full round, range `6bdcca3..da373b7`, R1 = `da373b7`; the four quotes
    matched for all three, no Bash calls. security-reviewer: 2 Medium, 1
    Low. code-reviewer: 2 Medium, 4 Low. compliance-reviewer: Wireframes
    `none`. All fixed in `b4a1571`; one note parked
    (`docs/improvements.md`, entry stamped `da373b7`).
  - Scoped round, range `da373b7..b4a1571`; quotes matched for all three,
    no Bash calls; compliance `none`. code-reviewer: list A empty.
    security-reviewer: list A 4 items, each needing another mechanism
    change, so reported to the owner (rule 9). Owner, 2026-11-23: close
    T-015, the hardening is its own task (T-050). List B parked:
    `docs/improvements.md`, entry stamped `b4a1571`. The wording changes
    of the commit this file describes were **not reviewed again**.

- **Proposed plan changes:**
  - T-050, harden runtime privacy of the HTTP client, limiter and schema
    service: `proposed (2026-11-23)`, **confirmed by the owner** on
    2026-11-23, to be sized by the next `/decompose` and `done` before
    T-019 is taken.
  - T-041 and T-049, both `proposed (2026-11-23)`, still to confirm or
    drop.

- **Open doubts (owner):**
  - Until T-050: the client's `host` and `limiter`, the limiter's state
    and the schema service's cache are ordinary properties. What is
    proven is only that the key cannot be read or printed from the
    context, and that the team settings and the context object are
    frozen.
  - Threat model: private fields protect against a tool's mistake or a
    cast, not against hostile code in the process (`process.env` keeps
    the key); the owner's model is the former.
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

- **Dead ends:** none in T-015. From before: a root `server.json` and an
  MCP Registry listing were withdrawn by the owner on 2026-11-23: not
  parked, do not raise again unasked.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (Node 22): eslint clean, ruff "All
  checks passed!"; prettier "All matched files use Prettier code style!";
  `tsc --noEmit` clean; vitest "Test Files 14 passed (14)", "Tests 518
  passed (518)"; `tools/checks` "Ran 54 tests", OK; `npm run build`
  (`tsc -p tsconfig.build.json`) clean; both gitleaks scans passed.
