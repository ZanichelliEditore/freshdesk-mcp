# T-083 — `send_id` in the core, and the "Not sent" result

- **Type:** build
- **Phase:** M3
- **Status:** todo (2026-11-26)
- **Depends on:** T-079
- **Created:** 2026-11-26

Sized on T-079's likely answer (PLAN, M3: the OD proposals, and the owner's answers of 2026-11-26 to OD-20, OD-21 and OD-26); its acceptance is re-checked when T-079's RFC is accepted.

## Goal
`src/core/send-id.ts` mints and checks a `send_id` bound to the tool, ticket, body as sent and recipients (OD-20 answered 2026-11-26, owner via the orchestrator; in the core per OD-32), and `src/tools/confirm.ts` builds SPEC §9's "Not sent" result that carries it.

## In scope
- `src/core/send-id.ts`: `src/tools/preview.ts`'s mechanism (HMAC, TTL 15 minutes, `Date.now()`) with its own per-process key made in the module, read from no environment or config; recipients canonicalised so order does not matter; the spent-id rule of OD-33 (reserved at the check, before any dispatch).
- Lint: `src/core/send-id` importable only inside `src/core/**`.
- `src/tools/confirm.ts`: the "Not sent" text, SPEC §9's sentence, the body, the body as sent (the entry returns it, escaped per OD-24), the caller's recipients, the requester as "the ticket's requester" (OD-27), and the `send_id` it is given; no import from `src/core/`.
- No request made.

## Out of scope
- Calling mint and check from the core's entries (T-082).
- Changing `src/tools/preview.ts`.

## Spec sections to read
- SPEC.md §9 (confirm row)
- T-079's RFC (OD-19, OD-20, OD-27, OD-32, OD-33)
- `src/tools/preview.ts` (T-070, the mechanism)

## Files expected to change
- `src/core/send-id.ts` (new)
- `src/tools/confirm.ts` (new)
- `test/core/send-id.test.ts`, `test/tools/confirm.test.ts` (new)
- `eslint.config.mjs`, `test/lint-rules.test.ts`
- `eslint.tool-imports.json` (if a place is needed)
- `docs/architecture/overview.md`

## Wireframes
`none`

## Acceptance
`test/core/send-id.test.ts` (fake clock): `src/core/send-id.ts` mints with `preview.ts`'s mechanism (HMAC under its own per-process key made in the module, TTL 15 minutes, `Date.now()`) over the tool, ticket, body as sent and recipients; the same values check, the recipients in any order; another tool, another ticket, a body one character different, a recipient added or removed, an edited id, an id minted under another process's key and an id past its 15 minutes (the boundary as `preview.ts` has it, tested both sides) each fail without quoting the id; the spent-id rule per OD-33 pinned by a test (two checks of one id with no `await` between: one passes); `test/lint-rules.test.ts`: an import of `src/core/send-id` from outside `src/core/**` is refused, and the module reads no environment or config (asserted on source); `test/tools/confirm.test.ts`: `src/tools/confirm.ts` builds SPEC §9's "Not sent" sentence with the body as sent (as the entry returns it), the caller's recipients, the requester as "the ticket's requester", never an address (OD-27), and the `send_id` it is given, and imports nothing from `src/core/`; `make quality` green.

No split point: one small core module on `preview.ts`'s mechanism and one text builder, each with its test file.

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
