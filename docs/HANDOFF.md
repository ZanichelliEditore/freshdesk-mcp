# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-26T10:00:31+01:00`
- **Describes commit:** filled by the stamp commit. **CI:** filled by the
  stamp commit.

- **Current task:** T-069 (notify recipients by agent id) `done (2026-11-26)`.
  Commits `a57ef9b` (implementation), `762d34a` (full-round fixes), then
  this handoff commit. Tests: `test/core/notify.test.ts` (43 cases); details
  in the task file's "Done". No split was needed.

- **Next action:** `/pickup` T-070 (stateless preview and `preview_id`). It
  is the first `todo` row; its dependency is `none`.

- **Read before anything else:** `docs/tasks/T-070-preview-id.md`;
  `docs/improvements.md` entries `a57ef9b` and `762d34a` (T-069's parked
  items, for T-072 and T-074 later).

- **Reviews:**
  - Full round, R1 = `a57ef9b`, range `e9cbe6b..a57ef9b`. Scoped round,
    range `a57ef9b..762d34a`. All three reviewers quoted base, HEAD, stat
    line and trailer correctly in both rounds.
  - `code-reviewer`, full: copy-once test could not fail (fixed: Proxy test,
    mutation-checked); "locals only" wording overstated (fixed, item
    parked); `EMAIL` let C1 and format characters through (fixed); record
    refusals did not assert the cause code (fixed); `[undefined]` fallback
    (simplified); lookups on the full client (now the GET-only view). It
    reported one stray no-op Bash call (`true`), which read and wrote
    nothing.
  - `security-reviewer`, full: no fail-open path. Note answer may echo the
    recipients (parked for T-072/T-074); a cast Symbol/BigInt `deadline`
    made the entry reject (fixed in `noteWrite`, `ticketWrite` parked);
    lookups spent before the ticket is known (dismissed: bounded by the
    limiter; open doubt for the owner); `EMAIL` odd characters (fixed);
    lookups via the view (done).
  - `compliance-reviewer`: wireframes `none`, both rounds.
  - Scoped round: `code-reviewer` and `security-reviewer` found nothing
    that falsifies an acceptance line or opens a fail-open path; no
    mechanism changed. Parked (`762d34a`): deadline refusal message,
    `NaN`/`Infinity` deadline, look-alike letters.

- **Proposed plan changes:** none.

- **Open doubts:**
  - The note answer may carry the resolved recipients back to the caller;
    T-072 and T-074 must not return them (`a57ef9b` in improvements).
  - Whether a note should check the ticket exists before up to 10 agent
    lookups: owner's call (`a57ef9b`).
  - From T-068: a ticket change that sets nothing is refused in the core;
    T-071's tool should skip an empty change rather than call the entry.
  - From T-067: the `getAgent` active rule comes from Freshdesk's
    documentation, not measured; real-time tests timed out under machine
    load on 2026-11-26 (not seen this session).
  - From T-077: that `context.ts` passes the team file's `toolsets` to
    `createWritePath` holds by inspection, not by lint.
  - From T-041/T-065: default fields keyed by `/ticket_fields` API name, to
    confirm at T-076.
  - From T-040, unchecked: whether `agent-native-setup update` would revert
    the safety-core value in `.claude/commands/decompose.md` step 4.
  - `.claude/worktrees/` is not gitignored (parked).

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `762d34a`'s tree. Vitest
  "Tests 3692 passed (3692)"; `tools/checks` "Ran 138 tests", OK; lint,
  format, typecheck, build and both gitleaks scans passed.
