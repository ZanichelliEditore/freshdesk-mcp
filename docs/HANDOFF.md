# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-26T09:47:04+01:00`
- **Describes commit:** `ed45c7a` (the T-077 handoff commit), pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45786238906
  (workflow `quality`, ran on `ed45c7a`: `quality (22.19)`, `quality (24)`,
  `checks` all success).

- **Current task:** T-077 (lint fence: the client, the limiter and
  `ticketInput` stay in the core) `done (2026-11-26)`. Commits `c54585d`
  (implementation), `da16547` (full-round fixes), `f0edde0` (owner-approved
  fix), then this handoff commit. Tests: `test/lint-rules.test.ts`, describe
  "the client, the limiter, ticketInput and createWritePath stay in the
  core", and "lists no src/core path for any place"; details in the task
  file's "Done". No split was needed.

- **Next action:** `/pickup` T-069 (notify recipients by agent id). It is
  the first `todo` row; its dependency T-068 is `done`.

- **Read before anything else:** `docs/tasks/T-069-notify-agents.md`;
  `docs/improvements.md` entry `85f48fd` (the `getAgent` email item parked
  for T-069).

- **Reviews:**
  - Full round, R1 = `c54585d`, range `8a579a9..c54585d`. Scoped round,
    range `c54585d..da16547`. Owner-approved fix, range
    `da16547..f0edde0`.
  - All reviewers quoted base, HEAD, stat line and trailer correctly in
    every round.
  - `code-reviewer`, full: exempt modules could re-export the other class
    (fixed, `da16547`); absolute place entries unchecked (fixed); checks
    that could only pass (negative cases added); no exact sweep for
    `ticketInput` (added); `ticketInput` message wording and the test header
    (fixed).
  - `security-reviewer`, full: literal dynamic `import()` bypassed three
    fences (Medium, fixed); `SmokeClient` importable (fixed); an exempt
    module could export an alias (fixed); absolute or `file:` place entries
    unchecked (fixed); the `toolsets` claim (now said to hold by
    inspection).
  - `compliance-reviewer`: wireframes `none`, both rounds.
  - Scoped round: `code-reviewer` and `security-reviewer` both found that
    `context.ts` could pass `createWritePath` on under a name set at the
    import, or as a namespace: a fail-open path. Fixing it changed a
    mechanism again, so the session stopped and reported (rule 9). **Owner's
    decision (2026-11-26, via the orchestrator):** apply the fix (blanket
    export-list ban on `context.ts`, tests for both snippets, true header
    and overview claims) without a third full round; `security-reviewer`
    only, scoped to the fix. It found no fail-open path and no falsified
    acceptance line (`f0edde0`).
  - Parked: `docs/improvements.md` entry `f0edde0` (`export default` /
    `export =` in an exempt module, template-literal `import()`,
    percent-encoded `file:` entry, mixed type list comment, double message
    in tools).

- **Proposed plan changes:** none.

- **Open doubts:**
  - That `context.ts` passes the team file's `toolsets` to
    `createWritePath` holds by inspection, not by lint (T-071 wires the
    entries from it).
  - From T-068: a ticket change that sets nothing is refused in the core;
    T-071's tool should skip an empty change rather than call the entry.
  - From T-067: the `getAgent` active rule comes from Freshdesk's
    documentation, not measured; real-time tests timed out under machine
    load on 2026-11-26 (not seen this session).
  - From T-041/T-065: default fields keyed by `/ticket_fields` API name, to
    confirm at T-076.
  - From T-040, unchecked: whether `agent-native-setup update` would revert
    the safety-core value in `.claude/commands/decompose.md` step 4.
  - `.claude/worktrees/` is not gitignored (parked).

- **Dead ends:** name-based selectors for `context.ts`'s exports
  (`da16547`): a name set at the import passed; replaced by refusing the
  export list (`f0edde0`).

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `f0edde0`'s tree. Vitest
  "Tests 3649 passed (3649)"; `tools/checks` "Ran 138 tests", OK; lint,
  format, typecheck, build and both gitleaks scans passed.
