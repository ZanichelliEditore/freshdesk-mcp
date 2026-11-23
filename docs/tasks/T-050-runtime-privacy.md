# T-050 — Harden runtime privacy of the HTTP client, limiter and schema service

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
- **Depends on:** T-047
- **Created:** 2026-11-23

## Goal
What the context hands a tool cannot be re-pointed or loosened at runtime by
a tool's mistake or a cast: the client's host and limiter, the limiter's
state, the schema service's cache. As of `b330f08` (2026-11-23) these are
TypeScript `private`, ordinary properties at runtime. Raised by T-015's
scoped review round (security-reviewer, list A, range `da373b7..b4a1571`);
the owner confirmed it on 2026-11-23. Sized by `/decompose` on 2026-11-23.

## In scope
Line numbers are those of `b330f08`; T-047 moves those of
`src/client/http.ts`.
- **A1, A2** `src/client/http.ts`: `#host` (`:132`, read at `:335,344`),
  `#limiter` (`:138`, `acquire` at `:176`, `observe` at `:213`), `#build()`
  (`:320`) and `#allowed()` (`:338-348`); the instance frozen at the end of
  the constructor, so no method can be replaced on it either. No getter for
  either field.
- **A3, limiter** `src/client/rate-limit.ts:67-74`: `#` fields for the
  options and the state (`total`, `remaining`, `windowEnd`, `exhausted`,
  `nextExpensiveAt`). The limiter instance is **not** frozen:
  `test/client/http-retry.test.ts:296,453,489,502` spy on `limiter.acquire`,
  and `#` fields already make a cast-assignment change nothing.
- **A3, schema service** `src/schema/index.ts:99-106`: `#cached`,
  `#inFlight` and a declared `#ttlS` set in the constructor (a parameter
  property cannot be `#`); the instance frozen at the end of the
  constructor.
- **A4** `src/tools/context.ts:32,51`: `limiter` is **dropped** from
  `AppContext`, not replaced by a read-only view. It is the smaller of the
  two: nothing reads it but three tests, no M1 task file names a tool that
  needs it (a refusal reaches a tool as the `rate_limited` result of
  `context.http`), and a view would be a new type with no reader. A tool
  that later needs the budget raises it then. `createContext` still builds
  one limiter and gives it to the client.
- Tests that break on a frozen client or on `#` members are changed, not
  the mechanism. Known: `test/client/http-retry.test.ts:84,184` spy on the
  instance (`vi.spyOn(http, "request")`) and move to
  `HttpClient.prototype.request`, restored after each test;
  `test/tools/context.test.ts:132-139,196,228-236` call `context.limiter`
  and are rewritten to observe the limits through `context.http`. Before
  editing, the builder greps `test/` for `spyOn(` on a client, limiter or
  schema-service instance and for casts or bracket access to `host`,
  `limiter`, `cached`, `inFlight` and `ttlS`, and lists what it finds in
  "Done" (`test/client/paginate.test.ts` and `test/client/resources/` may
  be touched).
- Lint, folded in from `docs/improvements.md` (entry stamped `b4a1571`,
  security B), so a tool takes the context. It fits here: one config block
  and its cases, and it must exist before T-019. One block in
  `eslint.config.mjs` for `files: ["src/tools/**"]`, `ignores:
  ["src/tools/context.ts"]`:
  - `@typescript-eslint/no-restricted-imports` (already installed with
    `typescript-eslint`, no new dependency), one `patterns` entry with
    `allowTypeImports: true`, its `group` written like the existing
    `**/cli` one, each name bare, `.js` and `.ts`: `../config`,
    `../config.js`, `../config.ts`, `../../config`, `../../config.js`,
    `../../config.ts`, `**/client/http`, `**/client/http.js`,
    `**/client/http.ts`, `**/schema/output`, `**/schema/output.js`,
    `**/schema/output.ts`, `**/schema/index`, `**/schema/index.js`,
    `**/schema/index.ts`, and for `config` also `../../../config`,
    `../../../config.js`, `../../../config.ts`, `**/src/config`,
    `**/src/config.js`, `**/src/config.ts`. `config` is anchored with `../`
    so a tool-local `./config.js` passes; a file named `config` directly
    under `src/tools/` would be refused from a subfolder, so none is given
    that name.
  - A second `patterns` entry refuses a specifier that is not in its
    shortest form, which the anchored globs let through (`./../config.js`,
    `../tools/../config.js`): `regex:
    "^\\./\\.\\.(/|$)|/\\./|(^|/)[^/.][^/]*/\\.\\.(/|$)"` as written in
    the config file's string. It applies to type imports too.
  - Tried in memory, nothing written, on 2026-11-23 (eslint 10.15.0,
    typescript-eslint 8.73.0), twice: the first list, then at
    `2026-11-23T15:49+01:00` with the additions of the scoped round. Both
    entries give the results the acceptance lists; without the second
    entry `./../config.js` and `../tools/../config.js` pass; with the block
    written for `src/**` the three `src/server.ts` cases are refused, so
    they can fail.
  - `import type` is allowed for the four modules, a value import refused:
    `schema/index` is in the list so a tool cannot build its own
    `SchemaService` or call `deepFreeze`, and still names the `Schema` type.
  - `no-restricted-syntax` with the selector `ImportExpression`: no dynamic
    `import()` under `src/tools/**`.
  - The exemption is `src/tools/context.ts` alone, whose own imports are
    `../client/http.js`, `../client/rate-limit.js`, `../config.js` (types),
    `../schema/index.js` and `../schema/output.js`.
  - `test/lint-rules.test.ts`'s `BANS` set gains the two rule ids.
