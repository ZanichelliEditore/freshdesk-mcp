# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-26T10:19:48+01:00`
- **Describes commit:** `ce9e57e` (the T-070 handoff commit), pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45791102184
  (workflow `quality`, ran on `ce9e57e`: `quality (22.19)`, `quality (24)`,
  `checks` all success).

- **Current task:** T-070 (stateless preview and `preview_id`)
  `done (2026-11-26)`. Commits `70be151` (implementation), `f64d743`
  (full-round fixes), `250d476` (TTL back on `Date.now()`), then this
  handoff commit. Tests: `test/tools/preview.test.ts` (57 cases); details in
  the task file's "Done". No split was needed.

- **Next action:** `/pickup` T-071 (`update_ticket` and the `write` toolset
  registration), the first `todo` row whose dependencies (T-041, T-068) are
  `done`.

- **Read before anything else:** `docs/tasks/T-071-update-ticket.md`;
  `docs/improvements.md` entries `70be151` and `f64d743` (T-070's parked
  items, for T-073) and `a57ef9b` (now marked taken into T-072/T-074).

- **Owner decisions (orchestrator for the owner, 2026-11-26):**
  - No ticket-existence GET before the notify lookups: the limiter bounds
    the cost (`a57ef9b` entry marked DECIDED).
  - T-072 and T-074 return only allow-listed fields of Freshdesk's note
    reply, with a test that no email ever appears in tool output; this
    settles `a57ef9b`'s "note reply may repeat recipients" (marked TAKEN).
  - Rule 9 stop on T-070's scoped round: option (b), the TTL on
    `Date.now()` as in `70be151`; a wall clock set back stretches the TTL,
    an accepted limitation (module header, task file); no third review
    round, since this is the mechanism the full round reviewed.

- **Reviews:**
  - Full round, R1 = `70be151`, range `2829202..70be151`. Scoped round,
    range `70be151..f64d743`. All three reviewers quoted base, HEAD, stat
    line and trailer correctly in both rounds.
  - `security-reviewer`, full: no high/medium. Wall-clock TTL stretched by
    a clock set back (fixed by a monotonic clock in `f64d743`, then reverted
    by the owner's decision); a throwing getter/Proxy threw instead of being
    refused (fixed); only `ticket_id`/`fields` authenticated and
    `canonical`'s `undefined`/`-0` (parked for T-073).
  - `code-reviewer`, full: clean. `improvements.md` edit out of the task
    (dismissed: the orchestrator asked for it); `canonical` cohesion and
    the 834-character id (parked); overview list.ts entry, future-time
    message, prefix compare (fixed).
  - `compliance-reviewer`: wireframes `none`, both rounds.
  - Scoped round: `security-reviewer` nothing blocking (item read twice,
    unreachable branch, replaceable `performance`: parked). `code-reviewer`:
    the monotonic clock does not count sleep, falsifying "older than
    15 minutes is refused"; its fix was a mechanism change, so the session
    stopped (rule 9) and the owner chose (b), applied in `250d476`. Its
    parkables: fake-timer leak (fixed with the revert), "not JSON" wording
    (parked).

- **Proposed plan changes:** none.

- **Open doubts:**
  - T-073 must write only the checked `ticket_id` and `fields`, from the
    parsed values; the id at the cap is 834 characters (`70be151`,
    `f64d743` in improvements).
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

- **Dead ends:** a monotonic mint time (`f64d743`): it does not count
  sleep; reverted in `250d476`.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `250d476`'s tree. Vitest
  "Tests 3754 passed (3754)"; `tools/checks` "Ran 138 tests", OK; lint,
  format, typecheck, build and both gitleaks scans passed.
