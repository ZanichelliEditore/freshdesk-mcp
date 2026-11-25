# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-25T14:46:31+01:00`
- **Describes commit:** filled in the stamp commit right after it.
  **CI:** filled in the stamp commit.

- **Current task:** T-062 (the Makefile asks for GNU Make 4 and says how
  to get it) `done (2026-11-25)`. Work `37aa821`, handoff `2ef129d` (CI
  red: the test read files as ASCII under the runner's locale), then the
  CI fix commit this file describes.
  See `docs/tasks/T-062-gnu-make-guard.md` "Done" (the hand demo with
  `/usr/bin/make` 3.81 is quoted there).

- **Next action:** `/pickup` takes T-063 (a search cursor resumes on
  `(created_at, id)`; first `todo` in PLAN order). Then T-040.

- **Read before anything else:** `docs/tasks/T-063-search-cursor-pair.md`.

- **Reviews:** one full round, R1 = `37aa821`, range `de24a88..37aa821`;
  no scoped round (no fix changed a mechanism). All three quoted base,
  HEAD, stat line and trailer correctly, and none used Bash.
  - `code-reviewer`: Medium, the "Done" quote of `/usr/bin/make help` was
    missing (written in the task file at handoff); Low, the empty
    `MAKE_VERSION` choice unrecorded (recorded in "Done"); nit, "guard not
    listed" checked through the fix words (dismissed: it fails if the
    guard ever matches `help`'s regex); nit, `GNUMAKEFLAGS` not removed
    from the test's environment (parked in `docs/improvements.md`,
    `37aa821`).
  - `security-reviewer`: no finding.
  - `compliance-reviewer`: wireframes `none`.
  - The CI fix after R1 (three `encoding="utf-8"` arguments in the
    test file) was not reviewed: no mechanism changed.

- **Proposed plan changes:** none.

- **Open doubts (owner):**
  - T-063 refuses cursors minted before it (search and list) once; the
    planning session decided this under the owner's delegation. Owner may
    overrule before T-063 starts.
  - T-063's acceptance is large; its split point (the smoke probe) is
    likely to be taken.
  - Time triggers on `mcp-test` tickets: the owner checks the activity log
    on 2026-11-26 (T-040 task file, "Owner's evidence (2026-11-25)").
  - T-040's RFC takes up the proposed reading of M2's "automations
    confirmed to skip the tag first"; SPEC §13 unchanged until then.

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on the handoff tree:
  - vitest "Tests 2661 passed (2661)";
  - `tools/checks` "Ran 138 tests", OK (134 + 4 in
    `tools/checks/test_make_version.py`);
  - eslint, ruff, prettier, ruff format, typecheck, build and both gitleaks
    scans passed.
