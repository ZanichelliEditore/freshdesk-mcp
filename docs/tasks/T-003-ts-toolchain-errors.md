# T-003 — TypeScript toolchain + client error model

- **Type:** build
- **Phase:** M0
- **Status:** todo
- **Depends on:** T-001, T-002
- **Created:** 2026-11-20

## Goal
TypeScript compiles and vitest runs under `make quality` and in CI, proven by the first real module: the normalised error shape of §7.1.

## In scope
- `package.json`: `type: module`, `engines.node >=22.19`, `test: vitest run`; install `vitest@^5`, `@types/node@^22` (per RFC 2026-11-23).
- eslint (RFC 2026-11-23, rules 3-4): in `src/**`, `no-restricted-globals` on `fetch` and `no-restricted-properties` on `globalThis.fetch`/`global.fetch`; in `test/**`, `no-restricted-imports` on `undici`, `node:http`, `node:https`, `node:net`, `node:tls` and `cli.ts`, exempting only `test/support/mock-dispatcher.ts` and the vitest setup file by path.
- vitest setup file overwrites every `FRESHDESK_*` env var with a dummy value (RFC rule 4). The helper and the global block-only `MockAgent` land in T-006 with `undici`.
- `tsconfig.json`: switch to `NodeNext` + emit to `dist/` (an npm/`npx` package needs output; switching later means touching every import) — owner confirms at pickup.
- `src/client/errors.ts`: `{code, http_status, message, retryable, retry_after_s?}` with codes `auth|forbidden|not_found|validation|rate_limited|server|network`; Freshdesk `errors[]` passed through on `validation`; a defined fallback for statuses outside the list.
- CI Node matrix `22.19` + `24` if the owner wants it at pickup (else Node 24 only, with the untested floor noted in HANDOFF).

## Out of scope
- HTTP calls, undici (T-006).

## Spec sections to read
- SPEC.md §7.1
- SPEC.md §11

## Files expected to change
- `package.json`, `package-lock.json`
- `tsconfig.json`, `vitest.config.ts`
- `src/client/errors.ts`, `test/client/errors.test.ts`
- `.github/workflows/quality.yml` (only for the matrix)

## Wireframes
`none`

## Acceptance
`test/client/errors.test.ts` maps 401/403/404/400 with `errors[]`/400 without/429 with `Retry-After`/5xx/network to the seven codes, and 405/409/415 to the documented fallback; `make quality` green with vitest running; CI run on that commit observed green.

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
