# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-26T12:41:44+01:00`
- **Describes commit:** `6461738` (the M3 plan handoff commit), pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45813178960
  (workflow `quality`, ran on `6461738`: `quality (22.19)`, `quality (24)`,
  `checks` all success).

- **Current task:** `/decompose M3` (plan session, owner's go 2026-11-26,
  run by a session under the orchestrator) `done (2026-11-26)`. Commits
  `95d2c58` (M3 planned), `eff63e8` (full-round fixes), then this handoff
  commit (scoped-round fixes). PLAN `## M3 — send toolset`: T-079 to
  T-088, all `todo (2026-11-26)`; OD-17 to OD-34. Owner's answers
  (2026-11-26, via the orchestrator): OD-20 an HMAC `send_id`, OD-21 the
  ticket's existing CCs ignored, OD-26 the public note built (T-088); the
  other ODs' proposals are the RFC's starting point. Step 4: `send` goes
  through the write path, extended; T-079's RFC before any send code. No
  `src/` change.

- **Next action:** `/pickup` T-079 (the RFC; split point: stop at Proposed
  after the full `rfc-reviewer` round). T-076 stays open with the owner
  (runbook below); T-087 waits on it.

- **Read before anything else:** `docs/tasks/PLAN.md` section M3 (step-4
  note, API assumptions A1 to A6, OD-17 to OD-34);
  `docs/tasks/T-079-rfc-send-core.md`; RFC
  `docs/rfc/active/2026-11-25-write-safety-core.md`.

- **Owner runbook for T-076** (each run prints yes/no and counts only;
  keep its output and every id in `docs/private/account-facts.md`, never
  in a tracked file):
  1. Environment: the server's `FRESHDESK_DOMAIN` and `FRESHDESK_API_KEY`;
     `FRESHDESK_MCP_CONFIG` pointing at a team file outside the repo whose
     `toolsets` include `"write"` (a copy of the usual one is fine; drop
     `write` again after T-076); `FRESHDESK_HOST_OVERRIDE` unset.
  2. Create the tickets first, in the Freshdesk UI: one per run below (two
     for C1, one fresh ticket for C8), each with requester an internal
     mailbox, group `MCP Test`, tag `mcp-test`. Open each and check it is
     not marked spam (Freshdesk did mark one at creation on 2026-11-25:
     restore it with "Not spam"). Note each ticket id, and your own agent
     id (`list_agents`), in `docs/private/account-facts.md`.
  3. Runs, one per use case (`<…>` are your values; field labels and
     values as `get_ticket_schema` shows them):
     - C1: `make smoke-write CASE=C1 TICKETS=<id1>,<id2> FIELDS='{"<category field>": "<value>"}'`
     - C8: `make smoke-write CASE=C8 TICKETS=<new id> FIELDS='{"<category field>": "<value>", "<finer field>": "<value>"}'`
     - C4: `make smoke-write CASE=C4 TICKETS=<id> NOTIFY=<your agent id>`
     - C5: `make smoke-write CASE=C5 TICKETS=<id> FIELDS='{"Status": "Pending"}'`
     - C6: `make smoke-write CASE=C6 TICKETS=<id> FIELDS='{"Group": "MCP Test", "Agent": "<your name>"}' NOTIFY=<your agent id>`
     A good run ends `smoke write <case>: ok, requests N` and exits 0;
     `refused, nothing written` means the tag check stopped it.
  4. After each kind of write, open the ticket's activity log and check:
     - every case: the `mcp-test` tag is still there, and no entry after
       the write comes from an automation rule (ticket creation, ticket
       updates, time triggers), a Dispatch'r, Observer or Supervisor rule,
       or an SLA escalation;
     - C1, C8 (field PUT): only the category fields changed; status, group
       and agent unchanged;
     - C4 (private note): one private note, by your API user; the notified
       agent got the email; the requester mailbox got nothing; status
       unchanged;
     - C5 (status PUT): the status change only; record any email to the
       requester mailbox;
     - C6 (note, then assignment): one private note headed `DRAFT REPLY`,
       then the group/agent change; the requester mailbox got nothing.
  5. Leave the tickets a night and check again that no time trigger
     acted. Record one dated yes line per case and "no automation rule
     acted" in T-076's "Done".

- **Reviews:**
  - Full round, R1 = `95d2c58`, range `12afa5f..95d2c58`. Scoped round,
    range `95d2c58..eff63e8`. All four quotes of every reviewer checked
    against the diff files: correct (`code-reviewer`'s full-round trailer
    quote was missing at first; re-asked, it quoted it correctly).
  - `code-reviewer`, full: high, the `send_id` key in `src/tools` while the
    core must check it (fixed: OD-32, `src/core/send-id.ts`, the entry
    mints); high, a replayed `send_id` sends twice (fixed: OD-33 for the
    RFC, test lines in T-082/T-083); medium, "no address" vs "Not sent"
    naming recipients (fixed: "sent result"); medium, A4 uncheckable on
    CC-free tickets (fixed: unchecked by design); medium, T-086's requester
    email needs an API assumption (fixed: A6); low, T-079 scope vs
    acceptance, stale goal (fixed).
  - `security-reviewer`, full: high, smoke-send could mail a ticket CC or
    an off-list requester (fixed in T-086); high, `send_id` checked outside
    the core (fixed, OD-32); medium, replay (OD-33); medium, `send` enabled
    by a team file before T-087 (OD-34); low items: two T-081 cases added,
    two parked (improvements `95d2c58`).
  - `compliance-reviewer`: wireframes `none`, both rounds.
  - Scoped round, both `code-reviewer` and `security-reviewer`: two
    fail-open items, fixed in this handoff commit: T-086 and A6 now name
    the four CC fields (`cc_emails`, `fwd_emails`, `reply_cc_emails`,
    `ticket_cc_emails`, names unverified); OD-33(b) reserves the id at the
    check, before dispatch, and T-082 tests two concurrent confirms (one
    POST). Also fixed: T-085 refuses `confirm` with no `send_id`; OD-32's
    reason toned to "needed, not sufficient"; stale context lines. The
    rest parked (improvements `eff63e8`). **Rule 9:** the OD-33 fix refines
    a mechanism the RFC has yet to decide; no third round opened; said to
    the owner.

- **Proposed plan changes:** none (T-088 sized `todo` in this plan).

- **Open doubts:**
  - The four CC field names and A1 to A6 come from the planner's and
    reviewers' knowledge of the Freshdesk v2 API, not from this repo or a
    probe; T-079's RFC states them as unchecked, T-087 checks them.
  - OD-32 puts a second per-process HMAC key in `src/core/send-id.ts`
    rather than reusing `preview.ts`'s key: same mechanism as OD-20's
    answer, a different module; the owner confirms at T-079.
  - OD-33(b) is per-process server state, a departure from OD-15's
    no-server-state choice for previews; for the RFC.
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
  (50)", "Tests 4044 passed (4044)"; `tools/checks` "Ran 138 tests", OK;
  lint, format, typecheck, build and both gitleaks scans passed.
