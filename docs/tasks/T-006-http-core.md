# T-006 — HTTP core: request, auth, host check, errors, limiter, safe logs

- **Type:** build
- **Phase:** M0
- **Status:** doing (2026-11-23)
- **Depends on:** T-005
- **Created:** 2026-11-20

## Goal
`src/client/http.ts` sends one request correctly through a single send function: undici agent with keep-alive, Basic auth, UA, host check on every URL, no redirects, status → error mapping, limiter fed by response headers, metadata-only logs.

## In scope
- Install `undici` (per T-002); `fetch` source as the T-002 RFC decided.
- One send function every request goes through; it requires `https:` and the default port, and checks the host of **every** URL (built or absolute) against `^[a-z0-9-]+\.freshdesk\.com$`, or equal to the exact override hostname; checked at construction too.
- `redirect: 'manual'`, set by the send function itself, not by callers (RFC 2026-11-23, rules 1, 5): a 3xx is returned unfollowed and mapped to a code with `retryable: false`, so it is never followed with the auth header and never retried.
- `test/support/mock-dispatcher.ts` (a `MockAgent` with `disableNetConnect()`) and, in the vitest setup file, the global block-only `MockAgent` (RFC 2026-11-23, rule 4).
- stderr logs method, path template, status, duration only.
- Synthetic fixtures under `test/fixtures/`.

## Out of scope
- Retries and pagination (T-007).

## Spec sections to read
- SPEC.md §7.1
- SPEC.md §7.2
- SPEC.md §9

## Files expected to change
- `src/client/http.ts`, `test/client/http.test.ts`
- `test/fixtures/`
- `package.json`, `package-lock.json`

## Wireframes
`none`

## Acceptance
`test/client/http.test.ts` (MockAgent): Basic auth and UA headers sent; an absolute URL to a foreign host, an `http://` URL or a non-default port to an allowed host are each refused with no request sent; a configured domain outside the rule (e.g. `x@evil.example`, `evil.example`) fails at construction; the override allows exactly its hostname and still refuses others; a 302 is not followed; each status maps to its T-003 code; limiter state updated from headers; no stderr line contains the API key or a body string; `make quality` green.

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
