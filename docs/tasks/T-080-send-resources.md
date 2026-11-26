# T-080 — Send resources: POST reply, POST forward

- **Type:** build
- **Phase:** M3
- **Status:** done (2026-11-26)
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
- `8457bed`: `postReply` and `postForward` in `src/core/resources.ts` through the existing `write()` (body snapshot, `requestWithRetry`); `sentConversation` in `src/client/resources/tickets.ts`. Tests: `test/core/resources.test.ts` "postReply" and "postForward" rows of the `writes` table (body as given to `/reply` and `/forward`; 500/502/503, timeout, malformed 2xx `retryable: false`; 429 retried, four 429s `rate_limited`; bad id `validation`, 0 dispatches); "does not follow or retry a %i" (301, 302, 307) for every row; `test/lint-rules.test.ts` "refuses an import of %s in %s from %s" (each name, nine outside files, `scripts/smoke/send.ts` included).
- `de31ba3` (review fixes): `sentConversation` keeps a positive whole-number `id` alone, every echoed key dropped (OD-27): `test/core/resources.test.ts` "$name's answer" ("keeps the id alone…", ids 0 and -1 `server`); "a fractional id" case for every row.
- `make quality` exit 0: Vitest 4140 passed (50 files); `tools/checks` 138 OK.

## Dead ends
none

## Open doubts
- The reply and forward answer shapes are Freshdesk's documented ones (A1, A2), not measured; a real answer without a positive `id` would be `server`, "may have been applied" (fails safe, wrong report). T-087 checks.

## Context pressure
low

## Next action
none (done)
