# T-084 — Tool: `reply_to_ticket`, and the `send` toolset registers

- **Type:** build
- **Phase:** M3
- **Status:** done (2026-11-26)
- **Depends on:** T-082, T-083
- **Created:** 2026-11-26

Sized on T-079's likely answer (PLAN, M3: the OD proposals, and the owner's answers of 2026-11-26 to OD-20, OD-21 and OD-26); its acceptance is re-checked when T-079's RFC is accepted.

## Goal
`reply_to_ticket` exists and `send` is a toolset the server registers: `server.ts` stops refusing `send`; each send tool is a factory handed its own entry point.

## In scope
- `src/tools/toolsets/send/index.ts` (wiring), `reply-to-ticket.ts`; `context.ts` builds the send tools from its write path's send entries.
- MCP annotations (`destructiveHint`, `openWorldHint`).
- Description and `README.md`: never "always allow" the `send` tools (OD-30); Freshdesk automations may act on a reply.
- Two calls: without `confirm` the "Not sent" result and a `send_id`; with `confirm: true` and that `send_id`, the send (OD-20).
- Description: Freshdesk may copy the ticket's existing CCs on a reply (OD-21).
- Result per OD-27, no address returned.

## Out of scope
- `forward_ticket` (T-085), the public note (T-088).
- The Italian operator guide (M4).

## Spec sections to read
- SPEC.md §8.2 (`send`)
- SPEC.md §9
- T-079's RFC

## Files expected to change
- `src/tools/toolsets/send/index.ts`, `reply-to-ticket.ts` (new)
- `src/tools/context.ts`, `src/tools/toolsets/index.ts`, `src/server.ts`
- `eslint.tool-imports.json`
- `test/tools/send/reply-to-ticket.test.ts` (new), `test/server.test.ts`
- `README.md`, `docs/tool-catalogue.md`, `docs/architecture/overview.md`, `CHANGELOG.md`

## Wireframes
`none`

## Acceptance
`test/tools/send/reply-to-ticket.test.ts` (MockAgent): without `confirm` 0 dispatches and the "Not sent" result with a `send_id`; with `confirm: true` and that `send_id` one POST to `/reply`; `confirm: true` with no `send_id`, or with one minted for another body or cc list, 0 dispatches; a `to` or `bcc` input `validation`; no email address in the sent result, even when the mocked answer echoes some; a 5xx after the send `may_have_been_sent`; `test/server.test.ts`: `send` no longer a `ConfigError`, the tool listed with `destructiveHint` only with `send`, the wiring hands the reply factory its own entry only; the description and the "Not sent" text name the ticket id first and ask the user to check it is the ticket they mean (threat 1); the description says Freshdesk may copy the ticket's existing CCs (OD-21) and, with `README.md`, never to "always allow" the `send` tools (OD-30); `make quality` green.

Split point: the wiring (`server.ts`, `context.ts`, `send/index.ts`) first, the tool second (as T-071).

---
*Filled at `/handoff`:*

## Done
- `1ef27e0` build: `src/tools/toolsets/send/index.ts` (`sendTools`, `SEND_FACTORIES`), `src/tools/toolsets/send/reply-to-ticket.ts` (`replyToTicket`, `sendFailed`); `src/tools/context.ts` builds `send` from the write path's `sends` (one `WeakMap` of built toolsets); `src/server.ts` and `src/tools/toolsets/index.ts` comments; T4 place in `eslint.tool-imports.json`; README "Sending mail (`send`)", tool catalogue, overview, CHANGELOG.
- `4cc147b` review fixes: `withoutAddresses` moved to `src/tools/format.ts` (shared by `add_note`, `hand_off_draft`, `reply_to_ticket`; T4 lists `../../format.js`, not `../write/add-note.js`); the description opens with the ticket check; any failure after a dispatch is `retryable: false` and says the `send_id` is spent; a network error after the POST tested end to end. Handoff commit: the zero-width test case written with `String.fromCodePoint` (the literal had been folded in).
- Tests: `test/tools/send/reply-to-ticket.test.ts` (32: two calls, mismatched confirms, `to`/`bcc`/`bcc_emails`/`from_email` refused, no address in the sent result, 5xx, network and other-shape `may_have_been_sent`, a 400 scrubbed, registration and description); `test/server.test.ts` ("the real registry ... takes", "with send alone", "the send wiring"); `test/lint-rules.test.ts` (T4 refusals).
- Decisions (main session, high confidence): `may_have_been_sent` is a boolean key on the error (`server`/`network` with attempts > 0), the code unchanged; the "Not sent" result carries `api_calls_used: 0`; `cc` absent and `confirm` absent are passed to the core as own keys holding `undefined` (in `SEND_KEYS`, read as absent); README's `toolsets` line now names `write` and `send` (it said `write` was refused, untrue since T-071) and the CHANGELOG line "`send` is still refused" removed.

## Dead ends
none

## Open doubts
- `may_have_been_sent`'s exact shape (a key on the error) is this tool's choice; T-085 and T-088 should reuse `sendFailed`'s rule.
- A 408 or 409 after dispatch is `validation`, reported "send_id spent" but not `may_have_been_sent` (OD-27's list); the RFC says such a 4xx is not proof nothing was sent.
- Parked from the scoped round: `docs/improvements.md`, `4cc147b`.

## Context pressure
ok

## Next action
none (done).
