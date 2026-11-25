# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-25T15:53:26+01:00`
- **Describes commit:** `52e275b`, pushed to
  `ZanichelliEditore/freshdesk-mcp` (the T-063 handoff commit). **CI:**
  green, https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45639319386
  (workflow `quality`, ran on `52e275b`: `quality (22.19)`, `quality (24)`,
  `checks` all success).

- **Current task:** T-063 (a search cursor resumes on `(created_at, id)`)
  `done (2026-11-25)`. Work `a9fb027`, review fixes `9db6435`, then the
  handoff commit. Split point not taken: the fix and the smoke probe both
  shipped. See `docs/tasks/T-063-search-cursor-pair.md` "Done".

- **Next action:** `/pickup` takes T-040 (RFC: does the first write tool
  need a safety core; first `todo` in PLAN order).

- **Read before anything else:** `docs/tasks/T-040-rfc-write-safety.md`.

- **Reviews:** full round R1 = `a9fb027`, range `691ab1f..a9fb027`; scoped
  round range `a9fb027..9db6435`. All six dispatches quoted base, HEAD,
  stat line and trailer correctly; none used Bash.
  - R1 `code-reviewer`: no blocking finding; four Low, all fixed in
    `9db6435` (an untagged new-form search cursor test; a largest-id
    resume test; the out-of-search throw asserts the internal-error text;
    "tie-break measured" wording corrected in count-tickets.ts,
    export-tickets.ts and overview.md). Note "task file not in range":
    filled at this handoff.
  - R1 `security-reviewer`: Low, `make smoke-order-probe DAY=--core` ran
    `runCore` (fixed in `9db6435`: the mode is read from flags only; hand
    demo in the task file); info, the day's exact count is printed
    (dismissed: a count, the acceptance asks for it).
  - R1 `compliance-reviewer`: wireframes `none`.
  - Scoped: `code-reviewer` and `security-reviewer` no finding that
    falsifies an acceptance line or opens a fail-open path; three items
    parked in `docs/improvements.md` (`9db6435` entry);
    `compliance-reviewer` wireframes `none`. No third round.

- **Proposed plan changes:** none.

- **Open doubts (owner):**
  - Owner action: run `make smoke-order-probe` (yesterday UTC) or
    `make smoke-order-probe DAY=YYYY-MM-DD` on a busy weekday. The answer
    is the line `probe search_order <day>: ... within a shared created_at
    second, ids fall: yes|no` and the last
    `... search's order is created_at, then id, both descending: yes|no`.
    `no` means resumed reads on such days are refused (fail closed) and a
    follow-up row is needed; keep the output in
    `docs/private/account-facts.md`.
  - `CHANGELOG.md` has an "Unreleased" section (old cursors refused once):
    the owner decides when to release.
  - Time triggers on `mcp-test` tickets: the owner checks the activity log
    on 2026-11-26 (T-040 task file, "Owner's evidence (2026-11-25)").
  - T-040's RFC takes up the proposed reading of M2's "automations
    confirmed to skip the tag first"; SPEC §13 unchanged until then.

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `9db6435`:
  - vitest "Tests 2691 passed (2691)";
  - `tools/checks` "Ran 138 tests", OK;
  - eslint, ruff, prettier, ruff format, typecheck, build and both gitleaks
    scans passed.
