# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-25T22:43:03+01:00`
- **Describes commit:** `<hash>` (T-064 handoff commit). **CI:** filled
  in by the stamp commit.

- **Current task:** T-064 (the write path holds the one client;
  `context.http` is a GET-only view) `done (2026-11-25)`. Commits
  `4b2a159` (implementation), `087d6ba` (review fixes), then this handoff
  commit. Tests: `test/core/get-view.test.ts`, and
  `test/lint-rules.test.ts` ("lists no src/core path for any place",
  "refuses in %s an import of %s, value or type"). No split was needed.

- **Next action:** `/pickup` T-065 (per-tool allow sets: `ticketInput`
  with a required allow set). It is the first `todo` row whose
  dependency, T-064, is now `done`.

- **Owner actions:**
  - The time-trigger check on `mcp-test` tickets' activity log,
    2026-11-26, then SPEC §13's M2 wording (as written, (a) or (b), RFC
    `2026-11-25-write-safety-core`). T-076 waits on it. No write to the
    real account before then (PLAN M2, owner actions).

- **Read before anything else:** `docs/tasks/T-065-allow-sets.md`, the
  RFC's OD-2 section, and `src/core/write-path.ts`'s header.

- **Reviews:**
  - Full round, R1 = `4b2a159`, range `1cd756b..4b2a159`. Scoped round,
    range `4b2a159..087d6ba`. In both rounds, all three reviewers quoted
    base, HEAD, the stat line and the trailer correctly.
  - `code-reviewer`, R1:
    - Medium: the lint test's regex caught only `write-path` and
      `../core/`. Fixed: each entry is resolved from its place's directory.
    - Low: "one client" is enforced only in `src/tools/`. The overview
      wording is fixed, and the src-wide rule is parked
      (`docs/improvements.md`, `4b2a159` entry, for T-068).
    - Low: `GetRequest` allowed `body`. Fixed: the type omits it and the
      view's copy drops it, with a new test.
    - Low, informational: `paginate` passes the caller's object through.
      No action: the client rebuilds the request with GET.
  - `security-reviewer`, R1:
    - No high or medium findings.
    - Low: no lint rule stops `HttpClient` imports outside `src/tools/`.
      Parked, the same entry as above.
    - Low: a GET can carry a body. Fixed, as above.
    - Note: `SmokeClient` in `scripts/`. Recorded in the parked entry.
  - `compliance-reviewer`: wireframes `none`, in both rounds.
  - Scoped round:
    - No finding falsifies an acceptance line or opens a fail-open path.
    - Four low items on the lint test parked (`087d6ba` entry): a `**`
      glob, relative specifiers in `bare`, `node:` joins, and the
      self-check's scope.
    - No mechanism changed after the scoped round.

- **Proposed plan changes:** none.

- **Open doubts:**
  - Only `src/tools/**` is fenced off from `HttpClient` and
    `src/core/**` by lint. Elsewhere it holds by inspection: today only
    `src/core/write-path.ts` constructs a client. Proposed for T-068
    (parked).
  - From T-040, unchecked: whether `agent-native-setup update` would
    revert the safety-core value in `.claude/commands/decompose.md`
    step 4.
  - `.claude/worktrees/` is not gitignored (parked).

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on the handoff tree. Vitest
  "Tests 2778 passed (2778)"; `tools/checks` "Ran 138 tests", OK; lint,
  format, typecheck, build and both gitleaks scans passed.
