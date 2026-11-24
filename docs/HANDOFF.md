# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-24T10:09:06+01:00`
- **Describes commit:** `fe4c24c`
  (`fe4c24ca3494719f0eefba8243fd5394644518a4`), pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45362555416
  (workflow `quality`, ran on `fe4c24c`; observed through the public API).
  This file's hash and CI line arrive in the commit right after it.

- **Current task:** T-022 `done (2026-11-24)` (spike),
  `docs/tasks/T-022-spike-ticket-queries.md` ("Done"). Commits `e408ca8`
  (status), `0ab246f` (draft, probes), `e3fcdb1` (measured rows),
  `86b788a` (review fixes: control probes, note), `59e4e11` (control-run
  conclusions). Decision note: `docs/architecture/ticket-queries.md`.
  **Probe runs** against the real account (2026-11-24, 16 then 21 GETs, by
  the orchestrator on the owner's authorisation: the owner gave the key
  and domain on 2026-11-23 "in case you need tests"); raw output in the
  gitignored `docs/private/account-facts.md`.

- **Next action:** `/pickup`. By PLAN's rule it takes **T-023** (client
  resource: tickets), unblocked; T-024 and T-043 follow.
  - **The owner**, Dependabot PRs (unchanged; T-044 "Done").

- **Read before anything else:** `docs/architecture/ticket-queries.md`
  ("Parameters", "Open"), PLAN row T-023.

- **Reviews:**
  - **Full round** on `c24efd9..e3fcdb1`, R1 = `e3fcdb1`. The four quotes
    matched for all three; no Bash calls. compliance: Wireframes `none`.
    security: none blocking (totals printed exactly; who ran it).
    code-reviewer: 2 High, 4 Medium, Lows, all on the note's conclusions
    (spaces in search unproven; `triage_queue` mis-classed; nested `:null`
    cause; 8 s page vs scan bounds; past-300 strategy; requester rule).
    Fixed in `86b788a` + `59e4e11`: control probes re-run, totals and
    times as bands, conclusions revised.
  - **Scoped round** on `e3fcdb1..59e4e11`. The four quotes matched for
    all three; no Bash calls. List A empty for all three; compliance
    `none`. Lists B parked in `docs/improvements.md`, entry `59e4e11`.

- **Proposed plan changes:** none new. T-041 can be sized (OD-4
  answered). Carried: T-052, T-049 `proposed (2026-11-23)`.

- **Open doubts (owner):**
  - **T-022 (confirm):** with `uncategorised_fields` set, a ticket with
    any listed field empty is uncategorised; `uncategorized` is always a
    local check on `custom_fields` (search refuses the nested field
    entirely), even where search `:null` works on plain fields.
  - **T-022, open items** (with the tasks they bear on): the deadline a
    list scan runs under (T-027, T-036, T-037); search date-boundary
    semantics (T-043, T-036, T-037); one-ticket `include=stats` keys
    (T-029); `company_id` alone and the 30-day window (T-030).
  - **T-054, T-021, T-020, T-019, T-053, T-051:** see HANDOFF at
    `ae9da29`, `fcca38f`, `65be293`, `f286c82`, `470124f`, `876ec68`.
  - **Carried**, unchanged: see HANDOFF at `20f4b2f` and `d20c83b`.

- **Dead ends:** T-022: always sending `updated_since` with
  `requester_id` (the control run showed `requester_id` alone lifts the
  30-day window); splitting search into `created_at` windows past 300.
  From before: see HANDOFF at `ae9da29` and `876ec68`.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (Node 22.23.5), from the builder's
  run before `59e4e11`:
  - eslint clean, ruff "All checks passed!";
  - prettier "All matched files use Prettier code style!";
  - `tsc --noEmit` clean;
  - vitest "Test Files 20 passed (20)", "Tests 1460 passed (1460)";
  - `tools/checks` "Ran 54 tests", OK;
  - `npm run build` clean;
  - both gitleaks scans passed.
