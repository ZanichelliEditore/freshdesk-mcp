# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-26T10:35:53+01:00`
- **Describes commit:** `a82d3c3` (the T-071 handoff commit), pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45793591143
  (workflow `quality`, ran on `a82d3c3`: `quality (22.19)`, `quality (24)`,
  `checks` all success).

- **Current task:** T-071 (`update_ticket`, the `write` toolset registers)
  `done (2026-11-26)`. Commits `20063be` (implementation), `f22c4a3`
  (full-round fixes), then this handoff commit. Tests:
  `test/tools/write/update-ticket.test.ts` (27 cases), `test/server.test.ts`
  "the write wiring" and the `write` cases of "enabled toolsets come from
  the team file only", `test/lint-rules.test.ts` (place `T3`, context
  type-only). No split was needed. No version bump or tag (OD-16).

- **Next action:** `/pickup` T-072 (`add_note`), the first `todo` row whose
  dependencies (T-069, T-071) are `done`.

- **Read before anything else:** `docs/tasks/T-072-add-note.md`;
  `docs/improvements.md` entry `f22c4a3` (T-071's parked items, including
  the stale `add_note` line of `docs/tool-catalogue.md`) and `a57ef9b`
  (T-072 returns only allow-listed fields of the note reply).

- **Owner decisions:** none this session (OD-16 applied: no release before
  T-074).

- **Reviews:**
  - Full round, R1 = `20063be`, range `dbc92ba..20063be`. Scoped round,
    range `20063be..f22c4a3`. All three reviewers quoted base, HEAD, stat
    line and trailer correctly in both rounds.
  - `security-reviewer`, full: medium, any `src/tools` module could
    value-import `context.js` and call `toolsetsOf` to reach the write
    tools (fixed in `f22c4a3`: `context.js` type-only in T0 to T2, absent
    from T3, lint tests); low, tag merge not atomic (fixed: said in the
    description and header).
  - `code-reviewer`, full: the same medium (same fix); tag race (same);
    a wiring test that could not fail, missing tag boundary tests, a stale
    overview line (all fixed in `f22c4a3`).
  - `compliance-reviewer`: wireframes `none`, both rounds.
  - Scoped round: `code-reviewer` clean; `security-reviewer` nothing
    blocking. Parked (improvements `f22c4a3`): the context.ts comment
    claims more than lint gives (a re-export through a listed module
    outside `src/tools/`); lint tests for other import forms of
    `toolsetsOf`; `MAX_TAGS` exact case for `tags_remove`; real-wiring test
    names only; a wording nit.

- **Proposed plan changes:** none.

- **Open doubts:**
  - `update_ticket`'s tag merge is GET then PUT, not atomic (accepted,
    described); a field refusal with tags given costs the tag GET first.
  - From T-070: T-073 must write only the checked `ticket_id` and `fields`
    (improvements `70be151`, `f64d743`).
  - From T-067: the `getAgent` active rule comes from Freshdesk's
    documentation, not measured.
  - From T-077: that `context.ts` passes the team file's `toolsets` to
    `createWritePath` holds by inspection, not by lint.
  - From T-041/T-065: default fields keyed by `/ticket_fields` API name, to
    confirm at T-076.
  - From T-040, unchecked: whether `agent-native-setup update` would revert
    the safety-core value in `.claude/commands/decompose.md` step 4.
  - `.claude/worktrees/` is not gitignored (parked).

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `f22c4a3`'s tree. Vitest
  "Tests 3845 passed (3845)"; `tools/checks` "Ran 138 tests", OK; lint,
  format, typecheck, build and both gitleaks scans passed.
