# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-24T11:51:32+01:00`
- **Describes commit:** filled by the stamp commit. **CI:** filled by the
  stamp commit.

- **Current task:** T-056 `done (2026-11-24)`,
  `docs/tasks/T-056-schema-load-attempts.md` ("Done"). Commits `4b3c105`
  (status), `2a56dc9` (build), `e09fd24` (review Lows, done), and the
  handoff commit (scoped round recorded, parked items).
  `SchemaService.get()` reports the requests its load sent to the call
  that started it (0 from the cache or when joining); results are handed
  out frozen; `get_ticket`'s `api_calls_used` now equals the requests
  sent on a cold schema too (T-026's recorded limitation is gone). Built
  by a builder agent under the orchestrator (owner's instruction of
  2026-11-23).

- **Next action:** `/pickup`. By PLAN's rule it takes **T-027**
  (`list_tickets`). Its acceptance should also show a ticket on the
  widened boundary day absent from the output (it must call
  `matchesLocal`; HANDOFF at `46c8af8`).
  - **The owner:** local `node` is v26.13.1 (HANDOFF at `c7e4b3c`).
  - **The owner**, Dependabot PRs (unchanged; T-044 "Done").

- **Read before anything else:** PLAN row T-027 and its task file;
  `docs/architecture/ticket-queries.md`.

- **Reviews:**
  - **Full round** on `29a34ff..2a56dc9`, R1 = `2a56dc9`. The four quotes
    matched for all three; no Bash calls. compliance: Wireframes `none`.
    security: 1 Low (the starter's result wrapper unfrozen), 1 info.
    code-reviewer: 4 Low. The orchestrator checked that only
    `get-ticket.ts` and `get-ticket-schema.ts` call `schema.get()`. Fixed
    in `e09fd24` (results frozen, direct tests, overview sentence).
  - **Scoped round** on `2a56dc9..e09fd24` (the freeze changed a
    mechanism). The four quotes matched for all three; no Bash calls.
    List A empty for all three; compliance `none`. Lists B parked, entry
    `e09fd24`.

- **Proposed plan changes:** none new. T-055 `proposed (2026-11-24)`
  (search date boundary; size before T-036). T-027/T-036 boundary-day
  line and the T-036/T-037 cost argument: HANDOFF at `46c8af8`,
  `8c90427`. T-041 can be sized. Carried: T-052, T-049
  `proposed (2026-11-23)`.

- **Open doubts (owner):**
  - **T-056:** a schema load started by `get_ticket_schema`, by a
    `get_ticket` call that then fails, or a failed load, is reported by no
    call's `api_calls_used` (the limiter still sees every request).
  - **T-026 and earlier:** see HANDOFF at `e8c3120`, `46c8af8`,
    `c7e4b3c`, `26e6101`, `8c90427`, `fe4c24c` (T-022 confirms),
    `c79a23b`, `ae9da29`, `fcca38f`, `65be293`, `f286c82`, `470124f`,
    `876ec68`, `20f4b2f`, `d20c83b`.

- **Dead ends:** none this task. From before: see HANDOFF at `fe4c24c`,
  `ae9da29`, `876ec68`.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (local Node v26.13.1), from the
  builder's run on `e09fd24`:
  - ruff "All checks passed!";
  - prettier "All matched files use Prettier code style!";
  - eslint, `tsc --noEmit`, `npm run build` and both gitleaks scans
    passed with the exit 0 (their lines not captured);
  - vitest "Test Files 26 passed (26)", "Tests 1778 passed (1778)";
  - `tools/checks` "Ran 54 tests", OK.
