# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-23T12:53:11+01:00`
- **Describes commit:** `<hash>`, pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** `<pending>`. This file's hash
  and CI line arrive in the commit right after it.

- **Current task:** T-013 (total deadline of 30 s on `requestWithRetry`),
  `done (2026-11-23)`. Build in `64f014c`, review fixes in `cf4dd28`.

- **Next action:** `/pickup` takes T-008 (ticket fields, read):
  `docs/tasks/T-008-client-ticket-fields.md`. First, the owner confirms or
  sizes the `proposed` row T-014.

- **Read before anything else:** `docs/tasks/PLAN.md` (rows T-008, T-014);
  the T-008 task file; T-013's "Open doubts"
  (`docs/tasks/T-013-http-total-deadline.md`).

- **Reviews:** full round, range `58b7955..64f014c`, R1 = `64f014c`; all
  four quotes matched for all three.
  code-reviewer: no High; 2 Medium: a write's expiry `retryable: false`
  had no test that could fail (fixed, `cf4dd28`, test on `request`
  directly, mutant killed); a write sent with milliseconds left (owner:
  `proposed` T-014). 5 Low: backoff boundary untested (fixed, mutant
  killed), "is 30 s" test removed, rest parked.
  security-reviewer: no High; 1 Medium, the same late write (T-014). 3 Low:
  a `NaN` deadline on `request` sent a write and called it retryable
  (reproduced red, fixed in `cf4dd28`); token spent on expiry after
  `acquire` and wall clock, parked.
  compliance-reviewer: Wireframes `none`, nothing to check.
  Scoped round, range `64f014c..cf4dd28`, quotes matched for all three.
  code-reviewer: list A empty, 5 parked. security-reviewer: list A empty, 4
  parked. compliance-reviewer: `none`, nothing to check.
  Parked: `docs/improvements.md`, the two T-013 entries stamped `cf4dd28`.
  code-reviewer made one read-only Bash `grep` in the full round (said so).

- **Proposed plan changes:** T-014, "A write is not started without time to
  finish", `proposed (2026-11-23)`, owner's choice in session. Placed
  before T-008 in PLAN, but T-008..T-011 are reads: the owner may order it
  later, before the first write resource.

- **Open doubts:**
  - New, owner to confirm (T-013 builder's choices): the deadline reaches
    `acquire` through an optional second argument of the public `request`;
    a backoff that would cross the deadline is skipped and the last answer
    returned; a caller's bound of exactly 15 s refuses a 15 s wait.
  - New: SPEC §7.1 does not mention the 30 s deadline.
  - New: the 29.9 s and 29.999 s tests rely on the mock answering inside
    one 100 ms `settle` step; 15 runs green, not proven stable.
  - `paginate` has no total budget: each page gets its own 30 s.
  - From T-012: `9fbaa8d` is a mechanism change no reviewer read;
    `SKIP=account-patterns` for contributors without the patterns file,
    owner to confirm; AGENTS.md hard rule 3 does not record that exception;
    a caller in the C locale gets no case folding of accented letters.
  - PLAN's sizing line still counts T-001's split point as pending though
    T-001 is `done`.
  - From T-007: the 10 s timeout lives in `request`; `request` stays public
    and reports a write's 5xx or network failure as retryable, only
    `requestWithRetry` says `retryable: false`; backoff 0.5/1/2 s without
    jitter; only GET is a read; `paginate` gives no sign it stopped at a
    cap; the item cap counts array bodies only; no cap on body size.
  - From T-006: a URL must be on exactly the configured host; a refusal
    before sending is `validation` with `http_status: null`; a non-JSON 2xx
    is `server`; the UA has no version; `TEMPLATE` passes a literal id;
    `test/setup.test.ts:34` carries an `eslint-disable`, owner to accept.
  - From T-005: the 15 s bound, the assumed 60 s window, the default budget
    of 50 and the 1 s..1 h hold clamp are the builder's choices;
    `floor_pct` above `reserve_pct` throws a bare `RangeError`.
  - From T-004: key names and `FRESHDESK_HOST_OVERRIDE` are the builder's
    choice; SPEC §8.1, §10 and §7.1 out of sync; no key for §7.2's budget.
  - Fallback error codes are T-003's choice, not yet the owner's.
  - The test network ban has known holes: parked.
  - `make quality` does not run `make build`; CI does (ran locally on
    `64f014c`: clean).
  - CI gitleaks step not shown to fail on a planted secret (from T-001).
  - Hashes quoted in docs up to `59e3395` predate the history rewrite.
  - Pre-scrub backup bundle (T-001) still holds account values; owner
    deletes it.
  - Two Dependabot branches on the remote, not reviewed.

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `cf4dd28` (Node 22): eslint and
  ruff "All checks passed!"; prettier "All matched files use Prettier code
  style!"; `tsc --noEmit` clean; vitest "Test Files 8 passed (8)", "Tests
  362 passed (362)"; `tools/checks` "Ran 54 tests", OK; both gitleaks scans
  passed. `test/client/http-retry.test.ts` alone: 56 passed, 15 runs in a
  row.
