# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-24T08:58:32+01:00`
- **Describes commit:** filled by the stamp commit. **CI:** filled by the
  stamp commit.

- **Current task:** T-019 `done (2026-11-24)`,
  `docs/tasks/T-019-mcp-server.md` ("Done"). Commits `5dc6c30` (status),
  `f5e55aa` (build), `71de5f5` (full-round fixes), `fe79988` (task file,
  parked items, journal). Adds `@modelcontextprotocol/server` 2.4.0
  (admitted by the runtime RFC). Built by a builder agent under the
  orchestrator (owner's instruction of 2026-11-23).

- **Next action:** `/pickup`. By PLAN's rule it takes **T-020**
  (`get_ticket_schema`, the first registered tool).
  - **Smoke run done** (2026-11-24, by the orchestrator on the owner's
    authorisation): `make smoke` → `smoke: ok`; output in the gitignored
    `docs/private/account-facts.md`; domain and key in
    `docs/private/freshdesk-domain` and `docs/private/freshdesk-api-key`.
    **OD-4 answered:** `default_agent` and `default_group` carry a
    name → id record, `default_product` is absent. T-022 is unblocked;
    T-041 stays (agent and group), product has nothing to do.
  - **The owner**, Dependabot PRs (unchanged; T-044 "Done").

- **Read before anything else:** PLAN row T-020 and its task file.

- **Reviews:**
  - **Full round** on `c3048ca..f5e55aa`, R1 = `f5e55aa`. The four quotes
    matched for all three. compliance: Wireframes `none`. code-reviewer:
    2 Medium (write/send tested on a fake registry only; the
    `child_process` helper a general launcher), 3 Low; one no-op Bash call
    (`true`), said so. security-reviewer: 3 Low (same two, plus
    `errors[]` without markers, parked). Fixed in `71de5f5`: real-registry
    tests, helper narrowed to `buildCli`/`runBuiltCli` under `os.tmpdir()`
    refusing the key variables, dated note in the runtime RFC (rule 4's
    third, partial exemption), unwritable values → fixed `isError`,
    `SERVER_INFO` test.
  - **Scoped round** on `f5e55aa..71de5f5`. The four quotes matched for all
    three; no Bash calls. List A empty for all three; compliance `none`.
    Lists B parked in `docs/improvements.md`, entry `71de5f5`.

- **Proposed plan changes:** none new. T-041 (`proposed`): OD-4 now
  answered (agent and group yes, product absent), so the next `/decompose`
  can size it. Carried: T-052, T-049 `proposed (2026-11-23)`.

- **Open doubts (owner):**
  - **T-019:** the `child_process` exemption for one test helper (RFC
    note of 2026-11-24); `tools/list` is Method not found until T-020
    registers a tool; `errors[]` reaches the model unwrapped (parked,
    decide at T-020). See the task file.
  - **T-053, T-051:** see HANDOFF at `470124f` and `876ec68`.
  - **Carried**, unchanged: see HANDOFF at `20f4b2f` and `d20c83b`.

- **Dead ends:** none this task. From before: see HANDOFF at `876ec68`.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (Node 22.23.5), from the builder's
  run before `fe79988`:
  - eslint clean, ruff "All checks passed!";
  - prettier "All matched files use Prettier code style!";
  - `tsc --noEmit` clean;
  - vitest "Test Files 18 passed (18)", "Tests 1365 passed (1365)";
  - `tools/checks` "Ran 54 tests", OK;
  - `npm run build` clean;
  - both gitleaks scans passed.
