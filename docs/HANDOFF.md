# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-26T14:27:27+01:00`
- **Describes commit:** `4efcc70` (T-082: done; handoff to T-084),
  pushed to `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45829585087
  (workflow `quality`, ran on `4efcc70`: `quality (22.19)`, `quality (24)`,
  `checks` all success).

- **Current task:** T-082 `done (2026-11-26)`: the send entries in
  `src/core/write-path.ts` (`sends`: `reply_to_ticket`, `forward_ticket`,
  `add_public_note`), `forwardAllowList` wired in `src/tools/context.ts`;
  commits `a6ee82e` (owner's OD-33 text amendment), `d8b6828` (build, tests
  first), `464bec0` (review fixes). See `docs/tasks/T-082-send-entries.md`
  "Done".

- **Next action:** `/pickup` T-084 (`reply_to_ticket` tool and the `send`
  toolset registering; depends on T-082, T-083, both `done`).

- **Read before anything else:** `docs/tasks/T-084-reply-to-ticket.md`;
  `src/core/write-path.ts` header, "the send entry points"
  (`SendInput`, `SendResult`, `SendPreview`: the mint's `preview` is what
  `src/tools/confirm.ts`'s `notSent` takes); the "for T-084" entries in
  `docs/improvements.md` (`d8b6828`, `464bec0`): scrub a send failure's
  `errors[]` as `add_note` does; refuse a NaN or Infinity deadline early if
  wanted.

- **Owner decisions recorded (2026-11-26, via the orchestrator):** OD-33's
  "already used" message is now "this send_id was already used, and the
  earlier call may have sent; check the ticket before sending again" (RFC
  "Amendments", text only); its `docs/improvements.md` entry is DECIDED.

- **T-076 (owner, open):** `todo (2026-11-25)` in PLAN. Left: the
  overnight check that no time trigger acted on the `mcp-test` tickets,
  **due 2026-11-27**; then one dated yes line per case and "no automation
  rule acted" in T-076's "Done". T-087 waits on T-076 `done`.

- **Reviews:**
  - Full round, R1 = `d8b6828`, range `099c49f..d8b6828`: code-reviewer
    sound, no fail-open; low-medium: the body re-check at the confirm not
    proven before the `send_id` check (fixed); low: `confirm: undefined`
    with a `send_id`, U+2028/2029, NaN deadline (tested and documented;
    U+2028 parked for the owner); low: `Object.keys` misses non-enumerable
    and symbol keys (fixed, `Reflect.ownKeys`); low: "another key" test
    asserts no cause (fixed); naming the refused key (dismissed: a key may
    hold an address). security-reviewer: no high or medium; low: body rule
    leaves Mn/Lo/Co/Cs/Zl/Zp (parked, `/rfc`); low: a 4xx's `errors[]` may
    name an address (parked for T-084/T-085/T-088); info: allow-list held by
    reference, safe (dismissed). compliance-reviewer: Wireframes `none`.
  - Scoped round, range `d8b6828..464bec0`: code-reviewer no blocking, 2
    parkable; security-reviewer no blocking, 2 parkable; compliance
    `none`. All parked in `docs/improvements.md`. All quotes of base, HEAD,
    stat and trailer matched in both rounds.

- **Proposed plan changes:** none.

- **Open doubts:**
  - CRLF, a lone CR and LF each give one `<br>` (the RFC did not say);
    U+2028/U+2029 not refused nor turned into `<br>` (owner, `/rfc`).
  - Unknown input keys on a send entry are refused, not dropped (stricter
    than `add_note`).
  - Reply and forward answer shapes are documented, not measured (A1, A2;
    T-087 checks). A1 to A6 and the four CC field names unverified (T-087).
  - OD-34's "no release accepting `send` before T-087" has no acceptance
    line (parked since the M3 plan review).
  - Carried: `categorize_tickets` checks values only at the confirm;
    T-072/T-073/T-074 strict-input errors are the MCP SDK's text; the
    `getAgent` active rule is from documentation (T-067); `context.ts`
    passing the team's `toolsets` to `createWritePath` holds by inspection
    (T-077); default fields keyed by `/ticket_fields` API name, to confirm
    at T-076; whether `agent-native-setup update` would revert the
    safety-core value in `.claude/commands/decompose.md` step 4 (T-040);
    `.claude/worktrees/` is not gitignored (parked).

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0. Vitest "Test Files 54 passed
  (54)", "Tests 4552 passed (4552)"; `tools/checks` "Ran 138 tests", OK.
