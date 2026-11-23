# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-23T13:28:59+01:00`
- **Describes commit:** `432a2ab`, pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45174811277
  (ran on `432a2ab`: `quality (22.19)`, `quality (24)`, `checks`). This
  file's hash and CI line arrive in the commit right after it.

- **Current task:** T-010 (schema service: load, TTL cache, output
  mapping), `done (2026-11-23)`. Build in `f8d7db7`, review fixes in
  `460a596`.

- **Next action:** `/pickup` takes T-011 (schema service: input mapping +
  nested-choice validation).

- **Read before anything else:** `docs/tasks/PLAN.md` (rows T-011, T-014,
  T-015); the T-011 task file; the "Open doubts" of T-010
  (`docs/tasks/T-010-schema-output.md`); the T-010 entries of
  `docs/improvements.md` (stamped `f8d7db7` and `460a596`).

- **Reviews:** full round, range `76e2718..f8d7db7`, R1 = `f8d7db7`; all
  four quotes matched for all three.
  code-reviewer: no High; Medium (requester/company/product keys untested)
  and 4 Low (personal-data test could not fail, groups failure untested,
  empty nested top level, overview claimed TTL wiring) fixed in `460a596`;
  made one read-only Bash call (`git show f8d7db7:SPEC.md | grep`).
  security-reviewer: no High; Medium (hidden match missed ticket keys,
  spaces, Unicode forms) and 3 Low (prototype-chain lookups, shared mutable
  cached schema, clock going back) fixed in `460a596`; §7.4 wrapping and
  the unmatched-hidden-key warning parked.
  compliance-reviewer: Wireframes `none`, nothing to check.
  Scoped round, range `f8d7db7..460a596`, quotes matched for all three;
  list A empty for all three; code-reviewer made no Bash call. Parked:
  `docs/improvements.md`, entries stamped `f8d7db7` and `460a596`.

- **Proposed plan changes:**
  - T-015, "Build the schema service from config", `proposed (2026-11-23)`:
    nothing passes `limits.schema_ttl_s` to `SchemaService` or the team
    `fields` to `ticketOutput`, and T-011 does not; may fold into the first
    M1 tool task.
  - T-014, "A write is not started without time to finish", still
    `proposed (2026-11-23)`; owner to size it before the first write
    resource.

- **Open doubts:**
  - New (T-010), builder's choices for the owner to confirm: hidden-field
    match ignores case (also spaces, Unicode form, and a default field's
    ticket key); a key the ticket does not carry leaves the field out,
    `null` stays `null`; requester, company and product are raw ids; a
    hidden key matching no field is silent (warning parked).
  - New (T-010): unresolved ids are strings (`unknown status 9`,
    `agent 9 (name not loaded: the agent list is incomplete)`); the name
    maps are read-only by type only (parked `460a596`); §7.4 wrapping must
    exist before `ticketOutput`'s first tool caller; the ~5 min worst case
    per list load (T-009 Low 4) still parked.
  - From T-009/T-008: schemas follow API v2 docs, not a live account;
    malformed page or body → `server`.
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
    `460a596`: clean).
  - CI gitleaks step not shown to fail on a planted secret (T-001); hashes
    quoted up to `59e3395` predate the history rewrite; the pre-scrub
    backup bundle still holds account values, owner deletes it; two
    Dependabot branches on the remote, not reviewed.

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `460a596` plus the handoff docs
  (Node 22): eslint and ruff "All checks passed!"; prettier "All matched
  files use Prettier code style!"; `tsc --noEmit` clean; vitest "Test Files
  12 passed (12)", "Tests 456 passed (456)"; `tools/checks` "Ran 54 tests",
  OK; both gitleaks scans passed. `test/schema/output.test.ts` 34 passed.
