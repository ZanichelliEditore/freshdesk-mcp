# T-079 — RFC: `send` on the write path (confirm, recipients, closed keys, public note)

- **Type:** plan
- **Phase:** M3
- **Status:** todo (2026-11-26)
- **Depends on:** none (may run while T-076 is open)
- **Created:** 2026-11-26

## Goal
The decision AGENTS.md hard rule 1 asks for before the first `send` caller: a new RFC, extending `2026-11-25-write-safety-core`, that puts `reply_to_ticket`, `forward_ticket` (and the public note's design) on the write path with confirm, recipient allow-list and closed payload keys, Active by the owner's word.

## In scope
- OD-17 to OD-31 (PLAN, M3): each answered with the alternatives rejected and why; the planner's proposals are the starting point, not the answer.
- Owner's answers (2026-11-26, owner via the orchestrator): OD-20 an HMAC `send_id` (`src/tools/preview.ts`'s mechanism) bound to tool, ticket, body and recipients, a send needing `confirm: true` and a matching `send_id`; OD-21 the ticket's existing CCs ignored, and the RFC says plainly that Freshdesk may copy them on a reply; OD-26 the public note built in M3 (T-088). Where the `send_id` is checked (the core's entry, per OD-19) and how the core reaches `preview.ts`'s key without importing `src/tools/**` is for the RFC.
- API assumptions A1 to A5 (PLAN, M3) stated as unchecked; T-087 checks them.
- `rfc-reviewer` full round on the draft, at most one scoped round (AGENTS.md rule 9); the owner accepts or rejects.
- At acceptance: one dated "extended by" line in the old RFC; SPEC §8.2's `send` rows and public-note paragraph, §9's confirm and recipients rows, §11's real-account line and (OD-31) §13's M3 row worded per the answers; `make rfc-sync`.
- At acceptance: the acceptance of T-080 to T-088 re-checked against the answers; an acceptance line amended per decompose step 6 (both PLAN and the task file, rows named in the RFC); a row that must be added, dropped or re-scoped is a `/decompose M3` amendment.

## Out of scope
- Any code.
- The RFC for a ticket-create tool or any `tickets_admin` capability.

## Spec sections to read
- SPEC.md §8.2 (`send` table and public-note paragraph)
- SPEC.md §9
- RFC `2026-11-25-write-safety-core` (whole)

## Files expected to change
- `docs/rfc/proposed/<date>-send-safety-core.md` (new) → `docs/rfc/active/`
- `docs/rfc/active/2026-11-25-write-safety-core.md` (one dated line)
- `SPEC.md` §8.2, §9, §11, §13 (at acceptance only)
- `docs/tasks/PLAN.md`, the T-080 to T-088 task files (acceptance amendments only)

## Wireframes
`none`

## Acceptance
A new RFC extending `2026-11-25-write-safety-core` (per OD-17) is in `docs/rfc/active/` after `make rfc-sync`, Status Active by the owner's word (no word in session: stop at Proposed, no code); it answers OD-17 to OD-31, each with the alternatives rejected, and states A1 to A5 as unchecked assumptions; `rfc-reviewer`'s findings resolved or dismissed in it; the old RFC carries one dated "extended by" line; SPEC §8.2's `send` rows and public-note paragraph and §9's confirm and recipients rows match the answers; the acceptance of T-080 to T-088 re-checked against the answers (amended per decompose step 6, or a `/decompose` amendment if a row must change otherwise); `make quality` green.

Split point: the draft and the full `rfc-reviewer` round first, stopping at Proposed; the owner's answers, the scoped round and the acceptance commit second (as T-040).

---
*Filled at `/handoff`:*

## Done
Commits and tests, not narration.

## Dead ends
none

## Open doubts
none

## Context pressure
low | ok | tight | overflowed — and, if tight or overflowed, how it should
have been split.

## Next action
Only if the status is still `doing`: the exact first step for the next
session.
