# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-26T14:53:41+01:00`
- **Describes commit:** `c7f0f99` (T-076: done; handoff to T-085),
  pushed to `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45833721474
  (workflow `quality`, ran on `c7f0f99`: `quality (22.19)`, `quality (24)`,
  `checks` all success).

- **Current task:** T-076 `done (2026-11-26)`: M2 acceptance on `mcp-test`
  tickets, recorded from the owner's `make smoke-write` runs and activity
  log reads (values in `docs/private/account-facts.md`, gitignored). See
  `docs/tasks/T-076-m2-real-account-run.md` "Done". Commits `6c31811`,
  then this handoff commit. Started from `f06a917`. Taken ahead of T-085
  by the owner's choice (2026-11-26).
  - Owner decision, 2026-11-26: the overnight check on the earlier
    `mcp-test` ticket (created 2026-11-25, left waiting the night of
    2026-11-25 to 2026-11-26; its activity log showed no automation or
    time trigger acted) is accepted as the time-trigger evidence for all of
    M2; the six T-076 tickets created 2026-11-26 get no overnight check of
    their own, and T-076 closed on 2026-11-26.
  - Owner's call, 2026-11-26: Freshdesk's email behaviour is out of scope
    for now.
  - SPEC §13's M2 row already held the settled wording; unchanged.

- **Next action:** `/pickup` T-085 (`forward_ticket`; depends on T-084,
  `done`).

- **Read before anything else:** `docs/tasks/T-085-forward-ticket.md`;
  `src/tools/toolsets/send/reply-to-ticket.ts` (`sendFailed`: the rule for
  a failure after dispatch, `may_have_been_sent`, to reuse) and
  `src/tools/toolsets/send/index.ts` (add the factory); T4 in
  `eslint.tool-imports.json`; the `4cc147b` entry in `docs/improvements.md`
  (drop `retry_after_s` on a spent id's `rate_limited`).

- **Owner, open:** T-087 now waits only on T-086 (T-076 is `done`). OD-34:
  no npm release accepting `send` (any tag from `1ef27e0` on) until T-087
  is `done`.

- **Reviews:** full round, R1 = `6c31811`, range `f06a917..6c31811`.
  compliance-reviewer: Wireframes `none`, nothing to check.
  security-reviewer: no findings; no account value, core not weakened.
  code-reviewer: first run misquoted the `--stat` line (dropped
  "changed"): stale diff file, red gate, dispatched again; the rerun
  quoted all four correctly. Its findings: medium, C6's yes rests on a
  no-op assignment (fixed: caveat on the yes line; owner's judgment in
  "Open doubts"); medium, hook and `make quality` not recorded in Done
  (fixed); low, Done named HANDOFF not in the range (fixed: names the
  handoff commit); low, SPEC §13 wording unverified (checked in session:
  `SPEC.md` M2 row holds the settled wording). All fixes are wording in
  the task file, no mechanism changed: no scoped round. All other quotes
  matched in every run.

- **Proposed plan changes:** none.

- **Open doubts:**
  - T-076's C6: the assignment PUT set the group and agent the ticket
    already had, so it shows the PUT accepted, not an assignment that
    changed a value; and no assignment-triggered automation had a change
    to fire on. Owner to judge whether one more C6 run with a different
    assignee is wanted.
  - Carried from T-084: `may_have_been_sent` is a boolean key on the
    error, T-085 and T-088 should follow `sendFailed`; a 408 or 409 after
    dispatch reports "send_id spent", not `may_have_been_sent`.
  - Carried from T-082: CRLF/CR/LF each one `<br>`; U+2028/U+2029 neither
    refused nor `<br>` (owner, `/rfc`); unknown keys on a send entry
    refused; A1 to A6 and the four CC field names unverified (T-087);
    OD-34's release rule has no acceptance line; the older carried doubts
    (T-040, T-067, T-072 to T-074, T-077) as in `4efcc70`'s HANDOFF.

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on the handoff commit's tree.
  Vitest "Test Files 55 passed (55)", "Tests 4644 passed (4644)";
  `tools/checks` "Ran 138 tests", OK; build and both gitleaks hooks
  passed.
