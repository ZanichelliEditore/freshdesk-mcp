# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-25T22:57:20+01:00`
- **Describes commit:** `<hash>` (the T-065 handoff commit). **CI:** filled
  by the stamp commit.

- **Current task:** T-065 (per-tool allow sets; `ticketInput` with a
  required allow set) `done (2026-11-25)`. Commits `75ca50f`
  (implementation), `88763d2` (review fixes), then this handoff commit.
  Tests: `test/core/allow-sets.test.ts`, and `test/schema/input.test.ts`
  "ticketInput: allow sets". No split was needed.

- **Next action:** `/pickup` T-041 (`ticketInput`: agent and group by name
  or id). It is the first `todo` row whose dependency, T-065, is now
  `done`.

- **Owner actions:**
  - The time-trigger check on `mcp-test` tickets' activity log,
    2026-11-26, then SPEC §13's M2 wording (as written, (a) or (b), RFC
    `2026-11-25-write-safety-core`). T-076 waits on it. No write to the
    real account before then (PLAN M2, owner actions).

- **Read before anything else:** `docs/tasks/T-041-agent-group-by-name.md`, the header of
  `src/schema/input.ts` (the allow-set paragraph), `src/core/allow-sets.ts`.

- **Reviews:**
  - Full round, R1 = `75ca50f`, range `1d6a5c0..75ca50f`. All three
    reviewers quoted base, HEAD, the stat line and the trailer correctly.
  - `code-reviewer`:
    - Medium: `docs/architecture/overview.md` stale (no allow set, no
      `allow-sets.ts` entry). Fixed in `88763d2`.
    - Low: the "builds an allowed field" row for `add_note` returned early
      and asserted nothing. Fixed: rows filtered.
    - Low: a `not.toHaveProperty("body")` that could not fail. Removed.
    - Nit: the no-import regex matched any `core/`. Anchored on `../core/`.
    - Not checked by it (no Grep): whether SPEC lists `ticketInput`'s codes.
      Checked in the main session: SPEC §7.3 names only `unsupported_field`
      in prose, no code list; no change.
    - It made two no-op Bash calls (`echo`), reported by itself.
  - `security-reviewer`:
    - No high or medium findings.
    - Low: `ticketInput` checks a set's shape, not its origin; no production
      caller yet. Parked for T-068 (`docs/improvements.md`, `75ca50f`
      entry: only `src/core/**` should import `ticketInput`).
    - Informational: a getter on a set could answer differently between
      check and use. Dismissed: core sets are frozen data properties; tool
      input is JSON.
  - `compliance-reviewer`: wireframes `none`.
  - Scoped round: not run. The fixes changed docs and tests only, no
    mechanism (rule 9).

- **Proposed plan changes:** none.

- **Open doubts:**
  - Default fields are keyed by `/ticket_fields` API name (`agent`,
    `group`, `ticket_type`); a schema naming them `responder_id` /
    `group_id` would refuse them (fail closed). T-076's first real run
    should confirm (task file, "Open doubts").
  - `tags` is a flag on `AllowSet`, read by T-068's `update_ticket` entry,
    not by `ticketInput`.
  - From T-064: only `src/tools/**` is fenced off from `HttpClient` and
    `src/core/**` by lint (parked for T-068).
  - From T-040, unchecked: whether `agent-native-setup update` would
    revert the safety-core value in `.claude/commands/decompose.md` step 4.
  - `.claude/worktrees/` is not gitignored (parked).

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `88763d2`'s tree. Vitest
  "Tests 2826 passed (2826)"; `tools/checks` "Ran 138 tests", OK; lint,
  format, typecheck, build and both gitleaks scans passed.