- Limiter cases need named setups, or they pass without proving anything
  (`docs/improvements.md`, entry stamped `f61f70b`): pacing refuses only
  when `acquire` is given a `boundMs` shorter than the pacing gap or the gap
  is over 15 s; a 429 hold refuses only with a `Retry-After` above 15 s;
  the `total` and `remaining` values assigned must be ones that would lift
  the limiter above the reserve.
- Wording, to what is then proven and no more: the comment on the client's
  private fields (`src/client/http.ts:133-135`), the header of
  `src/tools/context.ts` (`:8-9`, "are not frozen (PLAN, the hardening
  row)"), and the `http.ts`, `rate-limit.ts`, `schema` and `context.ts`
  entries of `docs/architecture/overview.md`. They state the threat model: a
  tool's mistake or a cast, not hostile code in the process.

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
- T-016's smoke client: T-016 subclasses `HttpClient`, see its task file.

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
- `test/client/http-retry.test.ts` (instance spies)
- `test/client/rate-limit.test.ts`
- `test/schema/output.test.ts`
- `test/tools/context.test.ts`
- `test/lint-rules.test.ts`
- `test/client/paginate.test.ts`, `test/client/resources/*.test.ts` (only
  if the grep above finds a spy or a cast there)
- `docs/architecture/overview.md`
- `docs/improvements.md` (the `b4a1571` entry: the lint item marked done)

## Wireframes
`none`

## Split point
A1 to A4 with their tests and the wording first; the lint block and its
cases second. If the split is taken, T-050 closes on the first half, its
"Done" saying the lint clause of the acceptance moved, and the handoff adds
the lint half as a `proposed` row of its own. T-016 needs the first half
only. T-019, T-042 and T-043 need both: the handoff says so in the new row
and in HANDOFF, and none of the three is taken before the next `/decompose`
has sized that row and added it to their dependencies.

## Acceptance
Each of A1 to A4, and each lint refusal, has a case that fails on the
code of the commit T-050 starts from: for A2 and A3 each assignment, taken
alone, releases the refusal or changes the answer there, and the builder
shows it by running the new cases against that commit's `src/` and quoting
the failing test names in "Done". An assignment "through a cast" is
`(x as unknown as Record<string, unknown>).name = value`.
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
`test/client/rate-limit.test.ts` (fake clock): `Reflect.ownKeys` of a
limiter after one `acquire` and one `observe` is empty; an assignment
through a cast throws or changes nothing, each field tried alone in a state
where it would loosen the refusal: `options` (a reserve and floor of 0),
`total` and `remaining` on a limiter below the reserve, `exhausted` (false)
and `windowEnd` (0) on one in a 429 hold, `nextExpensiveAt` (0) on one that
has given out one `expensive` call and still paces the next; in each the
next `acquire` is refused with the same code and `retry_after_s` as before
the attempt (A3).
`test/schema/output.test.ts` (MockAgent, fake clock): `Object.isFrozen` of a
service is true and an assignment through a cast to `cached`, `inFlight` or
`ttlS` throws a `TypeError`; after one load and attempts at `cached =
undefined` and `ttlS = 0`, the next `get()` inside the TTL returns the same
schema and the MockAgent count has not grown; after an attempt at `ttlS =
1e9`, a `get()` past the TTL loads again; after an attempt to plant
`inFlight` (a promise of another result), a `get()` before the first load
and one past the TTL each make the MockAgent count grow and return the
loaded schema, not the planted one (A3).
`test/tools/context.test.ts`: `Object.keys(context)` is exactly `http`,
`schema`, `team`, `ticketOutput`; a `// @ts-expect-error` with a
description, on the line above an `expect(context.limiter)` expression,
passes `make typecheck`; `Reflect.ownKeys` of `context.http` and of
`context.schema` are empty, `"limiter" in context.http` and `"host" in
context.http` are false, and `Object.isFrozen` is true of both; with
`limits.reserve_pct: 60` and a response reporting 50 of 100 left, an
`expensive` request through `context.http` is `rate_limited` with no request
sent and a `cheap` one is sent, and with the default limits the `expensive`
one is sent (A4).
`test/lint-rules.test.ts`: a value import of `../config.js` in
`src/tools/x.ts`, and of `../../config.js`, `../../client/http.js`,
`../../schema/output.js` and `../../schema/index.js` in
`src/tools/core/x.ts`, each gives `@typescript-eslint/no-restricted-imports`,
and so does each of the five written with `.ts` and with no extension, and
so do `../../../config.js` in `src/tools/a/b/x.ts`, `../../src/config.js`,
`./../config.js`, `.././config.js` and `../tools/../config.js` in
`src/tools/x.ts`, and `../../tools/../config.js` in `src/tools/core/x.ts`;
no file under `src/tools/` sits deeper than one subfolder (the test walks
the directory), so the anchored `config` patterns cover every depth in use;
an `import type` of each of the five, and an inline `import { type Schema }`
from `../../schema/index.js`, give none; `./config.js` in `src/tools/x.ts`
and in `src/tools/core/x.ts`, `../context.js` and
`../../client/resources/agents.js` give none; a dynamic
`import("../../config.js")` in `src/tools/core/x.ts` gives
`no-restricted-syntax`; value imports of `../client/http.js`,
`../schema/output.js` and `../schema/index.js` in `src/tools/context.ts`
give none; outside `src/tools/`, value imports of `./client/http.js` and
`./schema/index.js` in `src/server.ts` give none and a dynamic `import()`
there gives no `no-restricted-syntax` (these fail if the block is written
for `src/**`).
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
