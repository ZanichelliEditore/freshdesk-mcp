# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-25T14:07:49+01:00`
- **Describes commit:** `917a5b4`, pushed to
  `ZanichelliEditore/freshdesk-mcp`: the merge of `origin/main` (owner's
  merge of Dependabot PR #1, `08e739a`, `quality.yml` action bumps, pushed
  during the session) into the handoff commit `a8e2f35`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45620735409
  (workflow `quality`, ran on `917a5b4`: `quality (22.19)`, `quality (24)`,
  `checks` all success). This file's hash and CI line arrive in the commit
  right after it.

- **Current task:** T-049 (maintainer's check of a commit range for
  account values) `done (2026-11-25)`. Commits `5005334` (R1), `ea88db6`
  (review fixes) and the handoff commit. See
  `docs/tasks/T-049-account-patterns-range.md`, "Done".

- **Next action:** `/pickup` takes T-040 (RFC: does the first write tool
  need a safety core; first `todo` in PLAN order, M2 gates; all M1 rows
  are `done`).

- **Read before anything else:** `docs/tasks/T-040-rfc-write-safety.md`.

- **Reviews:**
  - Full round, R1 = `5005334`, range `a98e51e..5005334`, diff file in the
    handoff format; quotes (base, HEAD, stat line, trailer) checked for all
    three.
    - `code-reviewer`: checkout guard sound (the `rev-list --count`
      comparison is exact; the planned `merge-base` check could fail open
      with several merge bases), not overbuilt. Medium: CONTRIBUTING's
      fetch could leave a stale `pr-<n>` and still run (fixed: `+`, `&&`);
      Medium: tree scan not proven in both locales (fixed: 4 tests,
      mutation-checked). Lows: local squash/rebase unseen (documented),
      separate dash/empty refusal (fixed), stale docstring (fixed), two
      untested error branches (parked).
    - `security-reviewer`: guard sound, fail-closed. Medium: a tree match
      printed a path that can hold the value (fixed: name withheld when
      the commit's paths match; control characters escaped). Lows: symlink
      targets and other commit headers unscanned (documented), stale ref
      (fixed). Probe: make 3.81 (pre-existing parse failure, parked).
    - `compliance-reviewer`: wireframes `none`, complete.
  - Scoped round on `5005334..ea88db6` (the fixes changed output):
    code-reviewer and security-reviewer found nothing that falsifies
    acceptance or fails open; 4 items parked in `docs/improvements.md`
    ("T-049 scoped review"); compliance-reviewer: `none`, complete. No
    third round needed.

- **Proposed plan changes:** none.

- **Open doubts (owner):**
  - The repo assumes GNU Make 4.x: macOS `/usr/bin/make` 3.81 fails to
    parse the Makefile (pre-existing; parked).
  - Owner facts recorded 2026-11-25: step 6 of RFC 2026-11-25 (npm
    Publishing access "Require two-factor authentication and disallow
    tokens") is done (PLAN, "Not sized"); Dependabot PR #3 is closed,
    nothing left there.

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `ea88db6`'s tree (docs only
  since):
  - vitest "Tests 2648 passed (2648)";
  - `tools/checks` "Ran 134 tests", OK (97 before; +37 in
    `test_account_patterns.py`);
  - eslint, ruff, prettier, ruff format, typecheck, build and both gitleaks
    scans passed.
