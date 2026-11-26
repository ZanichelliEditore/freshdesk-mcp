# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-26T11:43:07+01:00`
- **Describes commit:** `b5d284c` (the T-078 handoff commit), pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45804059023
  (workflow `quality`, ran on `b5d284c`: `quality (22.19)`, `quality (24)`,
  `checks` all success).

- **Current task:** T-078 (`categorize_tickets` confirm binding,
  `may_have_been_applied`) `done (2026-11-26)`. Commits `edca65b` (result
  state and count, the split point), `072dd91` (confirm bound to the API
  name), then this handoff commit (review fixes). Tests:
  `test/tools/write/categorize-tickets.test.ts` (36 cases), describe "the
  confirm is bound to the API names the preview resolved" and the two
  `may_have_been_applied` cases. `src/core/**` and `src/tools/preview.ts`
  unchanged. No version bump or release. MockAgent only.

- **Owner decision (2026-11-26, via the orchestrator):** a second confirm of
  a `may_have_been_applied` ticket is not refused: it would need server
  state against OD-15, and it is the same case as the repeat confirms
  already accepted. `docs/improvements.md` `3b3bec6` marked DECIDED.

- **Next action:** `/pickup` T-075 (`todo`, its dependencies now done).

- **Read before anything else:** `docs/tasks/PLAN.md` row T-075 and its
  task file `docs/tasks/T-075-smoke-write.md`.

- **Reviews:**
  - Full round, R1 = `072dd91`, range `a4d54b9..072dd91`. All four quotes
    of every reviewer checked against the diff file: correct.
  - `code-reviewer`: clean, 4 low/info. Relabel test did not pin which check
    refused (fixed: asserts no `errors`, the tag check); confirm refusal
    after a cold schema load reports no `api_calls_used` (open doubt,
    parked `072dd91`); CHANGELOG overclaimed "added" (fixed); note wording
    "tickets are may_have_been_applied" (fixed).
  - `security-reviewer`: no finding blocking; no core bypass, no fail-open,
    read-once guarantee holds. Low, cold-cache schema load before the id
    check (same as code's, parked `072dd91`); info, tags do not cover a
    field's type or choices (pre-existing, parked `072dd91`).
  - `compliance-reviewer`: wireframes `none`.
  - Scoped round: not run. The fixes change no mechanism (one test
    assertion, CHANGELOG and note wording), so rule 9's scoped round does
    not apply.

- **Proposed plan changes:** none.

- **Open doubts:**
  - A bogus or expired `preview_id` with a cold schema cache costs about 3
    read-only GETs before it is refused (the keys must resolve before the
    tags can be checked); parked `072dd91`.
  - Carried: `categorize_tickets` checks values only at the confirm (tools
    cannot import `ticketInput`); T-072/T-073/T-074 strict-input errors are
    the MCP SDK's text, not a `FreshdeskError` JSON; the `getAgent` active
    rule is from documentation, not measured (T-067); `context.ts` passing
    the team's `toolsets` to `createWritePath` holds by inspection (T-077);
    default fields keyed by `/ticket_fields` API name, to confirm at T-076;
    whether `agent-native-setup update` would revert the safety-core value
    in `.claude/commands/decompose.md` step 4 (T-040); `.claude/worktrees/`
    is not gitignored (parked).

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on the handoff tree. Vitest "Test
  Files 49 passed (49)", "Tests 3977 passed (3977)"; `tools/checks` "Ran
  138 tests", OK; lint, format, typecheck, build and both gitleaks scans
  passed.
