# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-26T15:14:46+01:00`
- **Describes commit:** `<hash>` (T-085: done; handoff to T-088), pushed
  to `ZanichelliEditore/freshdesk-mcp`. **CI:** filled by the stamp commit.

- **Current task:** T-085 `done (2026-11-26)`: `forward_ticket` in
  `send`. See `docs/tasks/T-085-forward-ticket.md` "Done". Commits
  `e4fea35` (tool, shared `outcome.ts`, tests, docs), `b81f4cb` (review
  fixes), then this handoff commit. Started from `5ff440b`.
  Decisions taken in session (small, recorded in the task file): the
  result rule moved to `src/tools/toolsets/send/outcome.ts`, shared by
  `reply_to_ticket` and `forward_ticket` (OD-27 as amended: 408 after
  dispatch `may_have_been_sent`, 409 not); a 408 reads "timed out"; an
  error after dispatch drops `retry_after_s`.

- **Next action:** `/pickup` T-088 (`add_public_note`; depends on T-082,
  T-083, T-084, T-089, all `done`).

- **Read before anything else:** `docs/tasks/T-088-add-public-note.md`;
  `src/tools/toolsets/send/outcome.ts` (`SendKind` has `reply` and
  `forward` only: add `public note`) and `forward-ticket.ts` as the
  pattern; `src/tools/toolsets/send/index.ts`; the `d8b6828` entry in
  `docs/improvements.md` (T-088 part still open).

- **Owner, open:** T-087 waits only on T-086. OD-34: no npm release
  accepting `send` (any tag from `1ef27e0` on) until T-087 is `done`.

- **Reviews:** full round, R1 = `e4fea35`, range `5ff440b..e4fea35`.
  compliance-reviewer: Wireframes `none`, nothing to check.
  security-reviewer: no findings; info: the description does not say
  private notes may be forwarded (unchecked, A5; open doubt for T-087).
  code-reviewer: clean; low, improvements entries `4cc147b`/`775053d`
  not marked taken (fixed `b81f4cb`); low, no tool-level "exactly 10
  recipients accepted" test (added `b81f4cb`); info, the forward's Not
  sent note's missing CC sentence unasserted (added `b81f4cb`); info, the
  408 message replaced, not prefixed (by design, dismissed). All four
  quotes matched in all three. Fixes are tests and docs, no mechanism
  changed: no scoped round.

- **Proposed plan changes:** none.

- **Open doubts:**
  - Private notes in a forward (A5) unchecked: revisit
    `forward_ticket`'s description after T-087.
  - Whether a forward copies the ticket's existing CCs (A2/A5) unchecked;
    T-086 refuses a forward on a ticket with CCs.
  - Carried from T-089: whether anything in front of Freshdesk answers 408
    after the origin took a POST is unchecked; the rule errs safe.
  - Carried: T-076's C6 (one more run?), T-082's doubts (CRLF/U+2028,
    unknown keys, A1 to A6 and the CC field names, OD-34 acceptance line)
    and the older ones as in `4efcc70`'s HANDOFF.

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `b81f4cb`'s tree plus the
  improvements marks. Vitest "Test Files 56 passed (56)", "Tests 4697
  passed (4697)"; `tools/checks` "Ran 138 tests", OK.
