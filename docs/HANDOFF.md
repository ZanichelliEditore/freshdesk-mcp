# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-23T10:34:51+01:00`
- **Describes commit:** STAMP-PENDING

- **Current task:** T-005 Rate limiter (standalone), `done (2026-11-23)`.
  Code in `aa38280`, `4384a89` and `a46859c`; see
  `docs/tasks/T-005-rate-limiter.md` "Done".

- **Next action:** the owner first rules on the first open doubt below
  (`a46859c` unreviewed). Then `/pickup` takes T-006 (HTTP core):
  `docs/tasks/T-006-http-core.md`. It calls `acquire(cost)` before each
  request and `observe(status, headers)` on each response.

- **Read before anything else:** `docs/tasks/PLAN.md`; the T-006 task
  file; the header comment of `src/client/rate-limit.ts` (lines 1-33);
  T-005's "Open doubts".

- **Reviews:** full round, range `0d3af74..aa38280`, R1 = `aa38280`; all
  four quotes matched for all three.
  code-reviewer: no acceptance line falsified; 4 Medium, 6 Low. Fixed in
  `4384a89`: the 15 s bound was per sleep, not per call; an out-of-order
  200 lifted a 429 hold; the window started by `acquire` was untested; two
  boundary tests passed on a refusal; duplicate header parser; `observe`'s
  return value undocumented; unbounded `Retry-After`; a call went out at
  `Remaining: 0` with a 0 % floor; overview listing. Open doubt: the
  `RangeError` sits outside the config error model.
  security-reviewer: no High; 3 Medium, all fixed in `4384a89` (a 429 with
  `Retry-After: 0` reset the budget to full; a stale 200 lifted the hold;
  an absurd `Retry-After` locked the limiter until restart); 4 Low:
  absurd totals and the unbounded pacing queue fixed, constructor option
  checks and the non-monotonic clock parked.
  compliance-reviewer: Wireframes `none`, nothing to check.
  Scoped round, range `aa38280..4384a89`, quotes matched for all three.
  code-reviewer: list A empty; 9 items parked.
  security-reviewer: one fail-open finding, present at base too (a second
  429 could shorten a hold in force), fixed in `a46859c`; 7 items parked.
  compliance-reviewer: `none`, nothing to check.
  Parked items: `docs/improvements.md`, two entries stamped `a46859c`.
  No third round. code-reviewer shelled out once in the full round (a
  read-only `grep` on `src/config.ts`, which it reported itself); none in
  the scoped round.

- **Proposed plan changes:** T-012 still `proposed (2026-11-20)`, owner to
  confirm. None new.

- **Open doubts:**
  - **`a46859c` was reviewed by no sub-agent**: it is the fix for the
    scoped round's fail-open finding and touches the 429 hold. Rule 9
    stops there; the owner decides whether the hold is settled.
  - New, from T-005 (detail in the task file's "Open doubts"): the 15 s
    bound, the assumed 60 s window (not verified against Freshdesk's
    documentation), the default budget of 50 and the 1 s..1 h hold clamp
    are the builder's choices; below the floor a call is nearly always
    refused, not made to wait; T-007's "retried after the limiter's wait"
    holds only up to 15 s; `floor_pct` above `reserve_pct` throws a bare
    `RangeError` because `src/config.ts` has no cross-field rule.
  - From T-004: the team config's key names and `FRESHDESK_HOST_OVERRIDE`
    are the builder's choice; SPEC §8.1, §10 and §7.1 are out of sync with
    what was built; no key for §7.2's per-call budget; owner to check
    `Prodotto` (SPEC §7.3) against the patterns file.
  - Fallback error codes are T-003's choice, not yet the owner's.
  - The test network ban has known holes: parked.
  - The Claude Code tool shell reported Node `v22.23.5` on 2026-11-23 with
    no PATH prefix; the earlier doubt (22.18.0) no longer reproduces.
  - `make quality` does not run `make build`; CI does.
  - CI gitleaks step not shown to fail on a planted secret (from T-001).
  - Hashes quoted in docs up to `59e3395` predate the history rewrite.
  - Pre-scrub backup bundle (T-001) still holds account values; owner
    deletes it.
  - Two Dependabot branches on the remote (npm, GitHub Actions), not
    reviewed; the npm one was force-updated before 2026-11-23T10:18+01:00.

- **Dead ends:** exporting `parseRetryAfter` from `src/client/errors.ts`
  (reverted in `4384a89`); letting budget headers lift a 429 hold (removed
  in `4384a89`). Detail in the task file.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on the tree of the described commit
  (Node 22.23.5): eslint and ruff "All checks passed!"; prettier "All
  matched files use Prettier code style!"; ruff "6 files already
  formatted"; `tsc --noEmit` clean; vitest "Test Files 5 passed (5)",
  "Tests 203 passed (203)"; `tools/checks` "Ran 25 tests", OK; both gitleaks
  scans passed. `make build` exit 0.
