# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-23T16:09:46+01:00`
- **Describes commit:** `ff8420a`
  (`ff8420ab8cc388fb9884dfbfd869183359b5a06e`), pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45202226315
  (ran on `ff8420a`: `quality (22.19)`, `quality (24)`, `checks`). This
  file's hash and CI line arrive in the commit right after it.

- **Current task:** T-047, caller deadline through `requestWithRetry`,
  `paginate`, the resources and the schema load
  (`docs/tasks/T-047-caller-deadline.md`), `done (2026-11-23)`. Commits
  `c44a36e` (build), `97c11e8` (full review fixes) and the one this file
  describes (documents only). Tests: the task file's "Done". Split point
  not needed.

- **Next action:** `/pickup` takes T-050
  (`docs/tasks/T-050-runtime-privacy.md`). T-016, T-019, T-042 and T-043
  are not taken before T-050 is `done`.

- **Read before anything else:** `docs/tasks/PLAN.md`, row T-050;
  `docs/improvements.md`, the two entries stamped `c44a36e` and `97c11e8`
  (the NaN bound of `acquire` is a candidate for T-050).

- **Reviews:**
  - Full round, range `da02ddf..c44a36e`, R1 = `c44a36e`; the four quotes
    matched for all three, no Bash calls. security-reviewer: no finding.
    code-reviewer: 1 Medium, 3 Low, fixed in `97c11e8` (one Low kept as
    built and parked for T-014). compliance-reviewer: Wireframes `none`.
    Beyond the review's list, `97c11e8` rewrote the backoff check of
    `requestWithRetry` for a deadline that is not a number: a mechanism
    change, reviewed in the scoped round.
  - Scoped round, range `c44a36e..97c11e8`; quotes matched for all three,
    no Bash calls; list A empty for all three; compliance `none`. List B
    parked: `docs/improvements.md`, entry stamped `97c11e8`. No third
    round.
  - The tests T-047 added spy on neither the client nor the limiter; two
    `limiter.acquire` spies of T-013 remain in
    `test/client/http-retry.test.ts`.

- **Proposed plan changes:** none new. T-041 and T-049 stay
  `proposed (2026-11-23)`: T-041 waits on the owner's smoke run (OD-4),
  T-049 on the owner's confirm or drop.

- **Open doubts (owner):**
  - T-047, builder's choices accepted by the orchestrator on 2026-11-23,
    to confirm: the expiry message no longer names 30 s; a deadline
    already reached (`NaN` included) is refused as `network` without
    asking the limiter, and a write so refused is `retryable: false`
    though not sent (T-014 decides);
    `test/client/resources/ticket-fields.test.ts` changed beyond the task
    file's list. Details: the task file's "Open doubts".
  - `test/lint-rules.test.ts:47`, first case (the first eslint run): its
    5 s timeout failed 2 of 3 `make quality` runs on 2026-11-23 under a
    load average of 10 to 13; not touched by T-047, parked
    (`docs/improvements.md`, `97c11e8`). CI may meet it.
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

- **Checkpoint:** `make quality` exit 0 on the first run (Node 22): eslint
  clean, ruff "All checks passed!"; prettier "All matched files use
  Prettier code style!"; `tsc --noEmit` clean; vitest "Test Files 14
  passed (14)", "Tests 540 passed (540)"; `tools/checks` "Ran 54 tests",
  OK; `npm run build` (`tsc -p tsconfig.build.json`) clean; both gitleaks
  scans passed.
