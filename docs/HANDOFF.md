# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-25T16:30:48+01:00`
- **Describes commit:** `<hash>` (filled by the stamp commit). **CI:**
  `<run>`.

- **Current task:** T-040 (RFC: write safety core; per-tool writable
  fields) `done (2026-11-25)`. RFC
  `docs/rfc/active/2026-11-25-write-safety-core.md`, Status Active
  (owner, 2026-11-25), section "The owner's decisions (2026-11-25)".
  Acceptance commit `84dd7aa`; review wording fixes in the handoff commit.
  Safety core is now **the write path**: AGENTS.md rule 1, SPEC §9,
  `.claude/commands/decompose.md` step 4.

- **Next action:** `/decompose M2`, which awaits the owner's go (not run
  in this session). It must reword SPEC §8.2/§9/C4's `add_note` rows and
  §8.2's `update_ticket` purpose (see `docs/improvements.md` entries
  `84dd7aa`), and size T-064 and T-065.

- **Owner actions:**
  - Time-trigger check on `mcp-test` tickets' activity log, 2026-11-26:
    settles SPEC §13's M2 wording (as proposed, or (a) or (b) in the RFC)
    before M2's first real test.
  - T-063's order probe: `make smoke-order-probe DAY=2026-11-23`; keep the
    output in `docs/private/account-facts.md`.

- **Read before anything else:** the RFC's "Decision" and "The owner's
  decisions", then `docs/tasks/PLAN.md` M2 section.

- **Reviews:**
  - No third `rfc-reviewer` round (rule 9): this session's edits record
    the owner's decisions, not review fixes.
  - Handoff full round R1 = `84dd7aa`, range `dd33b08..84dd7aa`; all
    three quoted base, HEAD, stat line and trailer correctly. No scoped
    round: the fixes are wording only, no mechanism changed.
  - `code-reviewer`: Medium HANDOFF stale (fixed by this file); Low SPEC
    §9 row vs paragraph (parked, see below); Low task-file C8 evidence
    line (dated annotation added); Low RFC §13 wording sentence (fixed).
  - `security-reviewer`: no blocking finding. Medium SPEC §8.2/§9/C4
    `add_note` rows lag the RFC: dismissed for now by the orchestrator's
    instruction (SPEC changes go to `/decompose M2`), parked in
    `docs/improvements.md`; guarded by T-064's acceptance. Low: `write`
    can still mail the requester via Resolved/Closed, sentence added to
    the RFC's "Not covered". Low: time-trigger gate unenforced, parked.
  - `compliance-reviewer`: wireframes `none`.

- **Proposed plan changes:** T-064 (the write path, acceptance line
  amended by the RFC) and T-065 (allow sets) stay `proposed
  (2026-11-25)`, sized by `/decompose M2`.

- **Open doubts:** whether `agent-native-setup update` would revert the
  instantiated safety-core value in `.claude/commands/decompose.md`
  step 4 (not checked). `.claude/worktrees/` is not gitignored (parked).

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `84dd7aa`'s tree: vitest
  "Tests 2691 passed (2691)", 39 files; `tools/checks` "Ran 138 tests",
  OK; lint, format, typecheck, build and both gitleaks scans passed.
