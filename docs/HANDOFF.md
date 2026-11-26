# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-26T15:50:21+01:00` (M4 plan line added; the rest as at
  `2026-11-26T15:40:36+01:00`)
- **Describes commit:** `171d6e5` (T-086: done; handoff to T-087), pushed
  to `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45841679140
  (workflow `quality`, ran on `171d6e5`: `quality (22.19)`, `quality (24)`,
  `checks` all success).

- **Current task:** T-086 `done (2026-11-26)`: `make smoke-send`. See
  `docs/tasks/T-086-smoke-send.md` "Done". Commits `6709f63` (script,
  `cli.ts --send`, Makefile target, tests, overview line), then this
  handoff commit. Started from `196a6c8`. Small decisions recorded in the
  task file: `TO` pre-checked with `onAllowList`; requester email required
  for a forward too; the GET through `context.http.requestWithRetry`
  (`src/client` unchanged); a public note's answer read at the dispatcher
  for `private`, printed `answered private yes|no|unknown`, exit 1 unless
  `no`. No `src/` change.

- **Next action:** T-087 is the owner's run on the real account (T-076
  must be `done` first). The exact commands, with placeholders, are in
  `docs/tasks/T-087-m3-real-account-run.md` "Owner commands": `make
  smoke-send CASE=reply TICKET=<ticket id>`; `CASE=forward TICKET=<ticket
  id> TO=<allow-listed internal address>`; `CASE=public-note TICKET=<ticket
  id>`; the A4 run `CASE=reply TICKET=<A4 ticket id>
  TICKET_CC=allow-listed`. Env as the server's, team file with `send`.

- **Read before anything else:** `docs/tasks/T-087-m3-real-account-run.md`;
  `scripts/smoke/send.ts` header (what each output line means).

- **Owner, open:** T-087 waits on T-076 `done` and the owner. OD-34: no npm
  release accepting `send` (any tag from `1ef27e0` on) until T-087 is
  `done`.

- **Reviews:** full round, R1 = `6709f63`, range `196a6c8..6709f63`.
  compliance-reviewer: Wireframes `none`, nothing to check.
  code-reviewer: clean; low, the `unknown` path untested (unreachable but
  for an answer over 1 MiB, recorded in Done); low, the 11-address test's
  name (dismissed: the tool's schema has no cap, the core's cap refuses);
  low, tag check re-written not reused (reason recorded in Done); low,
  stale `overview.md:52` (parked). security-reviewer: no finding at medium
  or above; low, a stale exported `TO`/`TICKET_CC` is read by make (parked,
  and the T-087 commands say to check); two info items (parked). All four
  quotes matched in all three. No fix changed code: no scoped round.

- **Proposed plan changes:** M4 decomposed 2026-11-26 (`/decompose M4`,
  PLAN "M4"): T-090 (RFC, `.mcpb`) and T-091 (spike, owner installs a
  throwaway bundle) `todo`, both may run while T-087 is open; T-092 to
  T-099 `proposed`, waiting on OD-35 to OD-42 (owner) and T-090. The M3
  next action above is unchanged.

- **Open doubts:**
  - A6's CC field names unverified; a fifth CC field is not seen by the
    script. T-087's first run shows whether the GET carries all four.
  - The GET-then-POST gap (a CC or tag changed between check and send),
    accepted on owner-made `mcp-test` tickets.
  - Carried: private notes in a forward (A5) unchecked; whether a forward
    copies existing CCs (A2/A5) unchecked, the script refuses a forward on
    a ticket with CCs; T-089's 408-in-front-of-origin question; T-076's
    C6, T-082's doubts and the older ones as in `4efcc70`'s HANDOFF.

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `6709f63`'s tree. Vitest "Test
  Files 58 passed (58)", "Tests 4824 passed (4824)"; `tools/checks` "Ran
  138 tests", OK.
