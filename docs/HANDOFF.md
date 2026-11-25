# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-25T23:09:20+01:00`
- **Describes commit:** `a923651` (the T-041 handoff commit), pushed
  to `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45711055889
  (workflow `quality`, ran on `a923651`: `quality (22.19)`, `quality (24)`,
  `checks` all success).

- **Current task:** T-041 (`ticketInput`: agent and group by name or id)
  `done (2026-11-25)`. Commits `2ccf988` (implementation), `b80b69a`
  (review fixes), then this handoff commit. Tests:
  `test/schema/input.test.ts` "ticketInput: agent and group", and
  "ticketInput: allow sets" "hand_off_draft: takes agent and group by
  name, built as their ids". No split was needed.

- **Next action:** `/pickup` T-067 (write resources: PUT ticket, POST note,
  GET agent by id). It is the first `todo` row whose dependency, T-064, is
  `done`.

- **Owner actions:**
  - The time-trigger check on `mcp-test` tickets' activity log,
    2026-11-26, then SPEC §13's M2 wording (RFC
    `2026-11-25-write-safety-core`). T-076 waits on it. No write to the
    real account before then.
  - New, not blocking: compare the account's `/ticket_fields` agent and
    group choice keys with `/agents` `contact.name` and `/groups` `name`
    (do they fold equal?). Values in `docs/private/account-facts.md`.
    `docs/improvements.md`, `b80b69a` entry.

- **Read before anything else:** `docs/tasks/T-067-write-resources.md`,
  RFC `2026-11-25-write-safety-core` Decision.

- **Reviews:**
  - Full round, R1 = `2ccf988`, range `5ffc8dd..2ccf988`. Scoped round,
    range `2ccf988..b80b69a`. All three reviewers quoted base, HEAD, the
    stat line and the trailer correctly in both rounds.
  - `code-reviewer`, full:
    - Medium: stale comment `src/tools/ticket-query.ts:3-4` ("ticketInput
      refuses agent and group"). Fixed in `b80b69a`.
    - Medium: the "exact name still picks one" test held only with an empty
      list; with a real list an exact name folding like another listed id
      is refused. Kept the refusal (fail closed); added a test with a
      matching list, reworded the header and overview. `b80b69a`.
    - Low: status/priority/source ambiguity message now lists ids. Kept;
      asserted in `b80b69a`.
    - Low: a `{Agent: null}` assertion touched the parked null branch.
      Dropped in `b80b69a`.
  - `security-reviewer`, full:
    - Medium: a truncated agents or groups list could let a shared name
      resolve to the wrong id. Fixed: refused as `incomplete_list`, only an
      id taken (`b80b69a`, tests for both fields).
    - Low: the list check assumes choice keys and list names fold equal;
      unmeasured. Owner check (above), parked.
    - Info: an exact name refused when the list holds a folded match; same
      as code-reviewer's second medium.
  - `compliance-reviewer`: wireframes `none`, both rounds.
  - Scoped round: no finding falsifying an acceptance line or opening a
    fail-open path. Parked (`docs/improvements.md`, `b80b69a` entry): a
    test comment, two truncated-list test gaps, the untested null clear.
    The scoped `code-reviewer` made one no-op Bash call (`echo skip`),
    reported by itself.

- **Proposed plan changes:** none.

- **Open doubts:**
  - The choice-key vs list-name spelling (owner action above).
  - An agent or group with no choices now takes no id (was passed
    through); OD-4 says the account has choices for both.
  - `incomplete_list` is a new per-field code in `ticketInput`; SPEC §7.3
    names no code list.
  - From T-065: default fields keyed by `/ticket_fields` API name (`agent`,
    `group`, `ticket_type`); T-076's first real run should confirm.
  - From T-064/T-065: only `src/tools/**` is fenced off from `HttpClient`
    and `src/core/**` by lint; `ticketInput`'s set origin unchecked (both
    parked for T-068).
  - From T-040, unchecked: whether `agent-native-setup update` would
    revert the safety-core value in `.claude/commands/decompose.md` step 4.
  - `.claude/worktrees/` is not gitignored (parked).

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `b80b69a`'s tree. Vitest
  "Tests 2841 passed (2841)"; `tools/checks` "Ran 138 tests", OK; lint,
  format, typecheck, build and both gitleaks scans passed.
