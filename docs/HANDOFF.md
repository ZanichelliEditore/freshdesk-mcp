# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-23T13:16:11+01:00`
- **Describes commit:** `<hash>`, pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** filled in the stamp commit
  right after it.

- **Current task:** T-009 (agents and groups, read), `done (2026-11-23)`.
  Build in `e85b3db`, review fixes in `9676d5b`.

- **Next action:** `/pickup` takes T-010 (schema service: load, TTL cache,
  output mapping).

- **Read before anything else:** `docs/tasks/PLAN.md` (rows T-010, T-014);
  the T-010 task file; the "Open doubts" of T-008 and T-009
  (`docs/tasks/T-00{8,9}-*.md`); the T-008 and T-009 entries of
  `docs/improvements.md` (null choices, `truncated`, agents' personal data).

- **Reviews:** full round, range `9e20200..e85b3db`, R1 = `e85b3db`; all
  four quotes matched for all three.
  code-reviewer: no High; Medium 1 (silent truncation at the page cap) and
  Low 2 (`per_page` derived from the module) fixed in `9676d5b`; Low 3
  (shared logic tested twice) and Low 4 (about 5 min worst case per list)
  parked; `list-all.ts` judged justified.
  security-reviewer: no High, Medium or Low; Info (a) and (b) parked.
  compliance-reviewer: Wireframes `none`, nothing to check.
  Scoped round, range `e85b3db..9676d5b`, quotes matched for all three;
  list A empty for all three. code-reviewer made one read-only Bash
  `git grep` and said so. Parked: `docs/improvements.md`, entries stamped
  `e85b3db` and `9676d5b`.

- **Proposed plan changes:** T-014, "A write is not started without time to
  finish", still `proposed (2026-11-23)`; owner to size it before the first
  write resource.

- **Open doubts:**
  - Closed: T-007's "paginate gives no sign it stopped at a cap", by
    `9676d5b` (`paginate` returns `{ truncated }`).
  - New (T-009): nothing reads `truncated` yet; T-010 must treat "id not
    found and list truncated" as "list incomplete". Agents carry
    `contact.email`/phone through; T-010 should keep only id and name.
  - New (T-009): malformed page → `server`, as T-008; schemas follow API v2
    docs, not a live account.
  - From T-008: the ticket-fields schema follows API v2 docs, live check is
    the owner's; a `null` `choices`/`nested_ticket_fields` is kept as
    `null`, T-010 treats `null` and absent alike.
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
    `9676d5b`: clean).
  - CI gitleaks step not shown to fail on a planted secret (T-001); hashes
    quoted up to `59e3395` predate the history rewrite; the pre-scrub
    backup bundle still holds account values, owner deletes it; two
    Dependabot branches on the remote, not reviewed.

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `9676d5b` (Node 22): eslint and
  ruff "All checks passed!"; prettier "All matched files use Prettier code
  style!"; `tsc --noEmit` clean; vitest "Test Files 11 passed (11)", "Tests
  422 passed (422)"; `tools/checks` "Ran 54 tests", OK; both gitleaks scans
  passed. `test/client/resources/agents.test.ts` 15 passed,
  `groups.test.ts` 13 passed, `paginate.test.ts` 28 passed.
