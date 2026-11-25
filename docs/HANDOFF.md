# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-25T14:20:51+01:00`
- **Describes commit:** filled by the stamp commit that follows.

- **Current task:** T-014 (a write is not started without time to finish)
  `done (2026-11-25)`. Commits `6e7674f` (R1) and `5a5274d` (review
  fixes), then the handoff commit. See
  `docs/tasks/T-014-write-min-time.md`, "Done".

- **Next action:** `/pickup` takes T-040 (RFC: does the first write tool
  need a safety core; first `todo` in PLAN order). It waits on the owner's
  input about Freshdesk automations.

- **Read before anything else:** `docs/tasks/T-040-rfc-write-safety.md`.

- **Reviews:**
  - Full round, R1 = `6e7674f`, range `b7d7e59..6e7674f`, diff file in the
    handoff format. All three quoted base, HEAD, the stat line and the
    trailer correctly.
    - `code-reviewer`: every acceptance line met, no correctness or
      fail-open issue. Three lows, all fixed in `5a5274d`: a bait
      interceptor no test reaches (kept one, commented), a test name not
      true for writes (renamed), "10 s" hardcoded in the message (now
      built from `REQUEST_TIMEOUT_MS`, same text).
    - `security-reviewer`: no findings. No write can be sent twice or
      applied while reported as not sent; NaN/Infinity deadlines fail
      closed. Two infos parked in `docs/improvements.md` (`6e7674f`):
      `request` is public and keeps `retryable: true` on a write's own
      timeout (pre-existing; write resources must call
      `requestWithRetry`), and the refusal shares its shape with a
      limiter refusal.
    - `compliance-reviewer`: wireframes `none`, complete.
  - No scoped round: the fixes change no mechanism (test names, a comment,
    a message with the same text).

- **Proposed plan changes:** none.

- **Open doubts (owner):**
  - A write's limiter bound (`deadline - REQUEST_TIMEOUT_MS + 1`) goes
    beyond the task's "checked before and after `acquire`": a hold that
    would leave under 10 s is refused at once with `retry_after_s`, not
    slept through with a token spent. Owner may judge it (T-014 task file,
    "Open doubts").
  - The repo assumes GNU Make 4.x: macOS `/usr/bin/make` 3.81 fails to
    parse the Makefile (pre-existing; parked).

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `5a5274d`'s tree (docs only
  since):
  - vitest "Tests 2661 passed (2661)" (2648 before);
  - `tools/checks` "Ran 134 tests", OK;
  - eslint, ruff, prettier, ruff format, typecheck, build and both gitleaks
    scans passed.
