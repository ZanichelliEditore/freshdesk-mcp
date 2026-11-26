# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-26T09:17:13+01:00`
- **Describes commit:** `a4eba1d` (the T-068 handoff commit), pushed
  to `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45782119824
  (workflow `quality`, ran on `a4eba1d`: `quality (22.19)`, `quality (24)`,
  `checks` all success).

- **Current task:** T-068 (write entry points, built only when `write` is
  enabled) `done (2026-11-26)`. Commits `0a98b15` (implementation),
  `254bcae` (review fixes), then this handoff commit. Tests:
  `test/core/entries.test.ts` (new), `test/core/resources.test.ts` (the
  non-object snapshot and the unserialisable body); details in the task
  file's "Done". No split was needed.

- **Next action:** `/pickup` T-077 (lint fence: the client, the limiter and
  `ticketInput` stay in the core). It is the first `todo` row; its
  dependency T-068 is `done`. Its acceptance now includes the `0a98b15`
  `createWritePath` fence (plan amendment below).

- **Plan amended (2026-11-26):** `/decompose M2` amendment, commit
  `PENDING`: SPEC §13's M2 wording settled; T-077 takes `0a98b15`, T-068's
  BigInt line reworded (`254bcae`), T-074 adds the note-only case; T-076
  depends on T-075 only.

- **Owner actions:**
  - Done 2026-11-26: the time-trigger check (no automation rule or time
    trigger acted on the `mcp-test` ticket left overnight; SPEC §13's M2
    wording settled as the RFC wrote it), and the choice-name check (every
    `/ticket_fields` agent and group choice name matches a list name
    exactly; `docs/improvements.md` `b80b69a`).
  - Remaining, in T-076: create the `mcp-test` tickets and run
    `make smoke-write`. No write to the real account before T-075 is
    `done`.

- **Read before anything else:** `docs/tasks/T-077-core-lint-fence.md`;
  `docs/improvements.md` entries `0a98b15` and `254bcae` (T-068's parked
  items).

- **Reviews:**
  - Full round, R1 = `0a98b15`, range `fb92725..0a98b15`. Scoped round,
    range `0a98b15..254bcae`.
  - `code-reviewer`, full: quotes correct (one no-op Bash call, admitted).
    Low: empty change sent (fixed: refused, `254bcae`); note body not
    checked as a string (fixed); tags checked then copied in a second read
    (fixed: copied once, regression test "sends the list it checked, read
    once…"); type-only test inside the loop with filler asserts (moved);
    refusal messages not pinned (pinned); overview pointed the lint fence at
    T-068 (now T-077). Info: `notSent` export fine; entries built and
    dropped by `context.ts` until T-071.
  - `security-reviewer`, full: quotes correct. Medium (latent):
    `createWritePath` trusts its caller's `toolsets`; parked for T-077/T-071
    (`0a98b15` entry). Low: tags double read, note body type (both fixed,
    `254bcae`). Info: value checks use the tool's schema; parked.
  - `compliance-reviewer`: wireframes `none`, both rounds.
  - Scoped round: `code-reviewer`'s first run misquoted the stat line
    (`4 files,`): red gate "stale diff file", re-dispatched; its rerun quoted
    correctly. `security-reviewer` and the rerun: no finding falsifying an
    acceptance line or opening a fail-open path. Parked (`254bcae` entry):
    the BigInt-note acceptance parenthetical, the note refusal's "ticket
    fields" wording, an unpinned message, an empty note body, no cap on the
    tag list.

- **Proposed plan changes:** none.

- **Open doubts:**
  - A ticket change that sets nothing is now refused in the core; T-071's
    tool should skip an empty change rather than call the entry (T-074's
    case is in its acceptance since 2026-11-26).
  - From T-067: the `getAgent` active rule comes from Freshdesk's
    documentation, not measured; `make quality` real-time tests timed out
    under machine load on 2026-11-26 (not seen this session).
  - From T-041/T-065: default fields keyed by `/ticket_fields` API name,
    to confirm at T-076 (choice-key spelling closed 2026-11-26: the names
    match exactly).
  - From T-040, unchecked: whether `agent-native-setup update` would revert
    the safety-core value in `.claude/commands/decompose.md` step 4.
  - `.claude/worktrees/` is not gitignored (parked).

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `254bcae`'s tree. Vitest
  "Tests 3086 passed (3086)"; `tools/checks` "Ran 138 tests", OK; lint,
  format, typecheck, build and both gitleaks scans passed.
