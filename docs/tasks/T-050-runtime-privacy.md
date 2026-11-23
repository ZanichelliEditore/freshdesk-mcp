# T-050 — Harden runtime privacy of the HTTP client, limiter and schema service

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
- **Depends on:** T-047
- **Created:** 2026-11-23

## Goal
What the context hands a tool cannot be re-pointed or loosened at runtime by
a tool's mistake or a cast: the client's host and limiter, the limiter's
state, the schema service's cache. Today these are TypeScript `private`,
ordinary properties at runtime. Raised by T-015's scoped review round
(security-reviewer, list A, range `da373b7..b4a1571`); the owner confirmed
it on 2026-11-23. Sized by `/decompose` on 2026-11-23.

## In scope
Line numbers are as of `b4a1571`; T-047 moves those of `src/client/http.ts`.
- **A1, A2** `src/client/http.ts:132,137,175,212,319,337-347`: `#host`,
  `#limiter`, `#allowed()` and `#build()`; the instance frozen at the end of
  the constructor, so no method can be replaced on it either.
- **A3** `src/client/rate-limit.ts:67-74`: `#` fields for the limiter's
  options and state (`total`, `remaining`, `windowEnd`, `exhausted`,
  `nextExpensiveAt`). `src/schema/index.ts:99-106`: `#` fields for `cached`,
  `inFlight` and `ttlS`.
- **A4** `src/tools/context.ts:32,51`: `limiter` is **dropped** from
  `AppContext`, not replaced by a read-only view. It is the smaller of the
  two: nothing reads it but three tests, no M1 task file names a tool that
  needs it (a refusal reaches a tool as the `rate_limited` result of
  `context.http`), and a view would be a new type with no reader. A tool
  that later needs the budget raises it then. `createContext` still builds
  one limiter and gives it to the client.
- The tests of `test/tools/context.test.ts` that call `context.limiter`
  (`:132-139`, `:196`, `:228-236`) are rewritten to observe the limits
  through `context.http`.
- Lint, folded in from `docs/improvements.md` (entry stamped `b4a1571`,
  security B): `no-restricted-imports` for `src/tools/**` except
  `src/tools/context.ts`, refusing `config`, `client/http` and
  `schema/output`, so a tool takes the context. Proven in
  `test/lint-rules.test.ts`, like the two blocks there. It fits here: one
  config block and its cases, and it must exist before T-019.
- Wording, to what is then proven and no more: the comment on the client's
  private fields (`src/client/http.ts:133-135`), the header of
  `src/tools/context.ts` (`:9`, "are not frozen (PLAN, the hardening row)"),
  and the `http.ts`, `rate-limit.ts`, `schema` and `context.ts` entries of
  `docs/architecture/overview.md`. They state the threat model: a tool's
  mistake or a cast, not hostile code in the process.

## Out of scope
- Hostile code in the process: `process.env` keeps the key, and a prototype
  or a global can be patched. Classes and prototypes of the three are not
  frozen (owner's threat model, `docs/tasks/T-015-app-context.md`, "Open
  doubts").
- The toolset gate for POST, PUT and DELETE (`docs/improvements.md`, entry
  stamped `da373b7`): T-040's RFC.
- A copy of the limiter's options: the context passes its frozen
  `team.limits`.
- The other items of the entry stamped `b4a1571`: they stay parked.
- T-016's smoke client: T-016 wraps or subclasses, see its task file.

## Spec sections to read
- SPEC.md §7.1
- SPEC.md §7.2
- SPEC.md §7.3

## Files expected to change
- `src/client/http.ts`
- `src/client/rate-limit.ts`
- `src/schema/index.ts`
- `src/tools/context.ts`
- `eslint.config.mjs`
- `test/client/http.test.ts`
- `test/client/rate-limit.test.ts`
- `test/schema/output.test.ts`
- `test/tools/context.test.ts`
- `test/lint-rules.test.ts`
- `docs/architecture/overview.md`
- `docs/improvements.md` (the `b4a1571` entry: the lint item marked done)

## Wireframes
`none`

## Split point
A1 to A4 with their tests and the wording first; the lint rule and its
cases second.

## Acceptance
Each of A1 to A4, and each lint refusal, has a case that fails on
`b330f08`'s code. An assignment "through a cast" is `(x as unknown as Record<string, unknown>).name = value`.
`test/client/http.test.ts` (MockAgent, two intercepted origins): on a built
client `Object.isFrozen` is true and an assignment through a cast to each of
`host`, `limiter`, `allowed`, `build`, `request`, `requestWithRetry` and
`paginate` throws a `TypeError`; after those attempts (the `host` one naming
the second origin) a `request`, a `requestWithRetry` and a `paginate` whose
`Link` names the second origin put the Authorization header on requests to
the configured origin only: the second origin's call history is empty and
its URL is refused with no request sent (A1); a client whose limiter is in a
429 hold, after an attempt to assign it a new limiter, still answers
`rate_limited` with no request sent (A2).
`test/client/rate-limit.test.ts` (fake clock): on a limiter in a 429 hold
and on one below the reserve, an assignment through a cast to each of
`options`, `total`, `remaining`, `windowEnd`, `exhausted` and
`nextExpensiveAt` throws or changes nothing: the next `acquire` is refused
with the same code and `retry_after_s` as before the attempt (A3).
`test/schema/output.test.ts` (MockAgent, fake clock): after one load,
assigning through a cast `cached = undefined`, `inFlight` a promise of
another result, or `ttlS = 0` throws or changes nothing: the next `get()`
inside the TTL returns the same schema and the MockAgent count has not
grown; after an attempt at `ttlS = 1e9` a `get()` past the TTL loads again
(A3).
`test/tools/context.test.ts`: `Object.keys(context)` is exactly `http`,
`schema`, `team`, `ticketOutput`; a `// @ts-expect-error` on
`context.limiter` passes `make typecheck`; `Reflect.ownKeys` of
`context.http` and of `context.schema` are empty; with `limits.reserve_pct:
60` and a response reporting 50 of 100 left, an `expensive` request through
`context.http` is `rate_limited` with no request sent and a `cheap` one is
sent, and with the default limits the `expensive` one is sent (A4).
`test/lint-rules.test.ts`: in `src/tools/core/x.ts` an import of
`../../config.js`, of `../../client/http.js` and of `../../schema/output.js`
each gives `no-restricted-imports`; imports of `../context.js`,
`../../schema/index.js` and `../../client/resources/agents.js` give none;
the three refused imports give none in `src/tools/context.ts`.
Wording: `grep -rn "hardening row" src docs/architecture` prints nothing;
`grep -c "hostile code" docs/architecture/overview.md` is at least 1; the
overview's `context.ts` entry no longer lists the limiter among what the
context holds. `make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
