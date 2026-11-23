# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-23T16:51:58+01:00`
- **Describes commit:** `1671260`
  (`1671260c9d4df4f59335471e4237cc64ba5589b5`), pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45210203469
  (ran on `1671260`: `quality (22.19)`, `quality (24)`, `checks`). This
  file's hash and CI line arrive in the commit right after it.

- **Current task:** T-050, harden runtime privacy of the HTTP client,
  limiter and schema service, plus the `src/tools/**` lint block
  (`docs/tasks/T-050-runtime-privacy.md`), `done (2026-11-23)`. Commits
  `416641e` (build), `d8b7967` (full review fixes) and the one this file
  describes (documents, and one comment in `eslint.config.mjs`). Red runs
  against the starting `src/` and config: the task file's "Done". Split
  point not taken.

- **Next action:** `/decompose` sizes the `proposed` row T-051 (lint
  allow-list); T-019, T-042 and T-043 are not taken before it is `done`.
  Then `/pickup` takes T-016 (`docs/tasks/T-016-*.md`).

- **Read before anything else:** `docs/tasks/PLAN.md`, row T-051;
  `docs/improvements.md`, the entries stamped `416641e` and `d8b7967`;
  `docs/tasks/T-050-runtime-privacy.md`, "Open doubts".

- **Reviews:**
  - Full round, range `dd191ec..416641e`, R1 = `416641e`; the four quotes
    matched for all three, no Bash calls. security-reviewer: 1 Medium, 3
    Low; code-reviewer: 1 Medium, 3 Low, 1 nit; all fixed in `d8b7967`
    (the shortest-form regex also refuses `//`, `\`, `%`, `?`, `#`; limiter
    helper rows; wording). compliance-reviewer: Wireframes `none`. The
    builder's extra (`expire`, `below`, `left` as `#` methods) accepted by
    the orchestrator. Parked: entry stamped `416641e`.
  - Scoped round, range `416641e..d8b7967`; quotes matched for all three,
    no Bash calls; compliance `none`. code-reviewer list A empty.
    security-reviewer list A, 1: a segment starting with a dot followed by
    `..` (`../.x/../config.js`) reaches `config`; confirmed by the
    orchestrator's in-memory probe on `d8b7967`. Owner's decision
    (2026-11-23, rule 9): close T-050, the fix is its own row (T-051); the
    handoff commit only states the gap. List B parked: entry stamped
    `d8b7967` (code B2, security B4 and the stale part of `f61f70b` fixed in
    the documents). No third round.

- **Proposed plan changes:** T-051, "Lint: allow-list of shortest-form
  relative specifiers in src/tools/**", `proposed (2026-11-23)`, placed
  before T-019: owner-confirmed on 2026-11-23, to be sized by the next
  `/decompose` (it adds it to T-019's, T-042's and T-043's dependencies).
  T-041 and T-049 stay `proposed (2026-11-23)`: T-041 waits on the owner's
  smoke run (OD-4), T-049 on the owner's confirm or drop.

- **Open doubts (owner):**
  - T-050: the dot-segment gap above (T-051); `.constructor` on
    `context.http` and `context.schema` reaches the class, refused by
    neither the freeze nor lint; `src/client/rate-limit.ts` is not in the
    ban list (parked, `d8b7967`). Threat model: a tool's mistake or a cast,
    not hostile code in the process.
  - `test/lint-rules.test.ts`, first eslint case, 5 s timeout: not hit in
    this session's runs (load average under 2.5); still parked
    (`97c11e8`).
  - T-047, builder's choices accepted by the orchestrator on 2026-11-23,
    to confirm: the expiry message no longer names 30 s; a deadline already
    reached (`NaN` included) is refused as `network` without asking the
    limiter, a write so refused `retryable: false` though not sent (T-014
    decides). A NaN bound on a direct `acquire` is still unguarded (parked,
    `c44a36e`, `97c11e8`; not in T-050's scope).
  - T-048: approve the mechanism that authorises a publish, then set it up
    before the first tag. T-038: evidence that the organisation owns the
    npm scope and the publisher is a member. The npm token, if T-048 keeps
    one, and the explicit go for the first publish (0.1.0, after T-039).
  - OD-2 and OD-3 (per-tool writable fields, safety core): by the RFC of
    T-040; the parked note stamped `da373b7` feeds it.
  - OD-4: the owner runs `make smoke` after T-016, then T-022's probes;
    T-022 to T-024, T-043, T-026 to T-030, T-036 and T-037 wait on it.
  - Orchestrator's choices of 2026-11-23, to confirm: choice names stripped
    of HTML and capped like labels (SPEC §7.4); `count_tickets` refuses a
    group-by field of a non-closed type (SPEC §8.2, T-036); the variable
    name `FRESHDESK_EXPORT_DIR` (SPEC §10, T-037); hidden fields "not
    guaranteed" in rows, counts and exports (SPEC §7.3).
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
  `tsc --noEmit` clean; vitest "Test Files 14 passed (14)", "Tests 615
  passed (615)"; `tools/checks` "Ran 54 tests", OK; `npm run build` clean;
  both gitleaks scans passed.
