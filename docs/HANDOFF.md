# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-24T16:45:35+01:00`
- **Describes commit:** `f1dde79`
  (`f1dde79ade9e0354853c61e8b638712406336e49`), pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45429412843
  (workflow `quality`, ran on `f1dde79`; observed through the public API).
  This file's hash and CI line arrive in the commit right after it.

- **Current task:** T-037 `done (2026-11-24)`, `export_tickets`,
  `docs/tasks/T-037-export-tickets.md` ("Done", "Security review").
  Commits `a37a289` (status), `a62188a` (JSONL, file rules, budget),
  `7afc903` (CSV, conversations), `45b21c1` (full-round fixes: resolved
  directory, directory identity checks, deadline cut, planted-file tests),
  `60c475e` (lists B parked, done). The project's first file write:
  `FRESHDESK_EXPORT_DIR` (personal env); `export_dir` refused in the team
  file. Built by a builder agent under the orchestrator (owner's
  instruction of 2026-11-23).

- **Next action:** `/pickup`. By PLAN's rule it takes **T-038** (package
  runnable with `npx`, README).
  - **Fact for T-038 (scope ownership):** on 2026-11-24 the project owner
    confirmed that the organisation owns the `@zanichelli` npm scope.
    `package.json` keeps `private: true` (T-045 removes it).
  - **The owner:** local `node` is v26.13.1 (HANDOFF at `c7e4b3c`);
    Dependabot PRs (T-044 "Done").

- **Read before anything else:** PLAN row T-038 and its task file; the
  T-037 task file's Open doubts (the README must say the export file holds
  customer text unwrapped).

- **Reviews:**
  - **Full round** on `d46df76..7afc903`, R1 = `7afc903`. The four quotes
    matched for all three. compliance: Wireframes `none`.
    security-reviewer: 1 Medium (a trailing `/` on a symlinked export
    directory passed the check), 2 Low, 3 info. code-reviewer: 3 Medium
    (the same; no test could fail on `link`→`rename` or dropped `O_EXCL`;
    a deadline abort lost the whole export), 5 Low. `/security-review`
    (owner-mandated, OD-5): no finding at confidence ≥ 8. Fixed, parked or
    dismissed in `45b21c1` (task file "Security review").
  - **Scoped round** on `7afc903..45b21c1`. The four quotes matched for
    all three; list A empty for all three. Lists B (5 security, 7 code,
    two shared) parked in `docs/improvements.md`, entry `45b21c1`. The
    orchestrator re-ran `make quality` on `60c475e` (exit 0).

- **Proposed plan changes:** none new. Still `proposed`: T-041 (can be
  sized), T-052, T-049.

- **Open doubts (owner):**
  - **T-037, needs your decision:** one call exports about 4,000 tickets,
    or about 40 with their threads (the 30 s call deadline, default
    pacing). SPEC §7.2's example (2,000 tickets with conversations) cannot
    run in one call. Other doubts (no hard links on FAT/exFAT, no CSV BOM
    for Excel) are in the task file.
  - **T-036:** see its task file's Open doubts.
  - **Earlier, still open for you:** `uncategorised_fields` any-empty rule
    (T-022, HANDOFF at `fe4c24c`); `find_similar_tickets` shows other
    customers' tickets (T-030, HANDOFF at `cae6a52`); the orchestrator's
    acceptance amendments (T-021, T-026, T-027, T-043; PLAN re-plan notes);
    `updated_at`'s day rule not measured (T-055, HANDOFF at `41de8bc`).
  - **Other tasks:** see HANDOFF at `41de8bc`.

- **Dead ends:** see the T-037 task file ("Dead ends": a timing assertion
  on the export deadline test; no test can catch dropping `O_NOFOLLOW`
  alone).

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (local Node v26.13.1), run by the
  orchestrator on `60c475e`:
  - vitest "Test Files 38 passed (38)", "Tests 2486 passed (2486)";
  - `tools/checks` "Ran 54 tests", OK;
  - lint, format, typecheck, build and both gitleaks scans passed.
