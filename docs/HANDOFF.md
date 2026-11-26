# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-26T18:19:27+01:00`
- **Describes commit:** `<filled at stamp>`. **CI:** `<filled at stamp>`.

- **Current task:** T-087 `done (2026-11-26)`: M3 acceptance on the real
  account. See `docs/tasks/T-087-m3-real-account-run.md` "Done" (one dated
  line per item; values in `docs/private/account-facts.md` "T-087 test
  tickets" and "T-087 runs"). Commits `cced6b5` (results), then this
  handoff commit. Started from `54eb820`. Four owner runs of `make
  smoke-send` on 2026-11-26, all `ok, requests 2`; no automation acted;
  A1 to A4 and A6 yes, A5 partial. M3's "Done when" is met.

- **Next action:** owner's choice. (a) Decide T-087's first open doubt
  (A4 yes: reply reaches every ticket CC) before T-098; (b) confirm or
  drop proposed T-100; (c) take T-090 (RFC `.mcpb`, `todo`) or T-091
  (Desktop spike, `todo`). OD-34 is lifted by T-087 `done`: an npm release
  accepting `send` is no longer blocked by it.

- **Read before anything else:** T-087 "Open doubts";
  `docs/rfc/active/2026-11-26-send-safety-core.md` OD-21 and threat 3.

- **Reviews:** full round, R1 = `cced6b5`, range `54eb820..cced6b5`.
  compliance-reviewer: Wireframes `none`, nothing to check (it also said
  "compliance-reviewer still has to be run", a misreading of its own
  role; dismissed). security-reviewer: medium, A4 yes confirms OD-21's
  risk with Open doubts `none` (fixed: open doubt for the owner before
  T-098); low, public note to ticket CCs unchecked (fixed: open doubt);
  low, A5 private notes only in prose (fixed: open doubt, T-100); low,
  which CC field (fixed: A4 line names the three fields that held it);
  T-096's title naming an organisation, outside the range (parked,
  `docs/improvements.md`). code-reviewer: medium, A5 overstated (fixed:
  "partial", status half could not fail); medium, Open doubts `none`
  (fixed); low-medium, A1/A2 scope (fixed: "for the endpoint and the keys
  the core sends"); low, RFC "all unchecked" stale (recorded as open
  doubt, not edited: core RFC); low, A4 "guards" wording (fixed:
  "accepts"); low, template sections (fixed); low, hook line (fixed). It
  ran one Bash `grep` (read-only, no write; reported by itself). All four
  quotes matched in all three. Fixes were text only, no mechanism: no
  scoped round.

- **Proposed plan changes:** T-100 (A5 follow-up, owner action:
  forward on a ticket with a private note, reply with status read before
  and after), `proposed (2026-11-26)`, after T-087 in PLAN's M3 table.

- **Open doubts:**
  - A4 yes: production replies reach every ticket CC, unlisted ones too,
    unseen in the approval prompt. Owner decides before T-098.
  - The send RFC still says "API assumptions, all unchecked".
  - A5's private-note and status halves; public note to ticket CCs.
  - Carried: the GET-then-POST gap; T-089's 408 question; T-076's C6,
    T-082's doubts and older ones as in `4efcc70`'s HANDOFF.

- **Dead ends:** Chrome DevTools MCP to create tickets: no Freshdesk
  session (401); the owner made the tickets in the UI.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `cced6b5`'s tree. Vitest "Test
  Files 58 passed (58)", "Tests 4824 passed (4824)"; `tools/checks` "Ran
  138 tests", OK.
