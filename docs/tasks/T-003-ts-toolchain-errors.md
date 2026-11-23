# T-003 — TypeScript toolchain + client error model

- **Type:** build
- **Phase:** M0
- **Status:** done (2026-11-23)
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
- `68acf47`: toolchain and error model. `347b52d`: handoff review fixes.
- Error model: `src/client/errors.ts`, proven by `test/client/errors.test.ts`
  (the seven codes; fallback: other 4xx → `validation`, 3xx/1xx/2xx →
  `server`, both `retryable: false`; `errors[]` capped at 50 items of 500
  characters; undici's `cause` read by `networkError`).
- Env scrub: `test/support/env.ts`, called by `test/setup.ts`; canary in
  `test/setup.test.ts::has already run on process.env before this test`
  (red with `setupFiles` removed, checked 2026-11-23).
- Lint, RFC rules 3-4: `eslint.config.mjs`, proven by
  `test/lint-rules.test.ts` (red with the `test/**` glob or the `cli`
  pattern broken, checked 2026-11-23). Beyond the RFC's list: `http2`,
  `dgram`, `dns`, `child_process`, and the global `fetch` in `test/**`.
- Owner decisions (2026-11-23): `tsconfig` NodeNext + emit (`make build`,
  `tsconfig.build.json`); CI matrix Node `22.19` + `24`.
- Outside "Files expected to change": `eslint.config.mjs`, `Makefile`
  (`build`), `tsconfig.build.json`, `test/setup*.ts`, `test/support/env.ts`,
  `test/lint-rules.test.ts`, `docs/architecture/overview.md`; in
  `quality.yml`, plain `npm ci` (RFC "Transitive packages") and an
  `npm run build` step besides the matrix.
- CI: see `docs/HANDOFF.md`.

## Dead ends
none

## Open doubts
- The fallback codes are this task's choice, not the owner's: other 4xx →
  `validation` (covers 408 and 409), 3xx → `server`. `{errors: []}` passes
  through as an empty array.
- `esModuleInterop` left `tsconfig.json`: `NodeNext` implies it.
- The lint ban has known holes, all parked in `docs/improvements.md`
  (dynamic `import()`, `createRequire`, aliased `globalThis`, `WebSocket`).

## Context pressure
ok

## Next action
none: done.
