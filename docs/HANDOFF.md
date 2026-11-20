# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-20T10:31:41+01:00`
- **Describes commit:** `6531b1f`, local only: no remote yet (T-001).
  **CI:** unobserved (no remote; `quality.yml` has never run). Not pushed:
  nothing to push to. This file arrives in the commit right after
  `6531b1f`.

- **Current task:** `/decompose M0` (plan session), done 2026-11-20. The
  owner approved the 10-row draft; reviews then split old T-008, so M0 is
  T-001..T-011, all `todo (2026-11-20)` in `docs/tasks/PLAN.md`. Commits
  `3ec2fde` (plan), `6850f30` (full-round fixes), `c414802` (scoped-round
  fixes), `6531b1f` (journal).

- **Next action:** `/pickup` takes T-001 (first `todo`, no dependencies):
  `docs/tasks/T-001-connect-remote.md`. Owner decides at pickup: GitHub
  owner and visibility. T-002 (RFC) has no dependencies either and may go
  first if the owner prefers.

- **Read before anything else:** `docs/tasks/PLAN.md`; the task file;
  owner decisions still open from the plan presentation, each recorded in
  its task: `tsconfig` NodeNext + emit (T-003), Node 20+24 CI matrix
  (T-003), whole-stack RFC incl. MCP SDK (T-002, adopted as the plan).

- **Reviews:** two rounds (rule 9). Full round R1 = `3ec2fde`, range
  `1dd03b1..3ec2fde`: code-reviewer 2 High / 6 Medium / 3 Low, all taken
  (T-008 split, `@types/node`, T-001 green-on-HEAD, T-007 write-on-network
  test, etc.); security-reviewer 1 High / 3 Medium / 2 Low taken, 1 Info
  parked; compliance-reviewer "section missing" (red gate: PLAN.md had no
  `## Wireframes`). Scoped round, range `3ec2fde..c414802` (diff files for
  `..6850f30` and `..c414802`): code-reviewer 2 taken (T-001 grep
  fail-open, T-001 circular CI line), rest parked; security-reviewer 3
  taken (same grep fail-open, T-006 https-only, bad domain refused at
  construction), rest parked; compliance-reviewer "section missing" again
  (body was not exactly `none`), fixed, re-dispatched on
  `3ec2fde..c414802`: "No wireframes listed for this task; nothing to
  check." **Deviation:** the diff files showed PLAN.md at HEAD, not at
  base, because base had no Wireframes section; the compliance reviewer
  noted it, verdict unchanged. Scoped fixes tightened acceptance lines
  only plus T-006's https rule; no third round. Parked items:
  `docs/improvements.md` (entries stamped `3ec2fde`, `6850f30`).

- **Proposed plan changes:** none (T-001 confirmed as `todo` under M0).

- **Open doubts:**
  - Repo visibility at T-001 decides its size (split point in the task).
  - Builder's call, owner to confirm: host override is an exact hostname
    in personal env, not team config (T-004, T-006).
  - SPEC still names real account values in history since `4b4dc87`;
    T-001 handles it (history-wide check).

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `6531b1f`'s tree: eslint and
  ruff "All checks passed!"; prettier "All matched files use Prettier code
  style!"; ruff "6 files already formatted"; tsc "no TypeScript yet";
  `tools/checks` "Ran 25 tests", OK; both gitleaks scans passed.
