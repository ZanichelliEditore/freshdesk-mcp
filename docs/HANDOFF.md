# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-25T10:26:01+01:00`
- **Describes commit:** filled by the stamp commit. **CI:** filled by the
  stamp commit.

- **Current task:** T-057 `done (2026-11-25)`, `export_tickets` pages
  (`max_tickets`, cursor, one file per call),
  `docs/tasks/T-057-export-pages.md` ("Done"). Commits `69d7fc8`
  (status), `c9f2b3d` (build), `97709eb` (full-round fixes: search cursor
  by lowest id written, no cursor without progress, search budget check),
  `ba6ea89` (scoped list A fixes: budget and time checks on step-back
  pages; id order checked fail-closed), `fdc1057` (done). Built by a
  builder agent under the orchestrator.
  - **Measured (orchestrator, real account, GET, 2026-11-25):** search
    results come back in the same order on repeated calls, sorted by
    `created_at` and `id` both descending, not by `updated_at` (raw in the
    gitignored `docs/private/account-facts.md`). Which key is primary is
    not told apart; a resumed call refuses when ids do not fall strictly.
  - **Acceptance amended (orchestrator, 2026-11-25):** a call cut before
    it wrote any row returns `truncated: true` without `next_cursor`
    (loop safety).

- **Next action:** the owner (rule 9, below), then the first release.
  - **The owner:** the scoped round's list A fixes (`ba6ea89`) changed a
    mechanism again (step-back budget check, id-order check); by rule 9
    they are not reviewed a third time. Accept, or ask for a review.
  - **The owner:** list-scan same-second tie exception (past 300
    matches): keep as documented, or fix at one `GET /tickets/{id}` per
    resumed call.
  - **The owner:** release steps of RFC 2026-11-25 (HANDOFF at
    `c6dba4b`); the orchestrator can do steps 1–2 with `gh` if the owner's
    account is a repository admin and the owner says go.
  - Then `/pickup`: **T-058** (solution tree by category).

- **Read before anything else:** T-057's task file "Open doubts"; PLAN row
  T-058.

- **Reviews:**
  - **Full round** on `57ebfdc..c9f2b3d`, R1 = `c9f2b3d`. The four quotes
    matched for all three. compliance: Wireframes `none`. security: 1 Low
    (search path read past the estimate with `max_tickets`), 1 info.
    code-reviewer: 1 High (search offset cursor: a ticket created between
    calls shifted offsets, written twice or missed), 1 Medium (a cut with
    no progress returned the same cursor), 3 Low. Fixed in `97709eb`.
  - **Scoped round** on `c9f2b3d..97709eb`. The four quotes matched for
    all three. compliance `none`. List A: security A1 (step-back pages
    before any budget check), code A1 (id-only boundary assumes id order
    = `created_at` order). Fixed in `ba6ea89`, not reviewed again (rule
    9). Lists B parked, entries `c9f2b3d`, `97709eb`.

- **Proposed plan changes:** none new.

- **Open doubts (owner):** see "Next action"; T-057 task file; earlier:
  HANDOFF at `c6dba4b`, `d1c7efe`, `fe81a3c`.

- **Dead ends:** see T-057's task file (a fake `Date` clock hung the
  limiter's pacing; the search offset as a position).

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (local Node v26.13.1), run by the
  orchestrator on `fdc1057`:
  - vitest "Test Files 39 passed (39)", "Tests 2565 passed (2565)";
  - `tools/checks` "Ran 87 tests", OK;
  - lint, format, typecheck, build and both gitleaks scans passed.
