# T-084 — Tool: `reply_to_ticket`, and the `send` toolset registers

- **Type:** build
- **Phase:** M3
- **Status:** todo (2026-11-26)
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
`test/tools/send/reply-to-ticket.test.ts` (MockAgent): without `confirm` 0 dispatches and the "Not sent" result with a `send_id`; with `confirm: true` and that `send_id` one POST to `/reply`; `confirm: true` with no `send_id`, or with one minted for another body or cc list, 0 dispatches; a `to` or `bcc` input `validation`; no email address in the sent result, even when the mocked answer echoes some; a 5xx after the send `may_have_been_sent`; `test/server.test.ts`: `send` no longer a `ConfigError`, the tool listed with `destructiveHint` only with `send`, the wiring hands the reply factory its own entry only; the description says Freshdesk may copy the ticket's existing CCs (OD-21) and, with `README.md`, never to "always allow" the `send` tools (OD-30); `make quality` green.

Split point: the wiring (`server.ts`, `context.ts`, `send/index.ts`) first, the tool second (as T-071).

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
