# T-085 — Tool: `forward_ticket`

- **Type:** build
- **Phase:** M3
- **Status:** todo (2026-11-26)
- **Depends on:** T-084
- **Created:** 2026-11-26

Sized on T-079's likely answer (PLAN, M3: the OD proposals, and the owner's answers of 2026-11-26 to OD-20, OD-21 and OD-26); its acceptance is re-checked when T-079's RFC is accepted.

## Goal
`forward_ticket` exists in `send`: a forward to allow-listed internal addresses, with confirm.

## In scope
- `src/tools/toolsets/send/forward-ticket.ts` on its own entry.
- Two calls with a `send_id`, as T-084 (OD-20).
- Description: the ticket's content leaves Freshdesk (OD-29); never "always allow" (OD-30).
- Result per OD-27, no address returned.

## Out of scope
- Stripping the conversation from a forward (OD-29).

## Spec sections to read
- SPEC.md §8.2 (`send`)
- SPEC.md §9
- T-079's RFC

## Files expected to change
- `src/tools/toolsets/send/index.ts`, `forward-ticket.ts` (new)
- `test/tools/send/forward-ticket.test.ts` (new)
- `docs/tool-catalogue.md`, `docs/architecture/overview.md`, `CHANGELOG.md`

## Wireframes
`none`

## Acceptance
`test/tools/send/forward-ticket.test.ts` (MockAgent): without `confirm` the "Not sent" result with a `send_id` and 0 dispatches; with `confirm: true` and that `send_id` one POST to `/forward` holding only allow-listed `to` and `cc`; a `send_id` minted for other recipients or another body, `confirm: true` with no `send_id`, an off-list address, a `bcc` or an empty allow-list gives 0 dispatches; the description and the "Not sent" text name the ticket id first and ask the user to check it is the ticket they mean (threat 1); the description says the ticket's content leaves Freshdesk (OD-29) and never to "always allow" it; no address in the sent result; `make quality` green.

No split point: one tool on an existing wiring.

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
