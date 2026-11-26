# T-077 — Lint fence: the client, the limiter and `ticketInput` stay in the core

- **Type:** build
- **Phase:** M2
- **Status:** todo (2026-11-26)
- **Depends on:** T-068
- **Created:** 2026-11-26

## Goal
Lint, not only grep, keeps the core the one holder of a client that can write and the one source of an allow set: outside `src/core/**` nothing builds an `HttpClient` or `RateLimiter` or imports `ticketInput`, and no core module re-exports them past those rules (RFC `2026-11-25-write-safety-core`, invariants 1 and 2).

## In scope
- A rule refusing value imports and `new` of `HttpClient` and `RateLimiter` in `src/**` and `scripts/**` outside `src/core/**`; type imports allowed. Exempt: the defining modules (`src/client/http.ts`, `src/client/rate-limit.ts`) and the one recorded exception `scripts/smoke/smoke.ts` (`SmokeClient`, GET-only by override; `docs/improvements.md` `4b2a159`).
- A rule refusing an import of `ticketInput` outside `src/core/**` and its own module (`75ca50f`).
- A rule refusing re-exports in `src/core/**` (`85f48fd`).
- A rule letting only `src/tools/context.ts`, outside `src/core/**`, import or call `createWritePath` (`0a98b15`, taken by the `/decompose M2` amendment of 2026-11-26).
- The T-064 test "lists no src/core path" made exact (`087d6ba`).

## Out of scope
- An exported declaration holding the value (`export const c = client`) and a non-literal import: named as not claimed in the eslint header.
- Rebuilding `SmokeClient` on the core's GET view.

## Spec sections to read
- RFC `2026-11-25-write-safety-core`, Decision
- `AGENTS.md` hard rule 1

## Files expected to change
- `eslint.config.mjs`
- `test/lint-rules.test.ts`
- `docs/architecture/overview.md`

## Wireframes
`none`

## Acceptance
`test/lint-rules.test.ts`: in `src/**` and `scripts/**` outside `src/core/**`, a value import of `HttpClient` or `RateLimiter` (named, aliased, or by `import *` of `src/client/http` or `src/client/rate-limit`) and a `new HttpClient(` or `new RateLimiter(` are refused, a type-only import passes, and the exempt files are listed exactly (`src/client/http.ts`, `src/client/rate-limit.ts`, `scripts/smoke/smoke.ts`); outside `src/core/**` and `src/schema/input.ts`, an import of `ticketInput` (named, aliased, or by `import *` of `src/schema/input`) is refused; in `src/core/**`, `export … from`, `export *` and an `export { … }` list are refused, so a core module cannot re-export the client, `src/core/resources` or `ticketInput`; outside `src/core/**`, only `src/tools/context.ts` may import or call `createWritePath`, any other importer in `src/**` or `scripts/**` is refused; the "lists no src/core path" test refuses a `**` in a place glob, refuses any relative specifier among bare entries, skips non-relative entries, and its failing case covers the glob slice; `make quality` green.

Split point: the `HttpClient`/`RateLimiter` rule first; the `ticketInput` rule, the re-export rule, the `createWritePath` rule and the `087d6ba` test fixes second.

Split from T-068 at planning, 2026-11-26 (`/decompose M2` amendment, owner's decision of 2026-11-25 recorded by the orchestrator), taking the parked items `4b2a159`, `087d6ba`, `75ca50f` and `85f48fd`'s re-export. Amended 2026-11-26 (`/decompose M2` amendment, owner's pre-approval through the orchestrator): takes `0a98b15`'s `createWritePath` fence.

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
