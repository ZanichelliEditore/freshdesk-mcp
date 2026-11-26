# T-074 — Tool: `hand_off_draft`

- **Type:** build
- **Phase:** M2
- **Status:** todo (2026-11-25)
- **Depends on:** T-072, T-041
- **Created:** 2026-11-25

## Goal
`hand_off_draft` does C6 in one call: a private note headed `DRAFT REPLY`, then the ticket assigned to an agent and/or group, the agents notified.

## In scope
- Note first, then PUT (an assignment with no note hands off nothing; builder's call, `docs/improvements.md` `c928102`).
- If the PUT fails after the note was written, the result says so with the note's id; no automatic retry, no rollback.
- Its entry's set: group, agent only.
- Nothing to assign: the note only, no PUT (the core refuses an empty ticket change since `254bcae`; added by the `/decompose M2` amendment of 2026-11-26).

## Out of scope
- Freshdesk's UI reply draft (not in the public API, SPEC §3).
- No release with `write` before T-074 is `done` (OD-16, owner 2026-11-25).

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §3 (C6)
- RFC `2026-11-25-write-safety-core`, invariants 4 to 6

## Files expected to change
- `src/tools/toolsets/write/hand-off-draft.ts` (new), `index.ts`
- `test/tools/write/hand-off-draft.test.ts` (new)
- `CHANGELOG.md`

## Wireframes
`none`

## Acceptance
`test/tools/write/hand-off-draft.test.ts` (MockAgent): one POST (private, body starting with the `DRAFT REPLY` header, notify emails) then one PUT (group/agent); a note refused sends no PUT; a PUT failing after the note returns a result naming the written note and the failed assignment, no retry; a field outside group/agent `field_not_writable`; with nothing to assign (no agent and no group) it posts the note only and sends no PUT, because the core refuses an empty ticket change; `make quality` green.

No split point.

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
