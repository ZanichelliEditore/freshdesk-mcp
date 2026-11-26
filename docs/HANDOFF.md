# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-26T13:08:24+01:00`
- **Describes commit:** `68099ce` (T-079: done; handoff to T-080),
  pushed to `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45817113137
  (workflow `quality`, ran on `68099ce`: `quality (22.19)`, `quality (24)`,
  `checks` all success).

- **Current task:** T-079 `done (2026-11-26)`. RFC
  `docs/rfc/active/2026-11-26-send-safety-core.md` Active (owner,
  2026-11-26), acceptance commit `3ceaea1`; review fixes `607ddc4` and
  this handoff commit. SPEC §8.2, §9, §11, §13 M3 row amended; acceptance
  of T-082 to T-088 amended in PLAN and task files (rows named in the
  RFC's "Rows this RFC governs").

- **Next action:** `/pickup` T-080 (send resources: POST reply, POST
  forward; depends on T-079 only). T-080, T-081 and T-083 may go in any
  order.

- **Read before anything else:** `docs/tasks/T-080-send-resources.md`;
  the RFC (OD-24, OD-27, OD-33); PLAN section M3.

- **T-076 (owner, open):** status `todo (2026-11-25)` in PLAN as before.
  The owner's runs (C1, C8, C4, C5, C6) are done and recorded privately
  in `docs/private/account-facts.md`. Left: the overnight check that no
  time trigger acted on the `mcp-test` tickets, **due 2026-11-27**; then
  one dated yes line per case and "no automation rule acted" in T-076's
  "Done". T-087 waits on T-076 `done`.

- **Reviews:**
  - `rfc-reviewer` scoped round (2026-11-26, last per rule 9) on OD-33's
    freeing rule, the never-pruned set, OD-24's body rule and the new A4
    opt-in: 2 high, 2 low, all resolved in the RFC's "Review" (9 to 12);
    none judged a new mechanism (see Open doubts).
  - Handoff full round, R1 = `3ceaea1`, range `49736b7..3ceaea1`:
    code-reviewer 1 low (OD-34 tag rule only named T-084's commit: fixed)
    and 2 info (HANDOFF's stale `proposed/` path: rewritten here; old A4
    wording in the RFC's review log: history, kept); security-reviewer 2
    low, 1 info (a forward on a ticket with CCs, the requester check under
    the A4 flag, other flag values: all three added to T-086, fixed in
    `607ddc4`); compliance-reviewer: Wireframes `none`, nothing to check.
  - Handoff scoped round, range `3ceaea1..607ddc4`: code-reviewer 1
    (the forward CC refusal needed one case per field: added); security
    parked the same item (taken); compliance: Wireframes `none`. Parked
    notes in `docs/improvements.md` (two T-079 entries).

- **Proposed plan changes:** none.

- **Open doubts:**
  - The scoped round's finding 10 (a `send_id` has exactly one tag; the
    spent set holds the nonce) was taken as pinning OD-20's id form, not
    a mechanism change; the owner may judge otherwise.
  - OD-24's body rule lets variation selectors and Hangul fillers through
    (RFC "Not covered"); widening to `\p{Default_Ignorable_Code_Point}` is
    an owner call through `/rfc`.
  - OD-34's "no release accepting `send` before T-087" has no acceptance
    line (parked since the M3 plan review).
  - A1 to A6 and the four CC field names unverified (T-087).
  - Carried: `categorize_tickets` checks values only at the confirm;
    T-072/T-073/T-074 strict-input errors are the MCP SDK's text; the
    `getAgent` active rule is from documentation (T-067); `context.ts`
    passing the team's `toolsets` to `createWritePath` holds by inspection
    (T-077); default fields keyed by `/ticket_fields` API name, to confirm
    at T-076; whether `agent-native-setup update` would revert the
    safety-core value in `.claude/commands/decompose.md` step 4 (T-040);
    `.claude/worktrees/` is not gitignored (parked).

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0. Vitest "Test Files 50 passed
  (50)", "Tests 4044 passed (4044)"; `tools/checks` "Ran 138 tests", OK.
