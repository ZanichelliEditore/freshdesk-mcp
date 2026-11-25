# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-25T16:58:57+01:00`
- **Describes commit:** `8d0aa8f` (the T-066 handoff commit), pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45650306886
  (workflow `quality`, ran on `8d0aa8f`: `quality (22.19)`, `quality (24)`,
  `checks` all success).

- **Current task:** T-066 (a search cursor holds the second and the ids
  written in it) `done (2026-11-25)`. RFC
  `docs/rfc/active/2026-11-25-search-cursor-tie-ids.md`, Active by the
  owner's word (2026-11-25), commit `5bf5c8a`. Code `67b2173`; review
  fixes in the handoff commit. Regression:
  `test/tools/core/export-tickets.test.ts`, describe "T-066 …" >
  "regression: a tie of 3 in one second, ids ascending, across pages 1
  and 2" (shown failing on `dd33b08`'s `src/`). CHANGELOG "Unreleased".

- **Released 0.3.1** (2026-11-25, orchestrator, owner pre-authorised):
  `b005bd0` bumps the version and dates CHANGELOG; `quality` green
  (https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45650992436);
  tag `v0.3.1` on `b005bd0`; `release` green, publish success
  (https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45651149214);
  npm `latest` = `0.3.1`, `npx -y --prefer-online
  @zanichelli/freshdesk-mcp@0.3.1 --version` printed `0.3.1`.

- **Next action:** `/decompose M2`, which awaits the
  owner's go: it must reword SPEC §8.2/§9/C4's `add_note` rows and §8.2's
  `update_ticket` purpose (`docs/improvements.md` entries `84dd7aa`), and
  size T-064 and T-065.

- **Owner actions:**
  - Time-trigger check on `mcp-test` tickets' activity log, 2026-11-26
    (settles SPEC §13's M2 wording).
  - Confirm the RFC's threat model: the owner accepted the unkeyed
    digest's forgery risk; the `rfc-reviewer` named a prompt-injection
    path (a model steered by ticket text passing a forged id set). The
    RFC records it as accepted under that word; confirm or reopen.

- **Read before anything else:** the RFC's "Decision" and "Threat model",
  then `docs/tasks/PLAN.md` M2 section.

- **Reviews:**
  - `rfc-reviewer` on the draft: no design-changing finding; seven
    wording findings resolved in the RFC (no second round: no mechanism
    changed).
  - Handoff full round R1 = `67b2173`, range `8f0d8d0..67b2173`; all
    three quoted base, HEAD, stat line and trailer correctly. No scoped
    round: the fixes are one added test, a test rename and wording.
  - `code-reviewer`: no blocker. Medium: the highest valid search
    position not shown accepted (test added). Low: stale test name
    (renamed); regression proof not recorded (in the task's "Done");
    the 31-id case untested under a cut (parked,
    `docs/improvements.md`). Nits: CHANGELOG label, ticket-queries
    wording, RFC "Implemented" box (all fixed).
  - `security-reviewer`: no blocking finding. Low: an id ≤ 0 from
    Freshdesk fails the call (parked, `.positive()` on the schema).
    Info: RFC sentence "no second party" narrowed to name the
    injection path (fixed).
  - `compliance-reviewer`: wireframes `none`.

- **Proposed plan changes:** none.

- **Open doubts:** the threat model's injection path (owner action
  above). From T-040, unchecked: whether `agent-native-setup update`
  would revert the safety-core value in `.claude/commands/decompose.md`
  step 4; `.claude/worktrees/` is not gitignored (parked).

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on the handoff tree: vitest
  "Tests 2746 passed (2746)"; `tools/checks` "Ran 138 tests", OK; lint,
  format, typecheck, build and both gitleaks scans passed.
