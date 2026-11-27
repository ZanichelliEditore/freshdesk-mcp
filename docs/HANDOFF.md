# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-27T09:59:33+01:00`
- **Describes commit:** `<hash>` (T-100: done; review fixes, proposed
  T-101, handoff). **CI:** filled by the stamp commit.

- **Current task:** T-100 `done (2026-11-27)`: A5 follow-up. See
  `docs/tasks/T-100-a5-follow-up.md` "Done"; values in
  `docs/private/account-facts.md` "T-100 step 0" to "T-100 step 2-4".
  Commits `d058501` (results), then this handoff commit. Started from
  `c95aee0`. A forward quoted no reply and no private note; a reply left
  an Open ticket Open; no automation acted.

- **Next action:** owner's choice. (a) Confirm or drop proposed T-101;
  (b) decide T-100's `fwd_emails` doubt before T-098; (c) take T-091
  (Desktop spike, `todo`), then T-090 (RFC `.mcpb`, `todo`), the order
  recommended on 2026-11-27 so the RFC starts from T-091's facts.

- **Read before anything else:** T-100 "Open doubts".

- **Owner's decisions (2026-11-27, this session):** A4 (T-087's first
  open doubt) accepted: replies copying ticket CCs is standard Freshdesk
  behaviour, ship with it; the CC warning text not wanted (needs T-101).
  T-100 sized `todo` with both checks, then taken.

- **Reviews:** full round, R1 = `d058501`, range `c95aee0..d058501`. All
  four quotes matched in all three. compliance-reviewer: Wireframes
  `none`, nothing to check. security-reviewer: medium, A4 acceptance
  unrecorded (fixed: recorded here and in T-100, T-101 proposed);
  medium, `fwd_emails` risk understated (fixed: (a) to (c) in Open
  doubts, routed to the owner before T-098, check path via `/rfc`); low,
  results generalised (fixed: configuration-scoped line). code-reviewer:
  medium, quality/hook line without evidence (fixed: names `d058501` and
  counts); medium, same A4 point (fixed); medium-low, "A5 yes in full"
  (fixed: reworded to the size of the runs); low, "each run" not met as
  written (fixed: stated); low, `fwd_emails` doubt without route (fixed);
  low, stale RFC A5 text (fixed: open doubt); low, Next action vs status
  (fixed: `done`). It made one no-op Bash `echo` (reported by itself).
  Fixes were text only, no mechanism: no scoped round.

- **Proposed plan changes:** T-101 (RFC amendment: drop the ticket-CC
  warning; may carry the A1 to A6 and A5 result pointers and the
  `fwd_emails` question), `proposed (2026-11-27)`, after T-100 in PLAN's
  M3 table.

- **Open doubts:**
  - `fwd_emails`: does a reply copy a forward's recipients? Owner
    decides before T-098 (T-100 Open doubts).
  - The send RFC's "API assumptions, all unchecked" and A5 lines are
    stale (T-087, T-100).
  - Public note to ticket CCs: not checked (T-087).
  - Carried: the GET-then-POST gap; T-089's 408 question; T-076's C6,
    T-082's doubts and older ones as in `4efcc70`'s HANDOFF.

- **Dead ends:** reply on the forward's ticket refused by the smoke
  script (`fwd_emails not empty`); reply run on a fresh ticket.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `d058501`'s tree. Vitest "Test
  Files 58 passed (58)", "Tests 4824 passed (4824)"; `tools/checks` "Ran
  138 tests", OK.
