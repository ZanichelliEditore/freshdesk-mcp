# T-088 — Tool: `add_public_note` (`private: false`) in `send`

- **Type:** build
- **Phase:** M3
- **Status:** todo (2026-11-26)
- **Depends on:** T-082, T-083, T-084
- **Created:** 2026-11-26

Sized on T-079's likely answer (PLAN, M3: the OD proposals, and the owner's answers of 2026-11-26 to OD-20, OD-21 and OD-26); its acceptance is re-checked when T-079's RFC is accepted.

## Goal
`add_public_note` exists in `send`: a public note (`private: false`) on a ticket, with confirm and `send_id` (OD-26 answered 2026-11-26, owner via the orchestrator: built in M3).

## In scope
- `src/tools/toolsets/send/add-public-note.ts` on the core's public-note entry (T-082); the name is the builder's call, confirmed at T-079's acceptance.
- Two calls with a `send_id`, as T-084 (OD-20).
- No `private`, `notify_emails`, `user_id` or `incoming` input.
- Description: the requester can see the note and may be emailed by Freshdesk; never "always allow" (OD-30).
- Result per OD-27, no address returned.

## Out of scope
- Notifying agents on a public note (`add_note` in `write` does that, privately).

## Spec sections to read
- SPEC.md §8.2 (`send` and the public-note paragraph)
- SPEC.md §9
- T-079's RFC (OD-24, OD-26)

## Files expected to change
- `src/tools/toolsets/send/index.ts`, `add-public-note.ts` (new)
- `test/tools/send/add-public-note.test.ts` (new)
- `docs/tool-catalogue.md`, `docs/architecture/overview.md`, `CHANGELOG.md`

## Wireframes
`none`

## Acceptance
`test/tools/send/add-public-note.test.ts` (MockAgent): without `confirm` 0 dispatches and the "Not sent" result with a `send_id`; with `confirm: true` and that `send_id` one POST to `/tickets/{id}/notes` whose body is exactly `{body, private: false}`; `confirm: true` with no `send_id`, or one minted for another ticket, another body or another tool, 0 dispatches; a `private`, `notify_emails`, `user_id` or `incoming` input `validation` with 0 dispatches; a 5xx after the send `may_have_been_sent`, no retry; no email address in the result; listed with `destructiveHint` only with `send`; the description says the requester can see the note and may be emailed, and never to "always allow" it (OD-30); `make quality` green.

No split point: one tool on the send wiring.

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
