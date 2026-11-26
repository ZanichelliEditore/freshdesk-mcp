# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-26T13:49:48+01:00`
- **Describes commit:** filled by the stamp commit. **CI:** filled by the
  stamp commit.

- **Current task:** T-083 `done (2026-11-26)`: `src/core/send-id.ts`
  (`mintSendId`, `checkSendId`, `SEND_ID_TTL_MS`), `src/tools/confirm.ts`
  (`notSent`), the `sendId` lint fence; commits `3aed115` (build, tests
  first) and `5a9173f` (review fixes). See
  `docs/tasks/T-083-confirm-result.md` "Done".

- **Next action:** `/pickup` T-082 (send entry points; depends on T-080,
  T-081, T-083, all `done`).

- **Read before anything else:** `docs/tasks/T-082-send-entries.md`; the RFC
  `docs/rfc/active/2026-11-26-send-safety-core.md`; the "for T-082"
  entries in `docs/improvements.md` (`4902607`, `3aed115`, `5a9173f`):
  mint and check only on `checkRecipients`' frozen `recipients`; call the
  check's `release` only when 0 attempts were dispatched, never on
  `http_status: null`; pass `notSent` an empty `to` for a reply and a
  public note.

- **Owner decisions recorded (2026-11-26, via the orchestrator):** `%` and
  `!` before the `@` stay allowed, the risk accepted (T-081's entry in
  `docs/improvements.md` marked DECIDED); an apostrophe in the local part
  stays allowed, confirming T-081's reading of OD-23's "quotes" as `"`
  only.

- **T-076 (owner, open):** `todo (2026-11-25)` in PLAN. Left: the
  overnight check that no time trigger acted on the `mcp-test` tickets,
  **due 2026-11-27**; then one dated yes line per case and "no automation
  rule acted" in T-076's "Done". T-087 waits on T-076 `done`.

- **Reviews:**
  - Full round, R1 = `3aed115`, range `9453774..3aed115`: code-reviewer
    medium: no test bound the mint time in the tag (fixed, mutation-
    checked); low: recipients' shape throws in mint/check (parked for
    T-082); low: SPEC §7 layout line and task In-scope drift (fixed); low:
    confirm body test is a passthrough guard (dismissed, T-082 proves the
    unescaped body). security-reviewer: no high or medium; low: confirm.ts
    hid a non-empty `to` behind the requester (fixed); low: throw on bad
    recipients (parked, same as code); low: "already used; nothing was
    sent" may mislead after a first send (parked for the owner, `/rfc`).
    compliance-reviewer: Wireframes `none`.
  - Scoped round, range `3aed115..5a9173f`: code-reviewer no blocking, 1
    parkable (a comment on `NotSentInput.to`); security-reviewer no
    blocking, 2 parkable (label mixed with addresses in `to`, fails
    closed; T-082 must pass an empty `to`); compliance-reviewer `none`.
    All parked in `docs/improvements.md`. All quotes of base, HEAD, stat
    and trailer matched.

- **Proposed plan changes:** none.

- **Open doubts:**
  - Owner: OD-33's "this send_id was already used; nothing was sent" can
    read as "no mail went out" after a send; proposed wording in
    `docs/improvements.md` (`3aed115`), a change goes through `/rfc`.
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

- **Checkpoint:** `make quality` exit 0. Vitest "Test Files 53 passed
  (53)", "Tests 4411 passed (4411)"; `tools/checks` "Ran 138 tests", OK.
