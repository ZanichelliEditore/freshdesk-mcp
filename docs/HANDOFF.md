# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-23T12:04:39+01:00`
- **Describes commit:** `a84b4ba`, pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45161997156
  (ran on `a84b4ba`: `quality (22.19)`, `quality (24)`, `checks`). This
  file's hash and CI line arrive in the commit right after it.

- **Current task:** `/decompose` of the two `proposed` rows, a plan session,
  documents only: T-012 and T-013 are `todo (2026-11-23)`, each with a task
  file, placed before T-008. Plan in `730ebf3`, review fixes in `f9927d8`
  and `a84b4ba`. Approved by the owner on 2026-11-23 as
  presented after the planner's pass; the review fixes came after that
  approval and are the owner's to read (see "Open doubts").

- **Next action:** `/pickup` takes T-012 (account-patterns commit hook):
  `docs/tasks/T-012-account-patterns-hook.md`. Before any code, ask the
  owner the question under "Owner decides before the build" there. Then
  T-013, then T-008.

- **Read before anything else:** `docs/tasks/PLAN.md` (the re-plan note of
  2026-11-23 and rows T-012, T-013, T-008); the T-012 task file;
  `.pre-commit-config.yaml` (the `rfc-status` local hook as the model);
  `docs/improvements.md`, the entry stamped `f9927d8`.

- **Reviews:** full round, range `79014a3..730ebf3`, R1 = `730ebf3`; all
  four quotes matched for all three.
  code-reviewer: no finding falsified an acceptance line; no High; 4
  Medium, 6 Low. security-reviewer: no High; 3 Medium, 3 Low; one fail-open
  path in T-012 as specified (matcher and content source left open).
  Fixed in `f9927d8`: T-012 names `git grep --cached` and its exits, no
  pattern in any output (measured: git 2.53.0 exits 128 and prints the
  pattern on an invalid regex), tests for index-only and binary content,
  known limits listed, no placeholder file in `CONTRIBUTING.md`; T-013
  says the limiter's refusal wins at the deadline, a caller's bound only
  shortens `acquire`, time left computed after `acquire`; T-008 depends on
  T-012; T-013's split point counted. Dismissed, measured: an interior
  blank line in the patterns file does not match everything; a CRLF
  patterns file still matches.
  compliance-reviewer: Wireframes `none`, nothing to check.
  Scoped round, range `730ebf3..f9927d8`, quotes matched for all three.
  code-reviewer: list A, one item: the mandated command lacked `-n`, so it
  could not name `file:line` and would print the matched text; fixed in
  the described commit (a flag in the wording, not a mechanism change, so
  no third round; builder's judgement, said to the owner). 7 items parked.
  security-reviewer: list A empty; 9 items parked.
  compliance-reviewer: `none`, nothing to check.
  Parked: `docs/improvements.md`, the entry stamped `f9927d8`.
  No reviewer shelled out.

- **Proposed plan changes:** none. T-012 and T-013 are no longer
  `proposed`.

- **Open doubts:**
  - New, owner to decide before T-012's build: what a contributor without
    the account values does. The repo is public, the hook refuses every
    commit without the patterns file, and a placeholder file is a bypass
    in effect.
  - New, owner to read: the acceptance of T-012 and T-013 changed after
    the approval, by the review fixes (`git diff 730ebf3..HEAD --
    docs/tasks`). T-013's plan-time choices (1 to 5 as presented) stand;
    one was sharpened: a limiter wait ending at or after the deadline is
    refused as `rate_limited`, so a write held by a 429 never gets the
    `network` expiry error.
  - New: T-013 leaves `paginate` without a total budget: each page gets
    its own 30 s.
  - New: PLAN's sizing line still counts T-001's split point as pending
    though T-001 is `done`; whether it was taken is not recorded.
  - Decided by the owner, 2026-11-23, closed: one `requestWithRetry` gets
    a total deadline of 30 s (T-013); a 429 without `Retry-After`, or with
    one above 15 s, is refused with `retry_after_s`, not retried.
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

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on the tree of the described commit
  (Node 22.23.5): eslint and ruff "All checks passed!"; prettier "All
  matched files use Prettier code style!"; `tsc --noEmit` clean; vitest
  "Test Files 8 passed (8)", "Tests 331 passed (331)"; `tools/checks` "Ran
  25 tests", OK; both gitleaks scans passed. `make build` exit 0. No code
  changed in this session.
