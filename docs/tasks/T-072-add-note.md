# T-072 — Tool: `add_note`

- **Type:** build
- **Phase:** M2
- **Status:** todo (2026-11-25)
- **Depends on:** T-069, T-071
- **Created:** 2026-11-25

## Goal
`add_note` writes a private note on a ticket and notifies agents named by id (C4).

## In scope
- Inputs: ticket id, body, agent ids to notify; no `private`, no `notify_emails`.
- Description says the note is private and how to find agent ids (`list_agents`).

## Out of scope
- Public notes (`send`, M3).
- No release with `write` before T-074 is `done` (OD-16, owner 2026-11-25).

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §3 (C4)
- RFC `2026-11-25-write-safety-core`, invariants 4 and 5

## Files expected to change
- `src/tools/toolsets/write/add-note.ts` (new), `index.ts`
- `test/tools/write/add-note.test.ts` (new)
- `CHANGELOG.md`

## Wireframes
`none`

## Acceptance
`test/tools/write/add-note.test.ts` (MockAgent): one POST with `private: true` and the resolved emails; a `private` or `notify_emails` input is `validation` with 0 dispatches; an unresolved agent refuses the note; listed only with `write`; `make quality` green.

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
