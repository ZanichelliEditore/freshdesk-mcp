# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-26T12:53:40+01:00`
- **Describes commit:** `708a751` (T-079 first half: RFC draft at
  Proposed), pushed to `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45814896378
  (workflow `quality`, ran on `708a751`: `quality (22.19)`, `quality (24)`,
  `checks` all success).

- **Current task:** T-079 `doing (2026-11-26)`, first half done (plan
  session under the orchestrator, owner's go 2026-11-26). RFC
  `docs/rfc/proposed/2026-11-26-send-safety-core.md`, Status Proposed:
  answers OD-17 to OD-34, OD-20/21/26 recorded as decided, A1 to A6
  unchecked, threat model (injection, "always allow", OD-21's CCs). Full
  `rfc-reviewer` round done and resolved in the RFC's "Review". No SPEC,
  no `src/` change; not Active.

- **Next action:** `/pickup` T-079, second half, in this order:
  1. the owner's answers: confirm or change every **proposed** OD in the
     RFC (OD-17 to 19, 22 to 25, 27 to 34), say yes/no to the optional A4
     test (OD-21's question) and to OD-31's SPEC §13 wording; record them
     in the RFC as "The owner's decisions (<date>)";
  2. scoped `rfc-reviewer` round on the three mechanism changes of the
     full round only (OD-33 release rule, OD-33 no pruning, OD-24 body
     rule), AGENTS.md rule 9;
  3. the acceptance commit: Status Active, `make rfc-sync`, one dated
     "Extended by" line in `docs/rfc/active/2026-11-25-write-safety-core.md`
     naming the RFC's three points; SPEC §8.2, §9, §11 per the RFC's "SPEC
     wording at acceptance", §13 only by the owner's word on OD-31; T-080
     to T-088 acceptance amended per the RFC's "Rows this RFC governs"
     (PLAN and task files); T-079 `done (<date>)`.
  T-076 stays open with the owner (runbook below); T-087 waits on it.

- **Read before anything else:** the RFC (whole);
  `docs/tasks/T-079-rfc-send-core.md`; PLAN section M3.

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
  - `rfc-reviewer`, full round, 2026-11-26, on the first draft: 0 high,
    5 medium, 3 low, all resolved; list in the RFC's "Review". Findings 1
    (4xx frees a `send_id`, checked: `src/client/errors.ts` maps 4xx to
    `validation`) and 3 (core already refuses `\p{Cc}`/`\p{Cf}`,
    `src/core/write-path.ts` `EMAIL`) checked against the code: correct.
  - code/security/compliance reviewers: not run (docs-only first half;
    they run at T-079's acceptance commit if the owner's answers change
    rows).

- **Proposed plan changes:** none (row amendments listed in the RFC, to
  apply at acceptance).

- **Open doubts:**
  - A1 to A6 and the four CC field names are unverified (T-087 checks
    them; A4 not at all unless the owner takes OD-21's optional test).
  - OD-33's spent set is the first per-process server state besides the
    limiter; never pruned by design (finding 2).
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
  (50)", "Tests 4044 passed (4044)"; `tools/checks` "Ran 138 tests", OK.
