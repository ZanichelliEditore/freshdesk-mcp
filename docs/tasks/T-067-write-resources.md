# T-067 — Write resources: PUT ticket, POST note, GET agent by id

- **Type:** build
- **Phase:** M2
- **Status:** todo (2026-11-25)
- **Depends on:** T-064
- **Created:** 2026-11-25

## Goal
The client calls the M2 writes need exist: `putTicket` and `postNote` in the core (typed on the full `HttpClient`, importable by the core only) and `getAgent` (a read, on `GetHttp`) in the agents resource.

## In scope
- `src/core/resources.ts`: `putTicket(http, id, body)`, `postNote(http, id, body)`, both through `requestWithRetry` (`docs/improvements.md` `6e7674f`: a direct `request` would keep `retryable: true` after a 5xx).
- `src/client/resources/agents.ts`: `getAgent(http, id)` returning id, work email and the field of the agent record that shows it active (OD-14, owner 2026-11-25: an agent not clearly active is refused; the field confirmed from Freshdesk's documented agent object, or by a GET-only smoke probe if unclear).
- Lint: only `src/core/**` may import `src/core/resources`; the rule covers `scripts/**` too (`src/tools/**` is already refused by the allow-list).

## Out of scope
- Who may call them and with what body (T-068).

## Spec sections to read
- SPEC.md §7.1
- RFC `2026-11-25-write-safety-core`, Decision, invariants 4 and 6

## Files expected to change
- `src/core/resources.ts` (new)
- `src/client/resources/agents.ts`
- `test/core/resources.test.ts` (new)
- `test/client/resources/agents.test.ts`
- `test/lint-rules.test.ts`

## Wireframes
`none`

## Acceptance
`test/core/resources.test.ts` (MockAgent): `putTicket` and `postNote` send the body exactly as given to the right path; a 5xx is not retried and comes back with `retryable: false`; a 429 is retried per T-014; an id not a positive safe integer is `validation` with nothing sent; a malformed answer is `server`; `getAgent` parses id, email and the active flag, a record with the flag missing or not a boolean parses as not active, a 404 is `not_found`; `test/lint-rules.test.ts`: a file outside `src/core/**`, in `src/` or in `scripts/`, importing `src/core/resources` is refused; `make quality` green.

No split point.

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
