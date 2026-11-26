# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-26T08:51:48+01:00`
- **Describes commit:** filled by the stamp commit. **CI:** filled by the
  stamp commit.

- **Current task:** T-067 (write resources: PUT ticket, POST note, GET
  agent by id) `done (2026-11-26)`. Commits `85f48fd` (implementation),
  `deceac6` (review fixes), then this handoff commit. Tests:
  `test/core/resources.test.ts`, `test/client/resources/agents.test.ts`
  "getAgent" (there, not in `test/core/resources.test.ts` as the acceptance
  line says: see the task file's "Done"), `test/lint-rules.test.ts` "eslint:
  only src/core/** imports src/core/resources". No split was needed.

- **Next action:** `/pickup` T-068 (write entry points, built only when
  `write` is enabled). It is the first `todo` row whose dependencies,
  T-065 and T-067, are `done`.

- **Owner actions:**
  - The time-trigger check on `mcp-test` tickets' activity log,
    2026-11-26, then SPEC §13's M2 wording (RFC
    `2026-11-25-write-safety-core`). T-076 waits on it. No write to the
    real account before then.
  - Not blocking (owner decision, orchestrator 2026-11-25): compare the
    account's `/ticket_fields` agent and group choice keys with `/agents`
    `contact.name` and `/groups` `name` (do they fold equal?). Values in
    `docs/private/account-facts.md`. `docs/improvements.md`, `b80b69a`
    entry.

- **Owner decisions recorded (orchestrator, 2026-11-25):**
  - No SPEC line for `incomplete_list` (T-041's per-field code): SPEC
    §7.3 lists no codes.
  - The choice-name spelling check above is a non-blocking owner action.

- **Read before anything else:** `docs/tasks/T-068-write-entry-points.md`, RFC `2026-11-25-write-safety-core` Decision,
  `docs/improvements.md` entries `85f48fd` and `deceac6` (T-068's parked
  items).

- **Reviews:**
  - Full round, R1 = `85f48fd`, range `1977388..85f48fd`. Scoped round,
    range `85f48fd..deceac6`. All three reviewers quoted base, HEAD, the
    stat line and the trailer correctly in both rounds.
  - `code-reviewer`, full (transcript still for 2 minutes once: redo
    started in the main session, agent left running; its late report
    agreed with the redo):
    - Low: `getAgent`'s tests are not in the file the acceptance names.
      Kept where they are (the resource's test file); recorded in the task
      file's "Done" and here.
    - Low: the 429 test checked one retry only. Added "gives up after four
      429s" (`deceac6`).
    - Info: the lint regex is broader than the comment said. Comment now
      says broad on purpose (`deceac6`).
    - Info: the `6e7674f` improvement (write resources must use
      `requestWithRetry`) is met. Noted in `docs/improvements.md`.
  - `security-reviewer`, full: the first run ended on an API error (the
    machine slept); rerun on the same diff file. It grew slowly for about
    4 h without a 2-minute stall; a main-session redo was started at about
    2.5 h and found the same body issue (as Info). Its report:
    - Medium: the body was passed by reference and serialised per attempt,
      so a 429 retry could send another body (a getter, `toJSON`, a later
      change). Fixed: one JSON snapshot in `write()`, regression test
      "sends the body as it read at the call on every attempt" (failed
      before the fix), `deceac6`. This changed a mechanism, hence the
      scoped round.
    - Low: a re-export of `src/core/resources` from inside `src/core/**`
      escapes the rule. Named as not claimed in the header and overview;
      parked for T-068.
    - Low/Info: `getAgent`'s email is not shape-checked. Parked for T-069.
  - `compliance-reviewer`: wireframes `none`, both rounds.
  - Scoped round: no finding falsifying an acceptance line or opening a
    fail-open path. Parked (`docs/improvements.md`, `deceac6` entry): a
    non-object `toJSON` snapshot, a rejected promise T-068 must catch, an
    untested `toJSON`/Proxy claim, the `undefined`-`toJSON` wording.

- **Proposed plan changes:** none.

- **Open doubts:**
  - The `getAgent` active rule comes from Freshdesk's documentation
    (`contact.active`, plus `deactivated` when present), not measured on
    the account; T-076's first real run or a GET-only probe should confirm.
  - `make quality` timed out on real-time tests under machine load on
    2026-11-26 (twice, different tests each time), green on the third run
    with no change; they pass alone. Watch for it on a busy machine.
  - From T-041: the choice-key vs list-name spelling (owner action above);
    an agent or group with no choices takes no id.
  - From T-065: default fields keyed by `/ticket_fields` API name; T-076's
    first real run should confirm.
  - From T-064/T-065: only `src/tools/**` is fenced off from `HttpClient`
    and `src/core/**` by lint; `ticketInput`'s set origin unchecked (both
    parked for T-068).
  - From T-040, unchecked: whether `agent-native-setup update` would
    revert the safety-core value in `.claude/commands/decompose.md` step 4.
  - `.claude/worktrees/` is not gitignored (parked).

- **Dead ends:** WebFetch of Freshdesk's API page (cut before the Agents
  section); the raw HTML with `curl` had it.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `deceac6`'s tree. Vitest
  "Tests 2993 passed (2993)"; `tools/checks` "Ran 138 tests", OK; lint,
  format, typecheck, build and both gitleaks scans passed.
