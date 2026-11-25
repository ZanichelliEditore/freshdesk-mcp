# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-25T09:07:09+01:00`
- **Describes commit:** `fe81a3c`
  (`fe81a3c040e6d87764d44872ddfb55a4e7729a6a`), pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45573642764
  (workflow `quality`, ran on `fe81a3c`; observed through the public API).
  This file's hash and CI line arrive in the commit right after it.

- **Current task:** T-039 `done (2026-11-25)`, smoke over the `core`
  tools, M1 acceptance, `docs/tasks/T-039-m1-smoke.md` ("Done"). Commits
  `3a90531` (status), `dd87488` (`make smoke-core`), `6bcfafb` (rate-limit
  headers in decimal form), `670dbf3` (solutions term from a folder name),
  `42687eb` (review records, done). Built by a builder agent under the
  orchestrator (owner's instruction of 2026-11-23).
  - **Real runs** (orchestrator, owner's authorisation, GET only, period
    2026-11-19..25; raw output in the gitignored
    `docs/private/account-facts.md`): run 1 `smoke core: fail` (3
    `rate_limited`); run 2 after `6bcfafb` ok, 2 not exercised; run 3
    after `670dbf3`: "16 tool lines, 15 pass, 1 pass (empty), 0 not
    exercised, 0 refused (budget), 0 fail; 81 calls", `smoke core: ok`.
  - **Production bug found and fixed:** Freshdesk sends the rate-limit
    counts in decimal form; `count()` read only digits, so the limiter
    stayed at its assumed 50 calls a minute and refused after about 40
    (`src/client/rate-limit.ts`, `6bcfafb`;
    `test/client/http.test.ts::reads the counts in decimal form, as the
    real account sends them`).
  - **Owner's acceptance (2026-11-25):** `find_similar_tickets pass
    (empty)`, by name.

- **Next action:** `/pickup`. By PLAN's rule it takes **T-048** (RFC:
  release on npm). Owner decisions to record there (2026-11-25): license
  MIT; whoever is allowed to run the publish pipeline may publish (which
  points to npm trusted publishing over OIDC). Then T-045 (release
  workflow, `LICENSE` file, `private: true` removed), then the owner's go
  and tag for 0.1.0, then T-057 (export pages) and T-058 (solution tree by
  category), added to PLAN in `b622bf6`.

- **Read before anything else:** PLAN row T-048 and its task file;
  `docs/rfc/active/2026-11-23-adopt-runtime-stack.md:126-128`;
  `docs/improvements.md` entries `82ab7a6`, `03561f8` (stale `dist/`,
  pinned version).

- **Reviews:**
  - **Full round** on `46f7610..670dbf3`, R1 = `670dbf3`. The four quotes
    matched for all three. compliance: Wireframes `none`. security: no
    High or Medium; 1 Low (`DAYS` injection untested: the orchestrator
    probed `make smoke-core DAYS='$(shell touch …)'` and
    `DAYS='$$(touch …)'`, no file created), 2 info. code-reviewer: no
    High; 5 Medium (records and scope: recorded in `42687eb`), 7 Low
    (parked, `docs/improvements.md` entry `670dbf3`). The code-reviewer
    made one Bash call (`git grep`, errored, no output), against rule 8.
  - No scoped round: no code changed after R1.

- **Proposed plan changes:** T-057 and T-058 added (`b622bf6`, re-plan
  note in PLAN). Still `proposed`: T-041, T-052, T-049.

- **Open doubts (owner):**
  - **T-039:** `list_solution_tree` reaches no article on this account
    (T-058); a reserve refusal prints `fail rate_limited`.
  - **T-038:** T-045 must publish from a fresh CI build.
  - **Earlier, still open for you:** see HANDOFF at `f1dde79` and
    `41de8bc`.

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (local Node v26.13.1), run by the
  orchestrator on `b622bf6`:
  - vitest "Test Files 39 passed (39)", "Tests 2528 passed (2528)";
  - `tools/checks` "Ran 54 tests", OK;
  - lint, format, typecheck, build and both gitleaks scans passed.
