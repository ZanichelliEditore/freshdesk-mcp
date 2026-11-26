# T-083 — `confirm.ts`: the `send_id` and the "Not sent" result

- **Type:** build
- **Phase:** M3
- **Status:** todo (2026-11-26)
- **Depends on:** T-079
- **Created:** 2026-11-26

Sized on T-079's likely answer (PLAN, M3: the OD proposals, and the owner's answers of 2026-11-26 to OD-20, OD-21 and OD-26); its acceptance is re-checked when T-079's RFC is accepted.

## Goal
`src/tools/confirm.ts` mints and checks a `send_id` bound to the tool, ticket, body and recipients, and builds SPEC §9's "Not sent" result that carries it (OD-20 answered 2026-11-26, owner via the orchestrator).

## In scope
- The `send_id`: `src/tools/preview.ts`'s mechanism reused (HMAC under the per-process key, TTL 15 minutes, `Date.now()`), not a second key scheme; recipients canonicalised so order does not matter.
- The "Not sent" result: SPEC §9's sentence, the body as it will be sent, the caller's recipients, the requester as "the ticket's requester" (OD-27), and the `send_id`.
- No request made.

## Out of scope
- Calling the check from the core's entries (T-082, where T-079's RFC puts it).

## Spec sections to read
- SPEC.md §9 (confirm row)
- T-079's RFC (OD-19, OD-20, OD-27)
- `src/tools/preview.ts` (T-070)

## Files expected to change
- `src/tools/confirm.ts` (new)
- `src/tools/preview.ts` (only to share the key and canonical form, if needed)
- `test/tools/confirm.test.ts` (new)
- `eslint.tool-imports.json` (if a place is needed)

## Wireframes
`none`

## Acceptance
`test/tools/confirm.test.ts` (fake clock): a `send_id` minted with `src/tools/preview.ts`'s mechanism (per-process key, TTL 15 minutes, `Date.now()`) checks against the same tool, ticket, body and recipients, the recipients in any order; another tool, another ticket, a body one character different, a recipient added or removed, an edited id, an id minted under another process's key and an id past its 15 minutes (the boundary as `preview.ts` has it, tested both sides) each fail without quoting the id; the "Not sent" result holds SPEC §9's sentence, the body as it will be sent, the caller's recipients, the requester as "the ticket's requester", never an address (OD-27), and the `send_id`; no request is made; `make quality` green.

No split point: one module on `preview.ts`'s mechanism and its test file.

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
