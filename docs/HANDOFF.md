# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-24T12:25:56+01:00`
- **Describes commit:** `86e2cea`
  (`86e2ceae516b1651c691c791f6d1bb8de152c966`), pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45384232189
  (workflow `quality`, ran on `86e2cea`; observed through the public API).
  This file's hash and CI line arrive in the commit right after it.

- **Current task:** T-028 `done (2026-11-24)`,
  `docs/tasks/T-028-search-tickets.md` ("Done"). Commits `0fc45a4`
  (status), `ec3a5bc` (build), `f7ead5e` (review fixes, done).
  `search_tickets`: a model-written query passed unchanged to
  `/search/tickets`, rows through `ticketRow`, 30 a page, 10 pages,
  `truncated` over 300. Built by a builder agent under the orchestrator
  (owner's instruction of 2026-11-23).

- **Next action:** `/pickup`. By PLAN's rule it takes **T-029**
  (`triage_queue`). `docs/architecture/ticket-queries.md` classes it
  `expensive` when it fetches the stats signals (one
  `GET /tickets/{id}?include=stats` per row) and lists as open whether a
  one-ticket `include=stats` returns the same 8 keys as the list.
  - **The owner:** local `node` is v26.13.1 (HANDOFF at `c7e4b3c`).
  - **The owner**, Dependabot PRs (unchanged; T-044 "Done").

- **Read before anything else:** PLAN row T-029 and its task file;
  `docs/architecture/ticket-queries.md` (the `triage_queue` rows, "Open").

- **Reviews:**
  - **Full round** on `5703326..ec3a5bc`, R1 = `ec3a5bc`. The four quotes
    matched for all three; no Bash calls. compliance: Wireframes `none`.
    security: none. code-reviewer: 2 Medium (the description said
    "nothing is sent" for a refused query, false on a cold schema; the
    nested-field wording invited a query measured to be a 400), 3 Low.
    Fixed in `f7ead5e` (wording, one test, `MAX_SEARCH_POSITION` moved to
    `src/client/resources/search.ts`).
  - **Scoped round:** not needed: no fix changed a mechanism (rule 9).
  - The `account-patterns` hook refused one description example before
    the build commit; the builder replaced it. The orchestrator checked
    that the refused token is in no tracked file and the hook passes on
    the whole tree.

- **Proposed plan changes:** none new. T-055 `proposed (2026-11-24)`
  (search date boundary; size before T-036). T-036 boundary-day line and
  the T-036/T-037 cost argument on `searchTickets`: HANDOFF at `46c8af8`,
  `8c90427`. T-041 can be sized. Carried: T-052, T-049
  `proposed (2026-11-23)`.

- **Open doubts (owner):**
  - **T-028:** a hidden field can be searched (owner's decision of
    2026-11-23: `hidden` hides output, not searchability); the refused-query
    message does not say which rule failed. See the task file.
  - **T-027 and earlier:** see HANDOFF at `85afd63`, `0b830e0`, `e8c3120`,
    `46c8af8`, `c7e4b3c`, `26e6101`, `8c90427`, `fe4c24c` (T-022
    confirms), `c79a23b`, `ae9da29`, `fcca38f`, `65be293`, `f286c82`,
    `470124f`, `876ec68`, `20f4b2f`, `d20c83b`.

- **Dead ends:** none this task. From before: see HANDOFF at `85afd63`,
  `fe4c24c`, `ae9da29`, `876ec68`.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (local Node v26.13.1), from the
  builder's run on `f7ead5e`'s tree:
  - ruff "All checks passed!";
  - prettier "All matched files use Prettier code style!";
  - eslint, `tsc --noEmit`, `npm run build` passed;
  - vitest "Test Files 28 passed (28)", "Tests 1895 passed (1895)";
  - `tools/checks` "Ran 54 tests", OK;
  - both gitleaks scans passed.
