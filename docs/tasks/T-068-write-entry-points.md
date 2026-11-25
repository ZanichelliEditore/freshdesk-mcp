# T-068 — Write entry points, built only when `write` is enabled

- **Type:** build
- **Phase:** M2
- **Status:** todo (2026-11-25)
- **Depends on:** T-065, T-067
- **Created:** 2026-11-25

## Goal
The core builds one entry point per write tool (`update_ticket`, `categorize_tickets`, `hand_off_draft`'s two writes, `add_note`) only when `write` is in `team.toolsets`; each builds its ticket body through `ticketInput` with its own set, and the note entries build the note payload themselves, private always (RFC invariants 2, 3, 5, 6).

## In scope
- Entries keyed by entry point; registration hands each tool its own entry only (a tool cannot name another's set).
- With `write` absent the core returns no entries object at all.
- Note entries: no `private` input; the core sets `private: true`; the payload is built from a closed key set (body, `private`; `notify_emails` added by T-069); `user_id`, `incoming`, attachments never sent.
- Each refusal `validation`, `http_status: null`, per-field entries where a field is the cause.

## Out of scope
- Notify recipients (T-069).
- Tools and registration in `server.ts` (T-071).

## Spec sections to read
- RFC `2026-11-25-write-safety-core`, Decision, invariants 2, 3, 5, 6
- SPEC.md §9
- SPEC.md §8.2 (`write` table)

## Files expected to change
- `src/core/write-path.ts`
- `test/core/entries.test.ts` (new)
- `docs/architecture/overview.md`

## Wireframes
`none`

## Acceptance
`test/core/entries.test.ts` (MockAgent): without `write` in toolsets the core gives no entries object (and `send` gives none either); each ticket entry sends only fields of its own set, a field outside it `field_not_writable` with 0 dispatches; the note entries have no `private` input and send `private: true`; a cast-injected `private: false`, `user_id`, `incoming` or `attachments` never reaches MockAgent's body; `make quality` green.

Split point: ticket entries first, note entries second.

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
