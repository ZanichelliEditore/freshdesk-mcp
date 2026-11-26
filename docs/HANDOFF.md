# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-26T13:32:42+01:00`
- **Describes commit:** `fd9b209` (T-081: done; handoff to T-083),
  pushed to `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45820957190
  (workflow `quality`, ran on `fd9b209`: `quality (22.19)`, `quality (24)`,
  `checks` all success).

- **Current task:** T-081 `done (2026-11-26)`: `src/core/recipients.ts`
  (`onAllowList`, `checkRecipients`, `RECIPIENT_CAP`), commits `644cb6c`
  (matcher and table test) and `4902607` (review fixes). See
  `docs/tasks/T-081-recipient-allow-list.md` "Done".

- **Next action:** `/pickup` T-083 (`send_id` in the core and the "Not
  sent" result; depends on T-079 only). T-082 waits on T-083.

- **Read before anything else:** `docs/tasks/T-083-confirm-result.md`; the RFC
  `docs/rfc/active/2026-11-26-send-safety-core.md` (OD-20, OD-32, OD-33);
  for T-082 later: `checkRecipients` returns frozen copies as
  `recipients`, and the entry must send and bind those, never the caller's
  lists (`docs/improvements.md`, `4902607`).

- **T-076 (owner, open):** `todo (2026-11-25)` in PLAN. Left: the
  overnight check that no time trigger acted on the `mcp-test` tickets,
  **due 2026-11-27**; then one dated yes line per case and "no automation
  rule acted" in T-076's "Done". T-087 waits on T-076 `done`.

- **Reviews:**
  - Full round, R1 = `644cb6c`, range `66536f3..644cb6c`: code-reviewer
    no high or medium; low "never throws" overclaimed (fixed), low list
    read twice / no copy returned (fixed), info two address grammars in
    the core (parked). security-reviewer 3 low and 1 info: can throw
    (fixed); list read twice, cap bypassable by a Proxy (fixed); `%` and
    `!` in the local part (parked, owner/`/rfc`); domain label syntax
    (info, parked). compliance-reviewer: Wireframes `none`.
  - Scoped round, range `644cb6c..4902607`: code-reviewer no blocking,
    3 parkable (revoked Proxy throws, a weakened cap test, T-082 must send
    `result.recipients`); security-reviewer no blocking, 2 parkable
    (revoked Proxy throws, copy before cap); compliance-reviewer: `none`.
    All parked in `docs/improvements.md`. All quotes of base, HEAD, stat
    and trailer matched.

- **Proposed plan changes:** none.

- **Open doubts:**
  - Owner: refuse `%` and `!` in an allow-listed local part (percent hack,
    bang paths)? OD-23 is silent; a change goes through `/rfc`.
  - An apostrophe is allowed in a local part: OD-23's "quotes" read as
    `"` only.
  - Reply and forward answer shapes are documented, not measured (A1,
    A2; T-087 checks).
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

- **Checkpoint:** `make quality` exit 0. Vitest "Test Files 51 passed
  (51)", "Tests 4246 passed (4246)"; `tools/checks` "Ran 138 tests", OK.
