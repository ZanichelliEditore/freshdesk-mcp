# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-24T14:02:31+01:00`
- **Describes commit:** filled by the stamp commit. **CI:** filled by the
  stamp commit.

- **Current task:** T-029 `done (2026-11-24)`,
  `docs/tasks/T-029-triage-queue.md` ("Done"). Commits `12b376c`
  (status), `b70efa6` (build, `view_include_stats` probe), `74cb0bf`
  (full-round fixes), `c41b108` (wording, task file, parked items).
  `triage_queue`: open and pending tickets from search, due dates,
  escalation flags, ages; with `reply_signals: true` one
  `GET /tickets/{id}?include=stats` per row (`expensive`, 31 requests at
  most), partial return on a later limiter refusal. Built by a builder
  agent under the orchestrator (owner's instruction of 2026-11-23).
  **Probe run** (2026-11-24, orchestrator on the owner's authorisation,
  22 GETs): a one-ticket view with `include=stats` returns all 8 `stats`
  keys, 2 credits; raw output in the gitignored
  `docs/private/account-facts.md`.

- **Next action:** `/pickup`. By PLAN's rule it takes **T-030**
  (`find_similar_tickets`).
  - **The owner:** local `node` is v26.13.1 (HANDOFF at `c7e4b3c`).
  - **The owner**, Dependabot PRs (unchanged; T-044 "Done").

- **Read before anything else:** PLAN row T-030 and its task file;
  `docs/architecture/ticket-queries.md` (`find_similar_tickets`: category
  matching is local; `requester_id`/`company_id` with its own
  `updated_since` window).

- **Reviews:**
  - **Full round** on `eb36755..b70efa6`, R1 = `b70efa6`. The four quotes
    matched for all three; no Bash calls. compliance: Wireframes `none`.
    security: 1 Medium (a failed view discarded the page after the
    credits were spent), 2 Low. code-reviewer: 3 Medium (the same
    discard; `unanswered_customer_reply: false` for a never-answered
    ticket; `first_response_overdue` true for answered tickets), Lows.
    Fixed in `74cb0bf`.
  - **Scoped round** on `b70efa6..74cb0bf`. The four quotes matched for all
    three; no Bash calls. List A empty for all three; compliance `none`.
    Lists B parked, entry `74cb0bf`; wording and one pinning test in
    `c41b108`.

- **Proposed plan changes:** none new. T-055 `proposed (2026-11-24)`
  (search date boundary; size before T-036). T-036 boundary-day line and
  the T-036/T-037 cost argument on `searchTickets`: HANDOFF at `46c8af8`,
  `8c90427`. T-041 can be sized. Carried: T-052, T-049
  `proposed (2026-11-23)`.

- **Open doubts (owner):**
  - **T-029:** the reply signals are on request (`reply_signals`, off by
    default) while the PLAN text says "each row has" (the spike note
    allowed it); a final 429 after the retries still discards answered
    views; a ticket opened by an agent with no agent reply reads as
    unanswered; custom statuses are not in the queue (only 2 and 3). See
    the task file.
  - **T-028 and earlier:** see HANDOFF at `86e2cea`, `85afd63`, `0b830e0`,
    `e8c3120`, `46c8af8`, `c7e4b3c`, `26e6101`, `8c90427`, `fe4c24c`
    (T-022 confirms), `c79a23b`, `ae9da29`, `fcca38f`, `65be293`,
    `f286c82`, `470124f`, `876ec68`, `20f4b2f`, `d20c83b`.

- **Dead ends:** see the T-029 task file; from before: HANDOFF at
  `85afd63`, `fe4c24c`, `ae9da29`, `876ec68`.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (local Node v26.13.1), from the
  builder's run on `c41b108`'s tree:
  - ruff "All checks passed!";
  - prettier "All matched files use Prettier code style!";
  - eslint, `tsc --noEmit`, `npm run build` passed;
  - vitest "Test Files 29 passed (29)", "Tests 1987 passed (1987)";
  - `tools/checks` "Ran 54 tests", OK;
  - both gitleaks scans passed.
