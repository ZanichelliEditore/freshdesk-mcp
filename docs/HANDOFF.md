# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-23T11:05:04+01:00`
- **Describes commit:** `<hash>`, pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** `<pending>`. This file
  arrives in the commit right after it.

- **Current task:** T-006 HTTP core, `done (2026-11-23)`. Code in
  `ab43199` and `1201868`; see `docs/tasks/T-006-http-core.md` "Done".

- **Next action:** `/pickup` takes T-007 (HTTP retries + pagination):
  `docs/tasks/T-007-http-retries-pagination.md`. It wraps
  `HttpClient.request` (`src/client/http.ts`); a `Link` URL goes in `url`
  with the first request's template as `path`.

- **Read before anything else:** `docs/tasks/PLAN.md`; the T-007 task
  file; the header comment of `src/client/http.ts` (lines 1-20) and the
  docstring of `request`; T-006's "Open doubts"; T-005's "Open doubts"
  (the "For T-007" item).

- **Reviews:** full round, range `9e0c36a..2a0e56c`, R1 = `2a0e56c`; all
  four quotes matched for all three.
  code-reviewer: no acceptance line falsified, no High; 3 Medium, 5 Low.
  Fixed in `1201868`: an empty path parameter addressed the collection; a
  `.`/`..` parameter threw where every other refusal is a result; an
  unserialisable body came back as a retryable `network` error with a log
  line and a token spent; two test gaps (non-JSON error body, unused
  override); `url` doc comment. Recorded as doubts: no `test/fixtures/`,
  no `Agent` built here, the `eslint-disable`. Parked: timeout.
  security-reviewer: no High, no Medium, no fail-open path; 4 Low. Fixed
  in `1201868`: empty path parameter; `path` must have a template's shape
  before it is logged. Parked: no timeout or body cap; two soft spots in
  the test network ban.
  compliance-reviewer: Wireframes `none`, nothing to check.
  Scoped round, range `2a0e56c..1201868`, quotes matched for all three.
  code-reviewer: list A empty; 5 items parked.
  security-reviewer: list A empty; 8 items parked.
  compliance-reviewer: `none`, nothing to check.
  Parked items: `docs/improvements.md`, entries stamped `2a0e56c` and
  `1201868`. No code changed after the scoped round; no third round.
  code-reviewer shelled out once in the full round (a read-only `grep` on
  `SPEC.md`, which it reported itself); none in the scoped round.

- **Proposed plan changes:** T-012 still `proposed (2026-11-20)`, owner to
  confirm. None new.

- **Open doubts:**
  - New, from T-006 (detail in the task file's "Open doubts"): a URL must
    be on exactly the configured host, stricter than the task's "any
    `*.freshdesk.com`"; a refusal before sending is `validation` with
    `http_status: null`; a non-JSON 2xx is `server`, not retryable; the UA
    has no version; `request` throws a `TypeError` on a `path` that is not
    a template; no request timeout and no body cap (decide in T-007);
    `TEMPLATE` still passes a literal id; `test/setup.test.ts:34` carries
    the first `eslint-disable` of an RFC rule 3 lint, owner to accept.
  - From T-005: the 15 s bound, the assumed 60 s window (not verified
    against Freshdesk's documentation), the default budget of 50 and the
    1 s..1 h hold clamp are the builder's choices; below the floor a call
    is nearly always refused, not made to wait; T-007's "retried after the
    limiter's wait" holds only up to 15 s; `floor_pct` above `reserve_pct`
    throws a bare `RangeError` because `src/config.ts` has no cross-field
    rule.
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
    reviewed.
  - CI was not observed for `668172d`, `57a658c` and `9e0c36a` (documents
    only; owner, 2026-11-23: the three commits are valid).

- **Dead ends:** throwing a `TypeError` for a `.`/`..` path parameter
  (`ab43199`, replaced by a `validation` result in `1201868`). Detail in
  the task file.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on the tree of the described commit
  (Node 22.23.5): eslint and ruff "All checks passed!"; prettier "All
  matched files use Prettier code style!"; `tsc --noEmit` clean; vitest
  "Test Files 6 passed (6)", "Tests 276 passed (276)"; `tools/checks` "Ran
  25 tests", OK; both gitleaks scans passed. `make build` exit 0.
