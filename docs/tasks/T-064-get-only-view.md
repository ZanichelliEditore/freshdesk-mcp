# T-064 — The core holds the one client; `context.http` is a GET-only view

- **Type:** build
- **Phase:** M2
- **Status:** done (2026-11-25)
- **Depends on:** T-040 (done)
- **Created:** 2026-11-25

## Goal
The safety core exists as a module, `src/core/`, and holds the one `HttpClient`. Every module outside it, the tools and the schema service, gets a view of that client that refuses any method but GET, in the type and at runtime, with nothing sent. No write is added: M1's behaviour is unchanged.

## In scope
- `src/core/write-path.ts`: builds the one client on the one limiter and exposes the GET-only view (RFC invariant 1). Write entry points are T-068's, not here.
- The view refuses PUT, POST, DELETE (and any non-GET) through `request`, `requestWithRetry` and `paginate`, as `validation` with `http_status: null`, before the limiter is asked (as the smoke client refuses, `scripts/smoke/smoke.ts:80-90`, but a wrapper, not a subclass: no base `request` on its prototype chain).
- `src/tools/context.ts` and the schema service hold the view, not the client; the context header and `docs/architecture/overview.md` say so.
- A `GetHttp` type whose `method` can only be GET (or absent); the resource functions in `src/client/resources/*.ts` take it (signatures only; `HttpClient` fits it, so the core can pass the full client).
- Lint: `src/tools/**` cannot import `src/core/**` (`eslint.tool-imports.json`, `test/lint-rules.test.ts`).

## Out of scope
- Write entry points, allow sets, notify (T-065, T-068, T-069).
- Any write resource (T-067).

## Spec sections to read
- SPEC.md §9
- SPEC.md §7.1
- RFC `2026-11-25-write-safety-core`, Decision, invariant 1

## Files expected to change
- `src/core/write-path.ts` (new)
- `src/tools/context.ts`
- `src/schema/index.ts`
- `src/client/resources/*.ts` (types only)
- `eslint.tool-imports.json`, `eslint.config.mjs` if needed
- `test/core/get-view.test.ts` (new)
- `test/lint-rules.test.ts`
- `test/tools/context.test.ts`
- `docs/architecture/overview.md`

## Wireframes
`none`

## Acceptance
`test/core/get-view.test.ts` (MockAgent): PUT, POST and DELETE through `request`, `requestWithRetry` and `paginate`, also by a cast and by an options object whose `method` getter answers GET once then PUT, each give `validation` with `http_status: null`, 0 dispatches and the limiter's count unchanged; a GET passes; the context's `http` and the schema service's client are the view (not the core's client), and the view is not `instanceof HttpClient` (a wrapper holding the client in a private field, not a subclass); a `@ts-expect-error` case shows a PUT through `context.http` fails `make typecheck`; `test/lint-rules.test.ts`: no `src/core` path is in `eslint.tool-imports.json` and an import of `src/core/` from `src/tools/**` is refused; existing tests pass unchanged; `make quality` green.

Split point: after the runtime view, its test and the context/schema wiring; the `GetHttp` re-typing of the resource signatures and the `@ts-expect-error` case become a `proposed` row if the session runs out, and that row is a dependency of T-068.

---
*Filled at `/handoff`:*

## Done
- `4b2a159`: `src/core/write-path.ts` (`createWritePath`, `GetView`), `GetHttp` and `GetRequest` in `src/client/http.ts`, the context and the schema service on the view, the resource signatures on `GetHttp`, `docs/architecture/overview.md`.
- `087d6ba`: review fixes. `GetRequest` omits `body` and the view's copy drops it; the lint test resolves each entry from its place.
- Tests: `test/core/get-view.test.ts` (27 cases: the non-GET refusals through `request`, `requestWithRetry`, `paginate`, by a cast and by the GET-then-PUT getter; GET passes; no body on a GET; the wrapper not `instanceof HttpClient`; context and schema service on the view; the `@ts-expect-error` PUT through `context.http`); `test/lint-rules.test.ts` ("lists no src/core path for any place", "refuses in %s an import of %s, value or type").
- The tests can fail: a single read of the method fails 3 cases, no `paginate` check fails 7, and a `GetRequest` that allows PUT fails `tsc` (TS2578, unused `@ts-expect-error`). All three were checked by mutation and reverted.
- No split was needed: the `GetHttp` re-typing landed in this task.

## Dead ends
none

## Open doubts
- Lint fences only `src/tools/**` off the core and `HttpClient`. Elsewhere in `src/**` (and `scripts/**`), "one client" holds by inspection: today only `src/core/write-path.ts` constructs one. A rule for T-068 is proposed in `docs/improvements.md` (`4b2a159` entry).

## Context pressure
ok

## Next action
none (done).
