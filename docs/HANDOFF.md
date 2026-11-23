# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-23T13:50:43+01:00`
- **Describes commit:** `41fc2d9`, pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45179540597
  (ran on `41fc2d9`: `quality (22.19)`, `quality (24)`, `checks`). This
  file's hash and CI line arrive in the commit right after it. **M0
  done:** this run is its acceptance.

- **Current task:** T-011 (schema service: input mapping + nested-choice
  validation), `done (2026-11-23)`. Build `73099a8`, review fixes
  `92e6b40`. The build commit did not set the row to `doing` (rule 7
  miss); set in `92e6b40`. **M0 done** (CI above).

- **Next action:** `/decompose M1`. Before M1's first write caller the
  owner decides: (1) hidden fields output-only, or also refused on input;
  (2) a per-tool allow set of writable fields (SPEC §8.2); (3) hard rule 1:
  `ticketInput` is the first builder of write payloads, so an RFC on
  whether the first write tool needs a safety core; (4) the
  agent/group/product choices live check (Open doubts, top); (5) size
  `proposed` T-014 and T-015.

- **Read before anything else:** `docs/tasks/PLAN.md` (M1 rows, T-014,
  T-015); `docs/improvements.md` entries stamped `73099a8` (owner
  decisions M2, M3) and `92e6b40`; "Open doubts" of
  `docs/tasks/T-011-schema-input.md` and `docs/tasks/T-010-schema-output.md`.

- **Reviews:** full round, range `907e6a4..73099a8`, R1 = `73099a8`; all
  four quotes matched for all three. code-reviewer: 4 Medium and Lows fixed
  in `92e6b40` (Low 6 parked); made one read-only Bash call (`git grep` on
  `SPEC.md`). security-reviewer: M1, M4, L1-L3 fixed in `92e6b40`; M2, M3
  parked as owner decisions. compliance-reviewer: Wireframes `none`.
  Scoped round, range `73099a8..92e6b40`, quotes matched for all three;
  list A empty for all three; no Bash calls. Parked:
  `docs/improvements.md`, entries stamped `73099a8` and `92e6b40`.

- **Proposed plan changes:** none new. T-014 and T-015 still
  `proposed (2026-11-23)`.

- **Open doubts:**
  - **Owner decision / live check:** `unsupported_field`
    (`src/schema/input.ts:242-247`) may refuse Agent, Group and Product on
    a real account if `/ticket_fields` gives them a name → id `choices`
    record (reviewers' memory, unverified; the fixture gives them none).
    Due before M1's first write tool.
  - New (T-011), orchestrator's and builder's choices: see the task file's
    "Open doubts" (fail-closed other types, empty choices pass through,
    API name vs label ambiguous with no escape syntax, short path sends
    `null`, `" > "` separator, ids only for agent/group/requester);
    `unsupported_field` is a code SPEC §7.3 does not name.
  - From T-010: hidden-field match rules, unresolved ids as strings, name
    maps read-only by type only, §7.4 wrapping before `ticketOutput`'s
    first tool caller, ~5 min worst case per list load.
  - From T-009/T-008: schemas follow API v2 docs, not a live account;
    malformed page or body → `server`.
  - From T-013: see HANDOFF at `432a2ab` (deadline through `request`'s
    second argument, 15 s bound, SPEC §7.1 silent on 30 s, `paginate` has
    no total budget).
  - From T-012: `9fbaa8d` unreviewed mechanism change;
    `SKIP=account-patterns` for contributors without the patterns file,
    owner to confirm; C locale does not fold accented letters.
  - PLAN's sizing line still counts T-001's split point as pending.
  - `make quality` does not run `make build`; CI does (ran locally on
    `92e6b40`: clean).
  - CI gitleaks step not shown to fail on a planted secret (T-001); hashes
    quoted up to `59e3395` predate the history rewrite; the pre-scrub
    backup bundle still holds account values, owner deletes it; two
    Dependabot branches on the remote, not reviewed.

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `92e6b40` (Node 22): eslint and
  ruff "All checks passed!"; prettier "All matched files use Prettier code
  style!"; `tsc --noEmit` clean; vitest "Test Files 13 passed (13)",
  "Tests 503 passed (503)"; `tools/checks` "Ran 54 tests", OK; both
  gitleaks scans passed. `test/schema/input.test.ts` 47 passed.
