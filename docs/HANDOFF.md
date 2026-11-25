# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-25T14:39:10+01:00`
- **Describes commit:** filled by the stamp commit right after the handoff
  commit. **CI:** filled there too.

- **Current task:** plan session (`/decompose` scoped to owner rows, by the
  owner's delegation to the orchestrator) `done (2026-11-25)`. T-062:
  `d70d868`, review fixes `d4e95ed`, stamp `06088a6`. T-063 (owner's scope
  addition): `f6d07d3`, then the handoff commit (review fixes). See the
  dated notes above "### Not sized" in `docs/tasks/PLAN.md`.

- **Next action:** `/pickup` takes T-062 (the Makefile asks for GNU Make 4
  and says how to get it; first `todo` in PLAN order). Then T-063, then
  T-040.

- **Read before anything else:** `docs/tasks/T-062-gnu-make-guard.md`.

- **Reviews:** (full rounds; no scoped rounds: the fixes change rows'
  wording only, no mechanism)
  - T-062, R1 = `d70d868`, range `733b02a..d70d868`. All three quoted
    base, HEAD, stat line and trailer correctly. `code-reviewer`: Medium
    (task file closed all of `5005334`) and four lows, all fixed in
    `d4e95ed`. `security-reviewer`: no finding; empty `MAKE_VERSION` info
    left to the builder. `compliance-reviewer`: wireframes `none`.
  - T-063, R1 = `f6d07d3`, range `06088a6..f6d07d3`. All three quoted
    correctly. `code-reviewer`: three mediums (same-second tie-break never
    measured: the probe now asks it; step-back fixture must make id and
    pair disagree; missing `created_at` untested) and lows (overstated
    "created since", old cursors from `mint`, third call has no cursor,
    count named 3, CHANGELOG), all fixed in the acceptance. It ran two
    read-only Bash calls (`echo`, `git grep`) against rule 8.
    `security-reviewer`: two mediums (missing `created_at` fail-open;
    overflow result read as a retry) and two lows (form tag placement and
    forged cursors; probe leak bounds), all fixed in the acceptance.
    `compliance-reviewer`: wireframes `none`.

- **Proposed plan changes:** none.

- **Open doubts (owner):**
  - T-063 refuses cursors minted before it (search and list) once; the
    planning session decided this under the owner's delegation (reading
    them keeps the id-only path). Owner may overrule before T-063 starts.
  - T-063's acceptance is large; its split point (the smoke probe) is
    likely to be taken.
  - Time triggers on `mcp-test` tickets: the owner checks the activity log
    on 2026-11-26 (T-040 task file, "Owner's evidence (2026-11-25)").
  - T-040's RFC takes up the proposed reading of M2's "automations
    confirmed to skip the tag first"; SPEC §13 unchanged until then.
  - Closed (2026-11-25): T-014's limiter-bound doubt (accepted under the
    owner's delegation); direct pushes to `main` by the ruleset's bypass
    list (owner confirmed intended).

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on the handoff tree (docs only):
  - vitest "Tests 2661 passed (2661)";
  - `tools/checks` "Ran 134 tests", OK;
  - eslint, ruff, prettier, ruff format, typecheck, build and both gitleaks
    scans passed.
