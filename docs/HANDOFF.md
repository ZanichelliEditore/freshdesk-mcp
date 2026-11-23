# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-23T11:27:17+01:00`
- **Describes commit:** `STAMP_HASH`, pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** STAMP_CI. This file arrives in
  the commit right after it.

- **Current task:** T-007 HTTP retries + pagination, `done (2026-11-23)`.
  Code in `f8f5d80` and `6d4013a`; see
  `docs/tasks/T-007-http-retries-pagination.md` "Done".

- **Next action:** `/pickup` takes T-008 (client resource: ticket fields):
  `docs/tasks/T-008-client-ticket-fields.md`. It calls
  `HttpClient.requestWithRetry` or `HttpClient.paginate`
  (`src/client/http.ts`), never `request`. **Before it starts, the owner
  answers the two "Owner to decide" doubts below.**

- **Read before anything else:** `docs/tasks/PLAN.md`; the T-008 task file;
  the header comment of `src/client/http.ts` (lines 1-35) and the doc
  comments of `requestWithRetry` and `paginate`; T-007's "Open doubts".

- **Reviews:** full round, range `f733ac1..f8f5d80`, R1 = `f8f5d80`; all
  four quotes matched for all three.
  code-reviewer: every acceptance line met (by reading; `make quality` is
  the main session's), no High; 3 Medium, 7 Low. Fixed in `6d4013a`: no
  test had a write fail after its first 429; a test that could not fail
  (pre-send refusal); the backoff test checked only the total; item caps
  of zero, below zero and NaN; GET-only held by type alone; the limiter's
  "never sleeps" comment. To the owner as doubts: no total deadline; the
  "bounded default" of "In scope" not built. Parked: `Link` regex needs
  `rel` first, duplicated test helper, SPEC out of sync.
  security-reviewer: no High; 1 Medium, 6 Low. Fixed in `6d4013a`: a write
  that timed out or got a 5xx came back `retryable: true` (Medium);
  `paginate`'s method not pinned at runtime, the one fail-open path, narrow;
  caps not validated. Parked: regex quadratic but bounded, regex looser and
  stricter than RFC 8288, a `Link` to another path on the host, worst-case
  duration.
  compliance-reviewer: Wireframes `none`, nothing to check.
  Scoped round, range `f8f5d80..6d4013a`, quotes matched for all three.
  code-reviewer: list A empty, no regression; 9 items parked.
  security-reviewer: list A empty; 5 items parked.
  compliance-reviewer: `none`, nothing to check.
  Parked items: `docs/improvements.md`, the two entries stamped `6d4013a`.
  No code changed after the scoped round; no third round.
  code-reviewer shelled out once in the scoped round (a read-only `git
  grep`, which it reported itself); none in the full round.

- **Proposed plan changes:** T-012 still `proposed (2026-11-20)`, owner to
  confirm. None new. PLAN's sizing line still counts T-007's split point as
  pending: it was not needed (`/decompose` owns that line).

- **Open doubts:**
  - **Owner to decide** (detail in T-007's "Open doubts"): (1) one
    `requestWithRetry` has no total deadline, about 103 s at worst, 43.5 s
    for a GET nobody answers; (2) a 429 without `Retry-After`, or with one
    above 15 s, is not retried but refused with `retry_after_s`, where the
    task asked for a bounded default wait.
  - New, from T-007, builder's choices: the 10 s timeout lives in
    `request`; `request` stays public and still reports a write's failure
    as retryable, only `requestWithRetry` says `retryable: false`; backoff
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
    what was built; no key for §7.2's per-call budget; owner to check
    `Prodotto` (SPEC §7.3) against the patterns file.
  - Fallback error codes are T-003's choice, not yet the owner's.
  - The test network ban has known holes: parked.
  - `make quality` does not run `make build`; CI does.
  - CI gitleaks step not shown to fail on a planted secret (from T-001).
  - Hashes quoted in docs up to `59e3395` predate the history rewrite.
  - Pre-scrub backup bundle (T-001) still holds account values; owner
    deletes it.
  - Two Dependabot branches on the remote (npm, GitHub Actions), not
    reviewed; the npm one was force-updated before 2026-11-23T11:13.

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on the tree of the described commit
  (Node 22.23.5): eslint and ruff "All checks passed!"; prettier "All
  matched files use Prettier code style!"; `tsc --noEmit` clean; vitest
  "Test Files 8 passed (8)", "Tests 331 passed (331)"; `tools/checks` "Ran
  25 tests", OK; both gitleaks scans passed. `make build` exit 0.
