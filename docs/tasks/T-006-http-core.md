# T-006 — HTTP core: request, auth, host check, errors, limiter, safe logs

- **Type:** build
- **Phase:** M0
- **Status:** todo
- **Depends on:** T-004, T-005
- **Created:** 2026-11-20

## Goal
`src/client/http.ts` sends one request correctly: undici agent with keep-alive, Basic auth, UA, host check, status → error mapping, limiter fed by response headers, metadata-only logs.

## In scope
- Install `undici` (per T-002); `fetch` imported from undici.
- Host validated against `^[a-z0-9-]+\.freshdesk\.com$` unless the config override is on.
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
`test/client/http.test.ts` (MockAgent): Basic auth and UA headers sent; foreign host refused unless override; each status maps to its T-003 code; limiter state updated from headers; no stderr line contains the API key or a body string; `make quality` green.

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
