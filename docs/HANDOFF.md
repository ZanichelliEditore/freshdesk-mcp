# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-24T12:13:46+01:00`
- **Describes commit:** filled by the stamp commit. **CI:** filled by the
  stamp commit.

- **Current task:** T-027 `done (2026-11-24)`,
  `docs/tasks/T-027-list-tickets.md` ("Done"). Commits `c79e6e7`
  (status), `3cfe98a` (build), `eccf62f` (full-round fixes), `0fa9032`
  (wording, task file, parked items). `list_tickets`: the nine filters
  through `buildTicketQuery`, search (30 a page, 10 pages) or the list
  endpoint (30 a page, 300 pages), `matchesLocal` on every row,
  `detail: true` cut at 1,000 per value, the `uncategorized` scan
  (`expensive`, bounded, resumable). Built by a builder agent under the
  orchestrator (owner's instruction of 2026-11-23).

- **Next action:** `/pickup`. By PLAN's rule it takes **T-028**
  (`search_tickets`), then T-029, T-030.
  - **The owner:** local `node` is v26.13.1 (HANDOFF at `c7e4b3c`).
  - **The owner**, Dependabot PRs (unchanged; T-044 "Done").

- **Read before anything else:** PLAN row T-028 and its task file;
  `docs/architecture/ticket-queries.md` ("Parameters": `searchTickets`
  refuses `"` and `\`).

- **Reviews:**
  - **Full round** on `c9c232c..3cfe98a`, R1 = `3cfe98a`. The four quotes
    matched for all three. compliance: Wireframes `none`. security:
    1 Medium (`detail: true` unbounded in size), 2 Low. code-reviewer:
    3 Medium (`SEARCH_FILTERS` unpinned; the list cap silent and the docs
    stale; a scan's later-page failure discarding rows), 3 Low; one
    read-only `git grep`, said so. Fixed in `eccf62f`.
  - **Scoped round** on `3cfe98a..eccf62f`. The four quotes matched for all
    three; no Bash calls. List A empty for all three; compliance `none`.
    Lists B parked, entry `eccf62f`; wording fixed in `0fa9032`.
    **Orchestrator's acceptance amendments** (owner's delegation): the
    boundary-day clause (before the build) and "`detail: true` … each text
    value cut at 1,000 code points" (after the review).

- **Proposed plan changes:** none new. T-055 `proposed (2026-11-24)`
  (search date boundary; size before T-036). T-036 boundary-day line and
  the T-036/T-037 cost argument on `searchTickets` (`listTickets` has it
  since T-027): HANDOFF at `46c8af8`, `8c90427`. T-041 can be sized.
  Carried: T-052, T-049 `proposed (2026-11-23)`.

- **Open doubts (owner):**
  - **T-027:** a real 429 on a later scan page returns the partial list
    (the limiter's hold refuses the retry); `detail` has no whole-response
    bound; whether list page 300 carries a `Link` is unmeasured. See the
    task file.
  - **T-056, T-026 and earlier:** see HANDOFF at `0b830e0`, `e8c3120`,
    `46c8af8`, `c7e4b3c`, `26e6101`, `8c90427`, `fe4c24c` (T-022
    confirms), `c79a23b`, `ae9da29`, `fcca38f`, `65be293`, `f286c82`,
    `470124f`, `876ec68`, `20f4b2f`, `d20c83b`.

- **Dead ends:** T-027: expecting a 429 on a later scan page to fail the
  call (it reaches the tool as a limiter refusal). From before: see
  HANDOFF at `fe4c24c`, `ae9da29`, `876ec68`.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (local Node v26.13.1), from the
  builder's run on `0fa9032`'s tree:
  - ruff "All checks passed!";
  - prettier "All matched files use Prettier code style!";
  - eslint, `tsc --noEmit`, `npm run build` passed;
  - vitest "Test Files 27 passed (27)", "Tests 1859 passed (1859)";
  - `tools/checks` "Ran 54 tests", OK;
  - both gitleaks scans passed.
