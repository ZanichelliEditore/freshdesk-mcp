# T-003 — TypeScript toolchain + client error model

- **Type:** build
- **Phase:** M0
- **Status:** todo
- **Depends on:** T-001, T-002
- **Created:** 2026-11-20

## Goal
TypeScript compiles and vitest runs under `make quality` and in CI, proven by the first real module: the normalised error shape of §7.1.

## In scope
- `package.json`: `type: module`, `engines.node >=20`, `test: vitest run`; install `vitest` (per T-002).
- `tsconfig.json`: switch to `NodeNext` + emit to `dist/` (an npm/`npx` package needs output; switching later means touching every import) — owner confirms at review.
- `src/client/errors.ts`: `{code, http_status, message, retryable, retry_after_s?}` with codes `auth|forbidden|not_found|validation|rate_limited|server|network`; Freshdesk `errors[]` passed through on `validation`.
- CI Node matrix 20 + 24 if the owner wants it (else Node 24 only, noted).

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
`test/client/errors.test.ts` maps 401/403/404/400(with `errors[]`)/429(with `Retry-After`)/5xx/network to the seven codes; `make quality` green with vitest running; CI run on that commit observed green.

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
