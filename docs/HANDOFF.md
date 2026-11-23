# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-23T09:58:23+01:00`
- **Describes commit:** `e313e4f`, pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45143031498
  (ran on `e313e4f`: `quality (22.19)`, `quality (24)`, `checks`). This
  file arrives in the commit right after it.

- **Current task:** T-003 TypeScript toolchain + client error model,
  `done (2026-11-23)`. Code in `68acf47` and `347b52d`; see
  `docs/tasks/T-003-ts-toolchain-errors.md` "Done".

- **Next action:** `/pickup` takes T-004 (config: env + team config, zod):
  `docs/tasks/T-004-config.md`. It installs `zod ^4.2`: the commit hook
  will ask for an RFC; the answer is the trailer `RFC-Not-Needed:` naming
  `docs/rfc/active/2026-11-23-adopt-runtime-stack.md`.

- **Read before anything else:** `docs/tasks/PLAN.md`; the T-004 task
  file; `test/support/env.ts` and `vitest.config.ts` (every `FRESHDESK_*`
  variable is a dummy inside tests: T-004 tests pass their own env object
  and load the team config from a fixture path only).

- **Reviews:** full round, range `099a960..68acf47`, R1 = `68acf47`; all
  four quotes matched for all three.
  code-reviewer: 3 Medium (canary green with the setup file unwired;
  `networkError` lost undici's `cause` code; nothing proved the lint bans
  fire), 5 Low: all fixed in `347b52d`, except the note that the fallback
  is a choice (now an open doubt). It made one no-op Bash call (`true`)
  against its brief.
  security-reviewer: no High or Medium; Low: `errors[]` uncapped and the
  header overclaiming (fixed), ban missing `http2`/`dgram`/`dns`/
  `child_process`/global `fetch` in tests (fixed), env scrub does not
  cover config-time code (parked).
  compliance-reviewer: Wireframes `none`, nothing to check.
  Scoped round, range `68acf47..347b52d`, quotes matched for all three:
  code-reviewer and security-reviewer found nothing that falsifies the
  acceptance or opens a fail-open path; their lists are parked in
  `docs/improvements.md` (two entries stamped `347b52d`).
  compliance-reviewer: `none`, nothing to check. No third round.

- **Proposed plan changes:** T-012 still `proposed (2026-11-20)`, owner to
  confirm. None new.

- **Open doubts:**
  - Fallback codes are T-003's choice, not yet the owner's: other 4xx →
    `validation` (covers 408, 409), 3xx → `server`, both not retryable.
  - The test network ban has known holes (dynamic `import()`,
    `createRequire`, aliased `globalThis`, `WebSocket`): parked. T-006's
    global `MockAgent` is the backstop for undici only.
  - The Claude Code tool shell still runs Node 22.18.0, below the floor;
    this session prefixed PATH with nvm's `v22.23.5`.
  - `make quality` does not run `make build`; CI does.
  - CI gitleaks step not shown to fail on a planted secret (from T-001).
  - Hashes quoted in docs up to `59e3395` predate the history rewrite.
  - Pre-scrub backup bundle (T-001) still holds account values; owner
    deletes it.
  - Host override exact hostname in personal env (T-004, T-006).

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on the tree of the described commit
  (Node 22.23.5): eslint and ruff "All checks passed!"; prettier "All
  matched files use Prettier code style!"; ruff "6 files already
  formatted"; `tsc --noEmit` clean; vitest "Test Files 3 passed (3)",
  "Tests 70 passed (70)"; `tools/checks` "Ran 25 tests", OK; both gitleaks
  scans passed.
