# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-27T11:04:35+01:00`
- **Describes commit:** `<hash>` (T-090: done; scoped-round fixes,
  handoff). **CI:** filled by the stamp commit.

- **Current task:** T-090 `done (2026-11-27)`: RFC
  `docs/rfc/active/2026-11-27-mcpb-bundle.md`, Active (owner,
  2026-11-27). See `docs/tasks/T-090-rfc-mcpb.md` "Done". Commits
  `af25520` (RFC, answers, acceptance), `024c47b` (full-round fixes),
  then this handoff commit. Started from `73677cd`.

- **Next action:** `/decompose M4` amendment: size T-092 to T-099 from
  the RFC's Consequences list (one line per row; T-093 confirmed, T-092
  depends on T-093, T-098's OD-41 dependency drops). Before it, the
  owner decides T-094's build guard (Open doubts).

- **Read before anything else:** RFC `2026-11-27-mcpb-bundle`
  Consequences ("PLAN at acceptance"); T-090 "Open doubts".

- **Reviews:** `rfc-reviewer` on the draft: full round (5 medium, 5 low,
  all fixed) and scoped round (1 medium fixed: attach job `if:`; 6
  parked). Handoff full round, R1 = `af25520`, range
  `73677cd..af25520`: compliance-reviewer, Wireframes `none`, nothing
  to check; code-reviewer's first report had no quotes (stale diff
  file, red gate), redispatched: all four quotes matched; medium:
  re-check list partial, warning claim contradicting decision 4, wrong
  OD cite (fixed; the owner said bundle distribution is outside the
  RFC); lows fixed (dates, SPEC §10, provenance, parked entries).
  security-reviewer: quotes matched; medium: mcpb deps in every
  `npm ci`, provenance overclaim (fixed); lows: output and config
  inside a git tree, symlinks, exact placeholder match (fixed); no
  personal data. Scoped round, range `af25520..024c47b`, all three
  quotes matched: compliance none; code none blocking; security medium:
  hash check is transit-only (reworded, build guard to Open doubts, no
  mechanism chosen), low: git errors must refuse (fixed). Parked:
  `docs/improvements.md`. No third round.

- **Proposed plan changes:** none new. Pending: the `/decompose M4`
  amendment for T-092 to T-099; proposed T-101 (2026-11-27).

- **Open doubts:**
  - T-094's build guard against a compromised dependency (T-090).
  - OD-39 and OD-40 answered after `rfc-reviewer`'s rounds (T-090).
  - `sensitive` key storage, `${__dirname}` expansion (T-091, T-090).
  - `fwd_emails` before T-098 (T-100); send RFC's stale A-lines
    (T-087, T-100); public note to ticket CCs (T-087); carried older
    ones as in `4efcc70`'s HANDOFF.

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on the handoff commit's tree (also at
  `af25520`). Vitest "Test Files 58 passed (58)", "Tests 4824 passed
  (4824)"; `tools/checks` "Ran 138 tests", OK.
