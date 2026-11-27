# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-27T10:25:23+01:00`
- **Describes commit:** `c69e044` (T-091: done; review fixes, handoff),
  pushed to `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45973786035
  (workflow `quality`, ran on `c69e044`: `quality (22.19)`, `quality (24)`,
  `checks` all success).

- **Current task:** T-091 `done (2026-11-27)`: Claude Desktop facts from
  a throwaway bundle. See `docs/tasks/T-091-spike-desktop-facts.md`
  "Done". Commits `c40ec85` (results), then this handoff commit. Started
  from `dad54e7`. Desktop `7.37095.0`, macOS `27.2.1`: Node `v24.22.3`
  (Desktop's Electron Node); an empty optional `user_config` field
  arrives as the literal `${user_config.<name>}`; `file` and `directory`
  work; the `sensitive` dummy not found in plain text.

- **Next action:** owner's choice. (a) T-090 (RFC `.mcpb`, `todo`), now
  with T-091's facts; (b) confirm proposed T-093 (its trigger is met:
  T-091 Done, "T-093's trigger"); (c) confirm or drop proposed T-101;
  (d) decide T-100's `fwd_emails` doubt before T-098.

- **Read before anything else:** T-091 "Done" and "Open doubts".

- **Reviews:** full round, R1 = `c40ec85`, range `dad54e7..c40ec85`. All
  four quotes matched in all three. compliance-reviewer: Wireframes
  `none`, nothing to check. code-reviewer: no blocking finding; low,
  `make quality` a pointer not a result (fixed: counts written); low,
  `sensitive` hit attribution an inference (fixed: open doubt, the
  installed folder gone after uninstall so not countable); low, status
  `doing` with Done filled (fixed: `done`, Context pressure, Next
  action). It made one read-only `git grep` Bash call (reported by
  itself). security-reviewer: low, placeholder risk not called
  fail-closed and T-093 impact understated (fixed: fail-closed lines
  with `src/config.ts:206` and `export-tickets.ts:247`, T-093 guard);
  low, `sensitive` "yes" stronger than an ASCII search (fixed:
  reworded, recheck before T-090/T-092 in Open doubts); info, no
  personal data. Fixes were text only, no mechanism: no scoped round.

- **Proposed plan changes:** none new. Existing proposed rows: T-101
  (2026-11-27); T-093, whose condition T-091 met (not changed: status is
  `/decompose`'s).

- **Open doubts:**
  - T-091: where Desktop stores the `sensitive` value; the unfiltered
    `manifest.json` hit not counted; `compatibility.runtimes.node` not
    tested.
  - `fwd_emails`: does a reply copy a forward's recipients? Owner
    decides before T-098 (T-100 Open doubts).
  - The send RFC's "API assumptions, all unchecked" and A5 lines are
    stale (T-087, T-100).
  - Public note to ticket CCs: not checked (T-087).
  - Carried: the GET-then-POST gap; T-089's 408 question; T-076's C6,
    T-082's doubts and older ones as in `4efcc70`'s HANDOFF.

- **Dead ends:** the first `sensitive` search hit the probe's own
  `manifest.json` (the dummy was in a field description); rerun with
  `--exclude=manifest.json`.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `c40ec85`'s tree. Vitest "Test
  Files 58 passed (58)", "Tests 4824 passed (4824)"; `tools/checks` "Ran
  138 tests", OK.
