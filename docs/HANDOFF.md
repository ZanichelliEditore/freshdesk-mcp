# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-23T12:29:17+01:00`
- **Describes commit:** `dce5d64`, pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45165983442
  (ran on `dce5d64`: `quality (22.19)`, `quality (24)`, `checks`). This
  file's hash and CI line arrive in the commit right after it.

- **Current task:** T-012 (account-patterns commit hook), `done
  (2026-11-23)`. Build in `054da94`, full-round fixes in `f79ffd2`,
  scoped-round fix and the owner's both-locales choice in `9fbaa8d`.

- **Next action:** `/pickup` takes T-013 (total deadline of 30 s on
  `requestWithRetry`): `docs/tasks/T-013-http-total-deadline.md`. Then
  T-008.

- **Read before anything else:** `docs/tasks/PLAN.md` (rows T-013, T-008);
  the T-013 task file; `docs/improvements.md`, the T-013 half of the entry
  stamped `f9927d8`.

- **Reviews:** full round, range `bba4374..054da94`, R1 = `054da94`; all
  four quotes matched for all three.
  code-reviewer: no High; 4 Medium, 3 Low; one acceptance clause unmet in
  the range (the positive control, done since: "Checkpoint").
  security-reviewer: no High; 2 Medium fail-open, both reproduced: a forced
  `LC_ALL=C` did not fold an accented letter's case; git grep's exit 1
  after an unreadable blob passed. 5 Low.
  compliance-reviewer: Wireframes `none`, nothing to check.
  Fixed in `f79ffd2`: locale left to the caller, binary files named from a
  `-l` run, exit 1 with stderr is exit 2, a patterns file with a `#` line,
  surrounding whitespace or a byte-order mark refused naming its line,
  `--no-column`, the missing-file message no longer says to create the
  file, tests tightened.
  Scoped round, range `054da94..f79ffd2`, quotes matched for all three.
  code-reviewer: list A, 2: a stray carriage return passed the validator
  (fixed, `9fbaa8d`); the acceptance said "1 passes" unconditionally
  (amended by the owner). 10 parked.
  security-reviewer: list A, 2: the same carriage return; under a UTF-8
  locale `.` does not match a byte that is not valid UTF-8 (reproduced). 8
  parked.
  compliance-reviewer: `none`, nothing to check.
  **Stopped and reported to the owner (rule 9).** The owner chose: run the
  matcher in the caller's locale and in C, refuse on either (`9fbaa8d`).
  **No reviewer read `9fbaa8d`**: no third round.
  Parked: `docs/improvements.md`, the entry stamped `9fbaa8d`.
  No reviewer shelled out.

- **Proposed plan changes:** none. Done in session with the owner's word,
  2026-11-23: T-012's acceptance amended in PLAN and in the task file (both
  locales; an exit 1 with stderr is not a pass); note above PLAN's table.

- **Open doubts:**
  - New: `9fbaa8d` is a mechanism change no reviewer read.
  - New, owner to confirm: contributors without the patterns file use
    `SKIP=account-patterns` (`CONTRIBUTING.md`). The owner's answer was
    conditional on what the patterns file holds; the builder read it as
    "not only custom fields, so `SKIP=`".
  - New, owner to decide: AGENTS.md hard rule 3 does not record that
    `SKIP=` exception.
  - Closed by the owner, 2026-11-23: the field name that stood at
    `examples/team-config.example.json:10` before `054da94` is real, of
    low sensitivity; it stays in pushed history, no rewrite. This closes
    T-004's "owner to check the product field against the patterns file".
  - New: a caller whose own locale is C gets no case folding of accented
    letters (script header).
  - T-013 leaves `paginate` without a total budget: each page gets its own
    30 s.
  - PLAN's sizing line still counts T-001's split point as pending though
    T-001 is `done`.
  - Decided by the owner, 2026-11-23, closed: one `requestWithRetry` gets
    a total deadline of 30 s (T-013); a 429 without `Retry-After`, or with
    one above 15 s, is refused with `retry_after_s`, not retried. T-012's
    and T-013's acceptance as changed by the plan review: accepted by the
    owner on 2026-11-23.
  - From T-007, builder's choices: the 10 s timeout lives in `request`;
    `request` stays public and still reports a write's failure as
    retryable, only `requestWithRetry` says `retryable: false`; backoff
    0.5/1/2 s without jitter, slept in `http.ts`; only GET is a read;
    `paginate` gives no sign it stopped at a cap with more to fetch; the
    item cap counts array bodies only; no cap on a response body's size.
  - From T-006: a URL must be on exactly the configured host, stricter
    than "any `*.freshdesk.com`"; a refusal before sending is `validation`
    with `http_status: null`; a non-JSON 2xx is `server`, not retryable;
    the UA has no version; `request` throws a `TypeError` on a `path` that
    is not a template; `TEMPLATE` still passes a literal id;
    `test/setup.test.ts:34` carries the first `eslint-disable` of an RFC
    rule 3 lint, owner to accept.
  - From T-005: the 15 s bound, the assumed 60 s window (not verified
    against Freshdesk's documentation), the default budget of 50 and the
    1 s..1 h hold clamp are the builder's choices; below the floor a call
    is nearly always refused, not made to wait; `floor_pct` above
    `reserve_pct` throws a bare `RangeError` because `src/config.ts` has no
    cross-field rule.
  - From T-004: the team config's key names and `FRESHDESK_HOST_OVERRIDE`
    are the builder's choice; SPEC §8.1, §10 and §7.1 are out of sync with
    what was built; no key for §7.2's per-call budget.
  - Fallback error codes are T-003's choice, not yet the owner's.
  - The test network ban has known holes: parked.
  - `make quality` does not run `make build`; CI does.
  - CI gitleaks step not shown to fail on a planted secret (from T-001).
  - Hashes quoted in docs up to `59e3395` predate the history rewrite.
  - Pre-scrub backup bundle (T-001) still holds account values; owner
    deletes it.
  - Two Dependabot branches on the remote (npm, GitHub Actions), not
    reviewed.

- **Dead ends:** forcing `LC_ALL=C` on the matcher; the caller's locale
  alone. Each misses a case: task file, "Dead ends".

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on the tree of the described commit
  (Node 22.23.5): eslint and ruff "All checks passed!"; prettier "All
  matched files use Prettier code style!"; `tsc --noEmit` clean; vitest
  "Test Files 8 passed (8)", "Tests 331 passed (331)"; `tools/checks` "Ran
  54 tests", OK; both gitleaks scans passed. The installed hook passes on
  the real index with the real patterns file.
  Positive control, 2026-11-23: a clone of `9fbaa8d` with `pre-commit
  install`, a synthetic patterns file and a staged synthetic match (the
  clone's other hooks skipped with `SKIP=`, the scratch clone only).
  `git commit` exit 1, and the hook printed:
  `account values in the index...Failed`, `- hook id: account-patterns`,
  `- exit code: 1`, `account-patterns: staged content matches an
  account-value pattern:`, `  note.txt:2`, then the `Fix:` line. Neither
  the pattern nor the matched text appeared.
