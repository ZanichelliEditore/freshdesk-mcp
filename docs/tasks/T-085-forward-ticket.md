# T-085 — Tool: `forward_ticket`

- **Type:** build
- **Phase:** M3
- **Status:** done (2026-11-26)
- **Depends on:** T-084, T-089
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
- `e4fea35`: `src/tools/toolsets/send/forward-ticket.ts` (`forwardTicket(entry)`), wired in `src/tools/toolsets/send/index.ts`; `eslint.tool-imports.json` T4 allows `./forward-ticket.js` and `./outcome.js`. Acceptance: `test/tools/send/forward-ticket.test.ts` (MockAgent, 40 tests), e.g. `forward_ticket: two calls`, `a confirm that does not match sends nothing`, `inputs it refuses, with nothing sent` (bcc, off-list to/cc, empty allow-list, no to, over 10), `registration` (description: ticket id first, content leaves Freshdesk, never always allow); `test/server.test.ts` "hands each send factory exactly its own entry point". Docs: `docs/tool-catalogue.md`, `docs/architecture/overview.md`, `CHANGELOG.md`, `README.md`.
- Shared, not duplicated (orchestrator's carry-over): `src/tools/toolsets/send/outcome.ts` (`sendOutcome`, `sendFailed(error, attempts, kind)`) now holds the result rule both tools use; `reply-to-ticket.ts` calls it. OD-27 as amended: `forward-ticket.test.ts` "a 408 is may_have_been_sent..." and "a 409 is Freshdesk's refusal...".
- Parked items taken (decided in session, small): a 408 after dispatch reads "Freshdesk timed out the request (HTTP 408)." (`775053d` item); `retry_after_s` dropped once an attempt was dispatched (`4cc147b` security item); a forward's errors[] scrubbed and no address in error results (`d8b6828`, `eff63e8` items, T-085 part). Tests: `reply-to-ticket.test.ts` "sendFailed" block, `forward-ticket.test.ts` "a 429 after a dispatch keeps no retry_after_s". Effect on `reply_to_ticket`: only these two messages/fields change.
- `b81f4cb`: review fixes (10 recipients accepted, no CC sentence on a forward's Not sent note, improvements marked).
- Not changed: `src/core/**`. `FreshdeskError` has no string key besides `message` and `errors[]` that could carry an address (`code` is an enum), so `withoutAddresses`'s scope holds (`4cc147b` item, confirmed, left open in improvements for the record).
- `docs/improvements.md`: `4cc147b`'s other items (hand-off-draft wording, `not_found` after dispatch test for reply) stay parked.

## Dead ends
none

## Open doubts
- The description says the ticket's content "and possibly its conversation" leaves Freshdesk; whether private notes go too is unchecked (RFC A5, OD-29; T-087 records it). Revisit the sentence after T-087 (security-reviewer, info).
- Whether a forward also copies the ticket's existing CCs (RFC A2/A5, unchecked): the forward's "Not sent" result carries no CC sentence, as `src/tools/confirm.ts` (T-083) decides; T-086 refuses a forward on a ticket with CCs.

## Context pressure
ok

## Next action
none
