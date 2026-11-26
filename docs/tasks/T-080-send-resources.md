# T-080 — Send resources: POST reply, POST forward

- **Type:** build
- **Phase:** M3
- **Status:** todo (2026-11-26)
- **Depends on:** T-079
- **Created:** 2026-11-26

Sized on T-079's likely answer (PLAN, M3: the OD proposals, and the owner's answers of 2026-11-26 to OD-20, OD-21 and OD-26); its acceptance is re-checked when T-079's RFC is accepted.

## Goal
The core can POST a reply and a forward: `postReply` and `postForward` in `src/core/resources.ts`, sending a body exactly as given, never retried but on 429.

## In scope
- `postReply(http, id, body)` → `POST /tickets/{id}/reply`; `postForward(http, id, body)` → `POST /tickets/{id}/forward`, through `requestWithRetry` (`docs/improvements.md` `6e7674f`), with the body snapshot `resources.ts` already takes.
- The answer parsed loosely (a conversation-like record); malformed is `server`.
- Lint: the existing `src/core/resources` fence covers them; a test case per new name.

## Out of scope
- Who may call them and with what keys (T-082).
- A public-note resource: `postNote` exists; `private` is set by an entry (T-082 or T-088).

## Spec sections to read
- SPEC.md §8.2 (`send`)
- T-079's RFC (closed keys)
- SPEC.md §7.1

## Files expected to change
- `src/core/resources.ts`
- `src/client/resources/tickets.ts` (answer schema, if needed)
- `test/core/resources.test.ts`, `test/lint-rules.test.ts`
- `docs/architecture/overview.md`

## Wireframes
`none`

## Acceptance
`test/core/resources.test.ts` (MockAgent): `postReply` and `postForward` send the body exactly as given to `/tickets/{id}/reply` and `/tickets/{id}/forward`; a 5xx, a timeout, a 2xx of another shape or a 3xx comes back `retryable: false`; a 429 is retried per T-014; an id not a positive safe integer is `validation` with 0 dispatches; `test/lint-rules.test.ts`: an import of them from outside `src/core/**` is refused; `make quality` green.

No split point: one resource family, the shape of T-067.

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
