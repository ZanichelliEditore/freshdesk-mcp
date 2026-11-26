# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-26T09:17:13+01:00`
- **Describes commit:** (filled by the stamp commit). **CI:** (filled by
  the stamp commit).

- **Current task:** T-068 (write entry points, built only when `write` is
  enabled) `done (2026-11-26)`. Commits `0a98b15` (implementation),
  `254bcae` (review fixes), then this handoff commit. Tests:
  `test/core/entries.test.ts` (new), `test/core/resources.test.ts` (the
  non-object snapshot and the unserialisable body); details in the task
  file's "Done". No split was needed.

- **Next action:** `/pickup` T-077 (lint fence: the client, the limiter and
  `ticketInput` stay in the core). It is the first `todo` row; its
  dependency T-068 is `done`. Consider there the parked `0a98b15` item
  (fence calls to `createWritePath` outside `src/tools/context.ts`): it is
  not in T-077's acceptance, so taking it is a `/decompose` decision.

- **Owner actions:**
  - The time-trigger check on `mcp-test` tickets' activity log,
    2026-11-26, then SPEC §13's M2 wording (RFC
    `2026-11-25-write-safety-core`). T-076 waits on it. No write to the
    real account before then.
  - Not blocking: compare the account's `/ticket_fields` agent and group
    choice keys with `/agents` `contact.name` and `/groups` `name`
    (`docs/improvements.md`, `b80b69a` entry; values in
    `docs/private/account-facts.md`).

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
  - T-068's acceptance says the BigInt note body is refused "so `write()`'s
    snapshot throws"; since `254bcae` the string check refuses it first
    (outcome holds; the snapshot path is tested elsewhere). Owner may want
    the wording amended.
  - A ticket change that sets nothing is now refused in the core; T-071's
    tool and T-074's `hand_off_draft` should skip an empty assignment
    rather than call the entry.
  - From T-067: the `getAgent` active rule comes from Freshdesk's
    documentation, not measured; `make quality` real-time tests timed out
    under machine load on 2026-11-26 (not seen this session).
  - From T-041/T-065: choice-key spelling (owner action); default fields
    keyed by `/ticket_fields` API name, to confirm at T-076.
  - From T-040, unchecked: whether `agent-native-setup update` would revert
    the safety-core value in `.claude/commands/decompose.md` step 4.
  - `.claude/worktrees/` is not gitignored (parked).

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `254bcae`'s tree. Vitest
  "Tests 3086 passed (3086)"; `tools/checks` "Ran 138 tests", OK; lint,
  format, typecheck, build and both gitleaks scans passed.
