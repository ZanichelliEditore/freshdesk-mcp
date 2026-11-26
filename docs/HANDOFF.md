# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-26T10:47:50+01:00`
- **Describes commit:** `<hash>` (the T-072 handoff commit). **CI:** to be
  stamped.

- **Current task:** T-072 (`add_note`) `done (2026-11-26)`. Commits
  `23ebc5d` (implementation), `e985d67` (full-round fixes), then this
  handoff commit. Tests: `test/tools/write/add-note.test.ts` (30 cases),
  `test/server.test.ts` "the write wiring". No version bump or tag (OD-16).
  MockAgent only, no real Freshdesk call.

- **Next action:** `/pickup` T-073 (`categorize_tickets`), the first `todo`
  row whose dependencies (T-070, T-071) are `done`.

- **Read before anything else:** `docs/tasks/T-073-categorize-tickets.md`;
  `docs/improvements.md` entries `70be151` and `f64d743` (T-073 must write
  only the checked `ticket_id` and `fields`).

- **Owner decisions (2026-11-26, via the orchestrator):**
  - `add_note` returns only allow-listed fields of Freshdesk's note reply:
    applied (`ticket_id`, `note_id`, `private`, `notified_agent_ids`,
    `api_calls_used`).
  - A test that no email ever appears in tool output, even when the reply
    carries `notified_to`, `to_emails`, `cc_emails` or `support_email`:
    applied ("no email ever reaches the output", plus addresses replaced in
    every refusal text).
  - `update_ticket`'s non-atomic tag merge (T-071) is accepted, documented,
    not to be fixed: open doubt closed.
  - In scope and done: the `add_note` line of `docs/tool-catalogue.md` now
    says "private note only"; improvements `f22c4a3` marked.

- **Reviews:**
  - Full round, R1 = `23ebc5d`, range `f9c9a45..23ebc5d`. Scoped round,
    range `23ebc5d..e985d67`. All quotes checked against the diff files.
  - `code-reviewer`, full: low, top-level message redaction not pinned by a
    test (fixed in `e985d67`, direct handler tests); low, no exactly-10
    agents case (fixed); info, whitespace-only body and untested deadline
    (parked).
  - `security-reviewer`, full: low, redaction caught only a literal `@`
    (fixed: fullwidth and HTML entity forms); low, the address regex could
    backtrack quadratically (fixed: whitespace split, one test per word);
    info, clip can leave an address's local part, and a `private: false`
    answer is reported, not flagged (parked; second is an owner question).
  - `compliance-reviewer`: wireframes `none`, both rounds. In the scoped
    round its first run misquoted the `--stat` line ("stale diff file", red
    gate); re-dispatched, correct quotes, `none`.
  - Scoped round: `code-reviewer` and `security-reviewer` nothing blocking.
    Parked (improvements `e985d67`): redaction before `stripTags` (a tag
    inside an entity), U+FE6B and `%40`, a stale header comment, a
    message-only error test.

- **Proposed plan changes:** none.

- **Open doubts:**
  - Owner question: should `add_note` (and T-074's `hand_off_draft`) report
    an error, not `ok`, if Freshdesk ever answers a note with
    `private: false`? Today it is reported as given.
  - T-072's acceptance says a `private` or `notify_emails` input "is
    `validation`": it is the MCP SDK's "Input validation error" text, not a
    `FreshdeskError` JSON (task file, Done).
  - T-074 still owes the same allow-listed output and no-email test
    (improvements `a57ef9b`).
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

- **Checkpoint:** `make quality` exit 0 on `e985d67`'s tree. Vitest
  "Tests 3880 passed (3880)"; `tools/checks` "Ran 138 tests", OK; lint,
  format, typecheck, build and both gitleaks scans passed.
