# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-26T12:02:26+01:00`
- **Describes commit:** filled by the stamp commit. **CI:** filled by the
  stamp commit.

- **Current task:** T-075 (`make smoke-write` through the write path,
  `mcp-test` tickets only) `done (2026-11-26)`. Commit `094564e`, then this
  handoff commit (review fixes). Tests: `test/smoke-write.test.ts` (67
  cases, MockAgent). `src/**` and `eslint.config.mjs` unchanged. Nothing
  run against the real account.

- **Owner decision (2026-11-26, via the orchestrator):** the ~3 read-only
  GETs a fake or expired `preview_id` costs with a cold schema cache are
  accepted. `docs/improvements.md` `072dd91` first item marked DECIDED.

- **Next action:** T-076 is the owner's: follow the runbook below, then
  `/pickup` T-076 to record the yes lines.

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

- **Read before anything else:** `docs/tasks/T-076-m2-real-account-run.md`.

- **Reviews:**
  - Full round, R1 = `094564e`, range `2c11d84..094564e`. All four quotes
    of every reviewer checked against the diff file: correct.
  - `code-reviewer`: clean on the acceptance, 3 low, 1 info. Tags in
    FIELDS untested (fixed: C1, C5, C6 rows, nothing written); C5's GET
    count not pinned (fixed: one GET asserted); check and write not atomic
    (documented in `write.ts`'s header); `cli.ts --write` parsing untested
    (cli.ts may not be imported by tests; fails closed, dismissed). It ran
    one no-op `echo` against the read-only rule.
  - `security-reviewer`: no finding. Low/info: the same non-atomic check
    (documented).
  - `compliance-reviewer`: wireframes `none`.
  - Scoped round: not run. The fixes are tests and one comment; no
    mechanism changed (rule 9).

- **Proposed plan changes:** none.

- **Open doubts:**
  - Carried: `categorize_tickets` checks values only at the confirm;
    T-072/T-073/T-074 strict-input errors are the MCP SDK's text, not a
    `FreshdeskError` JSON; the `getAgent` active rule is from
    documentation, not measured (T-067); `context.ts` passing the team's
    `toolsets` to `createWritePath` holds by inspection (T-077); default
    fields keyed by `/ticket_fields` API name, to confirm at T-076;
    whether `agent-native-setup update` would revert the safety-core value
    in `.claude/commands/decompose.md` step 4 (T-040); `.claude/worktrees/`
    is not gitignored (parked).

- **Dead ends:** none in code; see T-075's task file (MCP session dropped
  for direct tool calls).

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0. Vitest "Test Files 50 passed
  (50)", "Tests 4044 passed (4044)"; `tools/checks` "Ran 138 tests", OK;
  lint, format, typecheck, build and both gitleaks scans passed.
