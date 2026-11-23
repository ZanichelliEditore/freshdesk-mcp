# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-23T13:06:28+01:00`
- **Describes commit:** `<hash>`, pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** `<pending>`. This file's hash
  and CI line arrive in the commit right after it.

- **Current task:** T-008 (ticket fields, read), `done (2026-11-23)`. Build
  in `58cbde7`, review fixes in `434c9f9`.

- **Next action:** `/pickup` takes T-009 (agents and groups, read):
  `docs/tasks/T-009-client-agents-groups.md`.

- **Read before anything else:** `docs/tasks/PLAN.md` (rows T-009, T-014);
  the T-009 task file; T-008's "Open doubts"
  (`docs/tasks/T-008-client-ticket-fields.md`).

- **Reviews:** full round, range `775f60d..58cbde7`, R1 = `58cbde7`; all
  four quotes matched for all three.
  code-reviewer: no High; Medium 1 (schema rests on documented shape,
  `null` refused): `null` now accepted for `choices` and
  `nested_ticket_fields`, rest kept fail-closed, live check to the owner;
  Low 2 (untested rules, empty label), Low 3 (overview line), Low 4 (status
  vs 2-level tree comment): all fixed in `434c9f9`.
  security-reviewer: no High or Medium; 1 Low (`__proto__` key): probe run
  first, passed on unchanged code, kept as pinning tests in `434c9f9`.
  compliance-reviewer: Wireframes `none`, nothing to check.
  Scoped round, range `58cbde7..434c9f9`, quotes matched for all three;
  list A empty for all three. Parked: `docs/improvements.md`, the T-008
  entry stamped `434c9f9`.

- **Proposed plan changes:** T-014, "A write is not started without time to
  finish", still `proposed (2026-11-23)`; owner to size it before the first
  write resource. T-009..T-011 are reads.

- **Open doubts:**
  - New (T-008): malformed body → `server`, real status, not retryable:
    builder's choice, accepted by the orchestrator for the owner.
  - New: the ticket-fields schema follows API v2 docs, not a live account;
    owner to decide on a live check.
  - New: a `null` `choices`/`nested_ticket_fields` is kept as `null`; T-010
    must treat `null` and absent alike.
  - New: the account-patterns hook refused T-008's first commit (an
    invented fixture name matched a pattern); renamed, never committed.
  - From T-013: the deadline reaches `acquire` through an optional second
    argument of `request`; a backoff crossing the deadline is skipped; a
    caller's bound of exactly 15 s refuses a 15 s wait; SPEC §7.1 does not
    mention the 30 s deadline; the 29.9 s/29.999 s tests not proven stable;
    `paginate` has no total budget.
  - From T-012: `9fbaa8d` is a mechanism change no reviewer read;
    `SKIP=account-patterns` for contributors without the patterns file,
    owner to confirm; AGENTS.md hard rule 3 does not record it; the C locale
    does not fold accented letters.
  - PLAN's sizing line still counts T-001's split point as pending.
  - Earlier (T-003..T-007) builder's choices awaiting the owner: see the
    "Open doubts" of each task file and HANDOFF at `6b348c7`.
  - `make quality` does not run `make build`; CI does (ran locally on
    `58cbde7`: clean).
  - CI gitleaks step not shown to fail on a planted secret (T-001); hashes
    quoted up to `59e3395` predate the history rewrite; the pre-scrub
    backup bundle still holds account values, owner deletes it; two
    Dependabot branches on the remote, not reviewed.

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `434c9f9` (Node 22): eslint and
  ruff "All checks passed!"; prettier "All matched files use Prettier code
  style!"; `tsc --noEmit` clean; vitest "Test Files 9 passed (9)", "Tests
  387 passed (387)"; `tools/checks` "Ran 54 tests", OK; both gitleaks scans
  passed. `test/client/resources/ticket-fields.test.ts` alone: 25 passed.
