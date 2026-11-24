# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-24T09:41:33+01:00`
- **Describes commit:** filled by the stamp commit. **CI:** filled by the
  stamp commit.

- **Current task:** T-054 `done (2026-11-24)`,
  `docs/tasks/T-054-count-attempts.md` ("Done"). Commits `c48aa6b`
  (status), `ea241c8` (build), `5b07bda` (review Lows, task file).
  `requestWithRetry` and `paginate` report the attempts sent; list tools'
  `api_calls_used` now equals the requests sent, retries included (T-021's
  recorded limitation is gone). Built by a builder agent under the
  orchestrator (owner's instruction of 2026-11-23).

- **Next action:** `/pickup`. By PLAN's rule it takes **T-022** (spike:
  which endpoint serves which ticket filter; unblocked by the smoke run of
  2026-11-24, HANDOFF at `f286c82`). Its probes are run against the real
  account by the orchestrator on the owner's authorisation, with the
  domain and key in `docs/private/`.
  - **The owner**, Dependabot PRs (unchanged; T-044 "Done").

- **Read before anything else:** PLAN row T-022 and its task file.

- **Reviews:**
  - **Full round** on `8c3bb6b..ea241c8`, R1 = `ea241c8`. The four quotes
    matched for all three; no Bash calls. compliance: Wireframes `none`.
    security-reviewer: none (T-050's privacy, the smoke GET-only guard,
    host check, deadline and write-no-retry all unchanged).
    code-reviewer: 3 Low (attempts leaking from `listTicketFields`'
    failure; two untested counting branches; doc wording), fixed in
    `5b07bda`.
  - **Scoped round:** not needed: the fixes changed no mechanism (rule 9).

- **Proposed plan changes:** none new. T-041 can be sized (OD-4 answered).
  Carried: T-052, T-049 `proposed (2026-11-23)`.

- **Open doubts (owner):**
  - **T-054:** a subclass whose `request` returns a copy of the result
    under-counts; a network error before anything reaches the wire (DNS)
    counts 1.
  - **T-021:** the acceptance amendment of 2026-11-24 (made by the
    orchestrator) is now met by the plain rule; see HANDOFF at `fcca38f`.
  - **T-020, T-019, T-053, T-051:** see HANDOFF at `65be293`, `f286c82`,
    `470124f`, `876ec68`.
  - **Carried**, unchanged: see HANDOFF at `20f4b2f` and `d20c83b`.

- **Dead ends:** T-054: a private send helper (would bypass `SmokeClient`'s
  GET-only override of `request`). From before: see HANDOFF at `fcca38f`
  and `876ec68`.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (Node 22.23.5), from the builder's
  run before `5b07bda`:
  - eslint clean, ruff "All checks passed!";
  - prettier "All matched files use Prettier code style!";
  - `tsc --noEmit` clean;
  - vitest "Test Files 20 passed (20)", "Tests 1431 passed (1431)";
  - `tools/checks` "Ran 54 tests", OK;
  - `npm run build` clean;
  - both gitleaks scans passed.
