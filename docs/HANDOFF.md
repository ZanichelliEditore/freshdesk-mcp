# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-26T11:24:26+01:00`
- **Describes commit:** pending (the T-074 handoff commit). **CI:** pending.

- **Current task:** T-074 (`hand_off_draft`) `done (2026-11-26)`. Commits
  `ae54d0a` (implementation, `add_note`'s public-note error), `d8f274e`
  (full-round fixes), then this handoff commit. Tests:
  `test/tools/write/hand-off-draft.test.ts` (38 cases),
  `test/tools/write/add-note.test.ts` "a note Freshdesk answers as public"
  and "a POST whose outcome is unknown", `test/server.test.ts` "the write
  wiring". No version bump or tag: OD-16 now allows a release, which stays
  the owner's go. MockAgent only, no real Freshdesk call.

- **Next action:** `/decompose` sizing T-078 (`proposed`, below) before
  T-075.

- **Read before anything else:** `docs/tasks/PLAN.md` row T-078;
  `docs/improvements.md` entries `3a2ba75` and `3b3bec6` (T-078's source);
  entry `ae54d0a` (owner question below).

- **Reviews:**
  - Full round, R1 = `ae54d0a`, range `2c649fc..ae54d0a`. Scoped round,
    range `ae54d0a..d8f274e`. All four quotes of every reviewer checked
    against the diff files: correct.
  - `code-reviewer`, full: medium, assignment error kept `retryable: true`
    after the note (fixed: `retryable: false`, points at `update_ticket`);
    medium, a 5xx/network PUT said "failed" though it may have landed
    (fixed: "may or may not have been applied"); medium, values checked
    only after the note (not fixed: `ticketInput` is lint-fenced out of
    `src/tools/` by T-077; owner question, improvements `ae54d0a`); low,
    missing tests for ambiguous key, dedupe, `agent: null` (added); low,
    problems over 10 dropped silently (fixed); low, duplicated key lookup
    (parked); low, "not retried" wording (fixed).
  - `security-reviewer`, full: no safety-core bypass. Medium, same as
    code's first (fixed); low, a 5xx/network note POST gave no "may have
    been written" hint (fixed in both tools, `noteFailed`); info, header
    comment overclaimed (fixed).
  - `compliance-reviewer`: wireframes `none`, both rounds.
  - Scoped round: nothing blocking from all three. Parked (improvements
    `d8f274e`): six test-strength items, the dropped top-level message.
    Dismissed: errors[] unwrapped (the registry's `sentError` wraps them).

- **Proposed plan changes:** T-078 "categorize_tickets: confirm bound to
  the API field name the preview resolved; `may_have_been_applied` as its
  own result state and count", `proposed`, from improvements
  `3a2ba75`/`3b3bec6`, owner-approved 2026-11-26; to size at `/decompose`.

- **Open doubts:**
  - Owner question: a mistyped agent or group value in `hand_off_draft` is
    found only at the PUT, after the note is posted and the agents emailed
    (the error names the `note_id` and says the assignment was not
    applied). Accept, or have the core's `hand_off_draft` entry check the
    assignment before the note (a core change, `/rfc` first)?
  - `categorize_tickets` checks values only at the confirm (tools cannot
    import `ticketInput`); a bad choice refuses that ticket then.
  - T-072's acceptance "a `private` input is `validation`" is the MCP SDK's
    "Input validation error" text, not a `FreshdeskError` JSON; the same
    holds for T-073's extra item key and T-074's `private`/`body` inputs.
  - From T-067: the `getAgent` active rule comes from Freshdesk's
    documentation, not measured.
  - From T-077: that `context.ts` passes the team file's `toolsets` to
    `createWritePath` holds by inspection, not by lint.
  - From T-041/T-065: default fields keyed by `/ticket_fields` API name, to
    confirm at T-076.
  - From T-040, unchecked: whether `agent-native-setup update` would revert
    the safety-core value in `.claude/commands/decompose.md` step 4.
  - `.claude/worktrees/` is not gitignored (parked).

- **Dead ends:** MockAgent 429/5xx-on-every-attempt tests took 3 s or more
  (client retries and pacing), near Vitest's 5 s timeout; replaced by a
  fake-entry handler test and a 401 schema load.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `d8f274e`'s tree. Vitest
  "Tests 3970 passed (3970)", 49 files; `tools/checks` "Ran 138 tests", OK;
  lint, format, typecheck, build and both gitleaks scans passed.
