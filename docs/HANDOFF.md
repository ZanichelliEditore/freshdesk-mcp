# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-26T15:25:50+01:00`
- **Describes commit:** `14a5e08` (T-088: done; handoff to T-086), pushed
  to `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45839089153
  (workflow `quality`, ran on `14a5e08`: `quality (22.19)`, `quality (24)`,
  `checks` all success).

- **Current task:** T-088 `done (2026-11-26)`: `add_public_note` in
  `send`. See `docs/tasks/T-088-add-public-note.md` "Done". Commits
  `d8e144d` (tool, wiring, `SendKind` `"public note"`, tests, docs),
  `1038b08` (review fixes, tests only), then this handoff commit. Started
  from `5640358`. Decisions taken in session (small, recorded in the task
  file): name `add_public_note` kept; failure wording "The public note may
  have been sent"; the description points to `add_note` for a private note.

- **Next action:** `/pickup` T-086 (smoke send script; depends on T-084,
  T-085, T-088, all `done`).

- **Read before anything else:** `docs/tasks/T-086-smoke-send.md`; T-075's smoke
  write script `scripts/smoke/write.ts` and its test as the pattern;
  `src/core/recipients.ts` (T-081's matcher, reused for the A4 case);
  `docs/improvements.md` entries naming T-086 (`eff63e8`: a forward needs
  no requester email; the GET-then-POST CC gap).

- **Owner, open:** T-087 waits only on T-086. OD-34: no npm release
  accepting `send` (any tag from `1ef27e0` on) until T-087 is `done`.

- **Reviews:** full round, R1 = `d8e144d`, range `5640358..d8e144d`.
  compliance-reviewer: Wireframes `none`, nothing to check.
  security-reviewer: no findings; info, the SDK's zod "Input validation
  error" text unchecked for echoing a caller-typed value (parked).
  code-reviewer: clean; low, body-refusal tests asserted only `isError`
  (fixed `1038b08`); low, the network-error test did not pin "public note"
  (fixed `1038b08`); info, an answer `private: true` reported sent (parked,
  core change); info, stale "not built" docs (grepped, none). All four
  quotes matched in all three. Fixes are tests only, no mechanism changed:
  no scoped round.

- **Proposed plan changes:** none.

- **Open doubts:**
  - A public note Freshdesk answers `private: true` is reported sent
    without saying so (fails safe); T-087's A3 shows the answer.
  - Private notes in a forward (A5) unchecked: revisit `forward_ticket`'s
    description after T-087.
  - Whether a forward copies the ticket's existing CCs (A2/A5) unchecked;
    T-086 refuses a forward on a ticket with CCs.
  - Carried from T-089: whether anything in front of Freshdesk answers 408
    after the origin took a POST is unchecked; the rule errs safe.
  - Carried: T-076's C6 (one more run?), T-082's doubts (CRLF/U+2028,
    unknown keys, A1 to A6 and the CC field names, OD-34 acceptance line)
    and the older ones as in `4efcc70`'s HANDOFF.

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `1038b08`'s tree. Vitest "Test
  Files 57 passed (57)", "Tests 4732 passed (4732)"; `tools/checks` "Ran
  138 tests", OK.
