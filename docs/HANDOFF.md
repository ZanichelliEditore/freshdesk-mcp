# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-26T15:02:56+01:00`
- **Describes commit:** `e13a983` (T-089: done; handoff to T-085),
  pushed to `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45835237284
  (workflow `quality`, ran on `e13a983`: `quality (22.19)`, `quality (24)`,
  `checks` all success).

- **Current task:** T-089 `done (2026-11-26)`: a 408 after a send's
  dispatch is `may_have_been_sent`, a 409 is not (owner decision
  2026-11-26, via the orchestrator, on T-084's open doubt). See
  `docs/tasks/T-089-408-may-have-been-sent.md` "Done". Commits
  `2cada3c` (RFC amendment, task, PLAN), `775053d` (code and tests), then
  this handoff commit. Started from `82e3593`. T-089 created this session
  by the owner's word; its PLAN row sits before T-085, and T-085 and
  T-088 now depend on it (owner's direction, 2026-11-26).

- **Next action:** `/pickup` T-085 (`forward_ticket`; depends on T-084
  and T-089, both `done`).

- **Read before anything else:** `docs/tasks/T-085-forward-ticket.md`;
  `src/tools/toolsets/send/reply-to-ticket.ts` (`sendFailed`: the rule
  for a failure after dispatch, the 408 included; its text says "The
  reply", to generalise) and `src/tools/toolsets/send/index.ts`; RFC
  `2026-11-26-send-safety-core` "Amendments" (OD-27 extended to 408);
  the `4cc147b` and `775053d` entries in `docs/improvements.md`.

- **Owner, open:** T-087 waits only on T-086. OD-34: no npm release
  accepting `send` (any tag from `1ef27e0` on) until T-087 is `done`.

- **Reviews:** `rfc-reviewer` on the amendment before code: 2 medium,
  4 low, all resolved in `2cada3c` (list in the task file). Full round,
  R1 = `775053d`, range `82e3593..775053d`: compliance-reviewer:
  Wireframes `none`, nothing to check. security-reviewer: no findings
  (core untouched, `send_id` single use intact, no address leak, no
  account value). code-reviewer: no blocking; low, the 409 test's second
  confirm checked only "no POST" (fixed: asserts the "already used"
  refusal); low, a 408's message reads "refused" then "may have been
  sent" (parked, `docs/improvements.md` `775053d`, for T-085); low, Done
  empty (filled at this handoff). All four quotes matched in all three.
  Fixes are a test assertion and docs, no mechanism changed: no scoped
  round.

- **Proposed plan changes:** none.

- **Open doubts:**
  - Whether anything in front of Freshdesk ever answers 408 after the
    origin took a POST is unchecked; the rule errs on the safe side.
  - T-076's C6 (carried): the assignment PUT set values the ticket
    already had; owner to judge whether one more C6 run is wanted.
  - Carried from T-082: CRLF/CR/LF each one `<br>`; U+2028/U+2029 neither
    refused nor `<br>` (owner, `/rfc`); unknown keys on a send entry
    refused; A1 to A6 and the four CC field names unverified (T-087);
    OD-34's release rule has no acceptance line; the older carried doubts
    (T-040, T-067, T-072 to T-074, T-077) as in `4efcc70`'s HANDOFF.

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on the handoff commit's tree.
  Vitest "Test Files 55 passed (55)", "Tests 4647 passed (4647)";
  `tools/checks` "Ran 138 tests", OK.
