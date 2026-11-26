# T-088 — Tool: `add_public_note` (`private: false`) in `send`

- **Type:** build
- **Phase:** M3
- **Status:** done (2026-11-26)
- **Depends on:** T-082, T-083, T-084, T-089
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
`test/tools/send/add-public-note.test.ts` (MockAgent): without `confirm` 0 dispatches and the "Not sent" result with a `send_id`; with `confirm: true` and that `send_id` one POST to `/tickets/{id}/notes` whose body is exactly `{body, private: false}`; `confirm: true` with no `send_id`, or one minted for another ticket, another body or another tool, 0 dispatches; a `private`, `notify_emails`, `user_id` or `incoming` input `validation` with 0 dispatches; a 5xx after the send `may_have_been_sent`, no retry; no email address in the sent result; listed with `destructiveHint` only with `send`; the description and the "Not sent" text name the ticket id first and ask the user to check it is the ticket they mean (threat 1); the description says the requester can see the note and may be emailed, that Freshdesk may also copy the ticket's existing CC addresses, which this tool does not check (OD-21), and never to "always allow" it (OD-30); `make quality` green.

No split point: one tool on the send wiring.

---
*Filled at `/handoff`:*

## Done
- `d8e144d`: `src/tools/toolsets/send/add-public-note.ts` (`addPublicNote(entry)`, strict input `{ticket_id, body, confirm?, send_id?}`), wired in `send/index.ts`; `SendKind` gains `"public note"` in `send/outcome.ts`, the shared result rule (OD-27 as amended: 408 after dispatch `may_have_been_sent`, 409 not; `errors[]` scrubbed of addresses); `eslint.tool-imports.json` T4; docs (`README.md`, `docs/tool-catalogue.md`, `docs/architecture/overview.md`, `CHANGELOG.md`); `docs/improvements.md` T-088 parts of the `eff63e8` and `d8b6828` entries marked done.
- Tests: `test/tools/send/add-public-note.test.ts` (30 tests: two calls, exact `{body, private: false}` POST, mismatched `send_id` per ticket, body and tool, refused inputs `private`/`notify_emails`/`user_id`/`incoming`/`cc`/`to`, 5xx, network, other shape, `::a 408 is may_have_been_sent, and reads timed out, not refused`, `::a 409 is Freshdesk's refusal: not may_have_been_sent, the send_id spent`, `::a 400 is Freshdesk's refusal, the addresses in its errors replaced`, registration and description); `test/server.test.ts` "the send wiring" extended to the third entry.
- `1038b08`: review fixes (tests only: body refusals pinned by kind, the network error's "public note" wording) and two items parked in `docs/improvements.md`.
- Small decisions: the name `add_public_note` kept (SPEC §8.2); the failure wording "The public note may have been sent"; the description points to `add_note` for a private note.

## Dead ends
none

## Open doubts
- A public note Freshdesk answers `private: true` is reported sent without saying so (fails safe; a check would be a core change, parked `d8e144d` entry in `docs/improvements.md`); T-087 shows what Freshdesk answers (A3).

## Context pressure
low

## Next action
none (done).
