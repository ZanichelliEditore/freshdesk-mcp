# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-26T13:19:41+01:00`
- **Describes commit:** `7c5bdca` (T-080: done; handoff to T-081),
  pushed to `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45818863560
  (workflow `quality`, ran on `7c5bdca`: `quality (22.19)`, `quality (24)`,
  `checks` all success).

- **Current task:** T-080 `done (2026-11-26)`: `postReply` and
  `postForward` in `src/core/resources.ts`, commits `8457bed` (resources
  and tests) and `de31ba3` (review fixes). See
  `docs/tasks/T-080-send-resources.md` "Done".

- **Next action:** `/pickup` T-081 (recipient allow-list matching in the
  core; depends on T-079 only). T-081 and T-083 may go in either order;
  T-082 waits on both.

- **Read before anything else:** `docs/tasks/T-081-recipient-allow-list.md`;
  the RFC `docs/rfc/active/2026-11-26-send-safety-core.md` (OD-22, OD-23);
  the parked "@com" entry in `docs/improvements.md` (`95d2c58`, `eff63e8`).

- **Owner decisions recorded (2026-11-26, via the orchestrator):**
  - T-079's scoped-round finding 10, the single-tag `send_id` format, is
    accepted as a format fix, not a new mechanism (closes T-079's open
    doubt).
  - OD-24's body-rule gap (variation selectors, Hangul fillers) stays
    parked (`docs/improvements.md`, `49736b7`).

- **T-076 (owner, open):** `todo (2026-11-25)` in PLAN. Left: the
  overnight check that no time trigger acted on the `mcp-test` tickets,
  **due 2026-11-27**; then one dated yes line per case and "no automation
  rule acted" in T-076's "Done". T-087 waits on T-076 `done`.

- **Reviews:**
  - Full round, R1 = `8457bed`, range `9dfdc62..8457bed`: code-reviewer
    clean, 3 low and 1 info: tickets.ts header stale (fixed); per-name
    lint cases cannot differ by name (dismissed: the task asks for one
    case per name); no fractional answer id case (added); schema in a GET
    module (info, follows `conversation`). security-reviewer 2 low: the
    loose answer passed echoed addresses up (fixed: `z.object` keeps `id`
    alone, OD-27); `id` 0 or negative accepted (fixed: `.positive()`).
    compliance-reviewer: Wireframes `none`, nothing to check.
  - Scoped round, range `8457bed..de31ba3`: code-reviewer no blocking,
    2 parkable (parked in `docs/improvements.md`, `de31ba3`) and 1 check
    asked (no other user of `sentConversation`: grep found none);
    security-reviewer clean, nothing parkable; compliance-reviewer:
    Wireframes `none`. All quotes of base, HEAD, stat and trailer matched.

- **Proposed plan changes:** none.

- **Open doubts:**
  - Reply and forward answer shapes are documented, not measured (A1,
    A2): a real answer without a positive `id` would read `server`, "may
    have been applied" (T-087 checks).
  - OD-34's "no release accepting `send` before T-087" has no acceptance
    line (parked since the M3 plan review).
  - A1 to A6 and the four CC field names unverified (T-087).
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

- **Checkpoint:** `make quality` exit 0. Vitest "Test Files 50 passed
  (50)", "Tests 4140 passed (4140)"; `tools/checks` "Ran 138 tests", OK.
