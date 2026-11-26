# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-26T11:07:33+01:00`
- **Describes commit:** `61a8a58` (the T-073 handoff commit), pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45798673354
  (workflow `quality`, ran on `61a8a58`: `quality (22.19)`, `quality (24)`,
  `checks` all success).

- **Current task:** T-073 (`categorize_tickets`) `done (2026-11-26)`.
  Commits `3a2ba75` (implementation), `3b3bec6` (full-round fixes), then
  this handoff commit. Tests: `test/tools/write/categorize-tickets.test.ts`
  (29 cases), `test/tools/preview.test.ts` "the checked items it gives
  back", `test/server.test.ts` "the write wiring". No version bump or tag
  (OD-16). MockAgent only, no real Freshdesk call.

- **Next action:** `/pickup` T-074 (`hand_off_draft`), the first `todo`
  row whose dependencies (T-072, T-041) are `done`.

- **Read before anything else:** `docs/tasks/T-074-hand-off-draft.md`;
  the owner decision below; `docs/improvements.md` entry `a57ef9b` (T-074's
  allow-listed output and no-email test).

- **Owner decisions (2026-11-26, via the orchestrator):**
  - OD-13 applied in T-073: what fits the deadline is applied, the rest
    reported `not_attempted` with the `preview_id` still valid for them; a
    confirm may name any subset of the previewed tickets.
  - **For T-074 to implement:** if Freshdesk's note reply says
    `private: false`, `add_note` and `hand_off_draft` return an error that
    includes the `note_id` and says the note is public and must be
    checked. `add_note` (T-072) still reports it as given today: T-074
    changes both.

- **Reviews:**
  - Full round, R1 = `3a2ba75`, range `04579a2..3a2ba75`. Scoped round,
    range `3a2ba75..3b3bec6`. All four quotes of every reviewer checked
    against the diff files: correct.
  - `code-reviewer`, full: medium, a sent write answered `network`/`server`
    reported plainly `refused` (fixed: `may_have_been_applied` and a note);
    low, no tool-level test that only checked values are written (fixed:
    handler test with a getter); low, budget-cut halves of two acceptance
    lines untested (fixed); low, the tool parsed the id's format (fixed:
    `expires_at` from `mintPreviewId`); low, a field named twice passed the
    preview (fixed: `duplicate_field`).
  - `security-reviewer`, full: no safety-core bypass; `not_attempted` sound
    (only `rate_limited`, never applied). Low-medium, same as code's medium
    (fixed); low, label rebinding at confirm (parked, owner question,
    improvements `3a2ba75`); info, duplicate field (fixed).
  - `compliance-reviewer`: wireframes `none`, both rounds.
  - Scoped round: nothing blocking from all three. Parked (improvements
    `3b3bec6`): `may_have_been_applied` counted in `refused`; no 2xx-of-
    another-shape test; a flagged ticket can be re-sent within 15 minutes.

- **Proposed plan changes:** none.

- **Open doubts:**
  - Owner question: bind a confirm to the field the preview resolved (mint
    over API names, confirm by API name) rather than the label typed?
    Today a relabel inside the 15 minutes could redirect a write to another
    custom field (improvements `3a2ba75`).
  - Owner question: should a `may_have_been_applied` ticket be its own
    result or count, beyond OD-13's three states (improvements `3b3bec6`)?
  - `categorize_tickets` checks values only at the confirm (tools cannot
    import `ticketInput`); a bad choice refuses that ticket then.
  - T-072's acceptance "a `private` input is `validation`" is the MCP SDK's
    "Input validation error" text, not a `FreshdeskError` JSON; the same
    holds for T-073's extra item key.
  - T-074 still owes the allow-listed output and no-email test
    (improvements `a57ef9b`).
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

- **Checkpoint:** `make quality` exit 0 on `3b3bec6`'s tree. Vitest
  "Tests 3924 passed (3924)"; `tools/checks` "Ran 138 tests", OK; lint,
  format, typecheck, build and both gitleaks scans passed.
