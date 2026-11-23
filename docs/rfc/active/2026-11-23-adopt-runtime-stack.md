# Adopt the runtime and test stack

- **Status:** Active
- **Date:** 2026-11-23
- **Author:** freshdesk-mcp team
- [ ] Implemented

## Context

M0 (HTTP client, config, schema service) and M1 (the MCP server) need
runtime and test dependencies. SPEC §11 names the stack in outline
(TypeScript strict, ESM, zod, vitest, undici `MockAgent`); SPEC §7.1 wants
one undici agent with keep-alive and a host check; SPEC §5 names the MCP
SDK. Hard rule 3 says every new dependency goes through an RFC, and CI runs
`npm audit --audit-level=high`.

Constraints found while drafting (2026-11-23):

- **Node floor.** SPEC §11 said Node ≥ 20. Node 20 reached end of life on
  2026-04-30. The current majors need more: `undici@8` declares
  `node >=22.19.0`, and crashes at load on Node 20.19.4 (checked).
  `vitest@5` declares `^22.12.0 || ^24.0.0 || >=26.0.0`. The owner chose to
  raise the floor to **Node ≥ 22.19** (2026-11-23) rather than pin the older
  majors.
- **MCP SDK name.** The T-002 task file names `@modelcontextprotocol/sdk`,
  the v1 line (1.32.2), which pulls in express, hono, cors, jose and others.
  SPEC §5 names `@modelcontextprotocol/server` 2.4.0, the stable v2 line,
  whose only dependencies are `zod ^4.2.0` and `@modelcontextprotocol/core`.
  It ships a `./stdio` export. This RFC follows SPEC §5.

### Evidence: does `MockAgent` intercept Node's bundled `fetch`?

**Check A** (script in the appendix): set `setGlobalDispatcher(new
MockAgent())` from the installed undici, call `disableNetConnect()`,
intercept one GET, then call `globalThis.fetch`, undici's `fetch`, and an
unmocked URL.

| Node | bundled undici | installed | global `fetch` | undici `fetch` | unmocked URL |
| --- | --- | --- | --- | --- | --- |
| 20.19.4 | 6.21.2 | 7.30.2 | intercepted (200) | intercepted | blocked, `UND_MOCK_ERR_MOCK_NOT_MATCHED` |
| 20.19.4 | 6.21.2 | 8.13.1 | — | — | crash at load (engine) |
| 22.18.0 | 6.21.2 | 8.13.1 | intercepted | intercepted | blocked |
| 22.19.0 | 6.21.2 | 8.13.1 | intercepted | intercepted | blocked |
| 22.23.5 | 6.29.1 | 8.13.1 | intercepted | intercepted | blocked |
| 24.22.3 | 7.30.2 | 8.13.1 | intercepted | intercepted | blocked |

So yes, with every pair tested. It works because both copies share a
process-global dispatcher symbol, so it couples to whatever undici Node
bundles: a version that changes with every Node release.

**Check B** (appendix): undici 8.13.1's `fetch(url, { dispatcher: mock,
redirect: 'manual' })` against an intercept that replies 302. On Node
22.19.0 and 24.22.3 it used the mock while the global dispatcher stayed
untouched, and returned the 302 with its `Location` header, not followed.

## Decision

Admit five packages, with majors pinned by caret range. Each package is
installed by the task that first uses it, not by this RFC.

| Package | Range | Kind | For | First installed by |
| --- | --- | --- | --- | --- |
| `zod` | `^4.2` (4.6.7) | runtime | config and tool input validation | T-004 |
| `undici` | `^8` (8.13.1) | runtime | HTTP: `fetch`, `Agent`, `MockAgent` | T-006 |
| `@modelcontextprotocol/server` | `^2` (2.4.0) | runtime | MCP server, stdio transport | M1 |
| `vitest` | `^5` (5.1.1) | dev | test runner | T-003 |
| `@types/node` | `^22` (22.20.5) | dev | types of the minimum supported Node | T-003 |

`zod` is `^4.2`, not `^4`, so it can never resolve below the MCP server's
own `^4.2.0` and split into two copies.

**Runtime floor:** Node ≥ 22.19 (`engines.node ">=22.19"`). SPEC §11 is
updated to match.

**Rule for `http.ts`:**

1. Import `fetch` and `Agent` from `undici`; pass the dispatcher on every
   call (`{ dispatcher, redirect: 'manual' }`).
2. The dispatcher is a **required** constructor argument with no default.
   The entry point (`server.ts`, M1) builds the one keep-alive `Agent`;
   tests pass the `MockAgent` from the helper (rule 4). Interception never
   relies on the global dispatcher, so results depend only on the pinned
   undici.
3. The global `fetch` is banned in `src/` by eslint:
   `no-restricted-globals` on `fetch` (bare reference) and
   `no-restricted-properties` on `globalThis.fetch`, scoped to
   `files: ["src/**"]`. Added by T-003 with the first TypeScript lint
   config.
4. SPEC §11 "no test calls real Freshdesk" is held by two layers, each
   covering a different path:
   - **Injected dispatcher (lint).** Tests get their `MockAgent` only from
     one helper, `test/support/mock-dispatcher.ts`, which returns it with
     `disableNetConnect()` already called. In `test/**` except that helper,
     eslint `no-restricted-syntax` refuses `new MockAgent(...)`,
     `new Agent(...)` and any `.enableNetConnect(...)` call. The production
     `Agent` is built only in the entry point (`server.ts`), which tests do
     not import.
   - **Anything else (runtime).** The vitest setup file installs a global
     `MockAgent` with `disableNetConnect()`, so a request that bypasses the
     injected dispatcher (a stray `fetch` in a test) fails instead of
     reaching the network. It blocks; it is never used to intercept.

   The lint lands in T-003 with the eslint config; the helper and the setup
   file land in T-006 with `undici`. T-004 and T-005 make no HTTP calls.
5. Redirects: `redirect: 'manual'`. A 3xx comes back unfollowed as a
   response (Check B) and is mapped to a non-retryable error code, so the
   auth header never follows a redirect and T-007 never retries one.

**Audit:** the five at the versions above, installed together in a scratch
project, gave `npm audit --audit-level=high` "found 0 vulnerabilities"
(2026-11-23). CI re-runs the audit on every push once they are installed.

**Not covered here:** `@anthropic-ai/mcpb` and release tooling (M4, their
own RFC); build and emit settings (`tsconfig`, T-003); any other runtime
dependency. Each needs its own RFC.

## Consequences

- One HTTP stack, the same in production and tests. MockAgent fakes the
  exact code path production runs.
- The client holds no global HTTP state; its dispatcher is injected and
  cannot be forgotten, because there is no default.
- Node 20 users are not supported. Node 20 is already past end of life.
  Local development needs Node ≥ 22.19; the owner's machine had 22.18.0 on
  2026-11-23 and must upgrade before T-003.
- If T-003 adds a CI matrix, it is 22 + 24, not 20 + 24. `node-version:
  "22"` would install the latest 22.x and never test the floor, so the 22
  leg pins `22.19`. Without a matrix (Node 24 only), the floor is untested
  in CI; that is accepted only if T-003 records it.
- zod is shared: `@modelcontextprotocol/server` depends on `zod ^4.2.0`,
  so the tree holds one zod (deduped to 4.6.7 in the scratch install).
- `undici@8` adds a second copy of undici next to the one Node bundles; our
  `src/client` never calls the bundled one. undici's `fetch` returns its
  own `Response` and `Headers` classes, not the globals, so `instanceof
  Response` against the global class fails and `src/client` types its
  results from `undici`, not from the DOM/global types.
- `undici` and `@modelcontextprotocol/server` sit on the request path for
  customer data. A new major of either is a new RFC, not a routine bump.
- **Reversibility.** Before the first npm publish, every part is cheap to
  reverse. After it, lowering the Node floor stays easy but raising it is a
  breaking change (semver major). The dispatcher rule is internal and cheap
  to change at any time.

## Alternatives considered

- **Node's global `fetch`, no undici dependency.** One less package, and
  MockAgent still intercepts it (Check A). Rejected: configuring the
  keep-alive agent and `MockAgent` needs undici imported anyway, so the
  dependency does not go away. A secondary risk, not observed in testing:
  the bundled undici changes with each Node release, so behaviour could
  drift between CI matrix legs.
- **Keep Node ≥ 20 with `undici@7` and `vitest@4`.** Both lines are
  maintained (7.30.2 on 2026-11-05, 4.1.12 on 2026-10-15) and pass Check A
  on Node 20. The owner rejected it (2026-11-23): Node 20 is past end of
  life, and starting on the older majors means a migration before M1.
- **`node:test` instead of vitest.** No dependency, and close to enough:
  Node ≥ 22.18 strips TypeScript types by default and `node:test` has
  `mock.timers` (including `Date`) for the T-005 fake clock. Rejected on
  ergonomics, not capability: vitest's `expect` matchers
  (`toMatchObject`, `toThrow` with shape), stable module mocking
  (`node:test`'s `mock.module` needs `--experimental-test-module-mocks`)
  and built-in coverage cut boilerplate in the error-mapping and schema
  tests, and SPEC §11 already names it. The cost is one dev dependency with
  no runtime footprint.
- **valibot instead of zod.** Smaller bundle. Rejected: the MCP server SDK
  already depends on zod 4, so valibot would add a second validation
  library, not replace one, and the bundle size of a local stdio server
  does not matter.
- **`@modelcontextprotocol/sdk` (v1).** Named in the T-002 task file.
  Rejected: v2 is stable and is what SPEC §5 names, and v1 pulls an HTTP
  server stack (express, hono, cors) a stdio server never uses.

## Review

`rfc-reviewer`, round 1 (2026-11-23), all resolved in this draft:

1. Dropping the global mock removed the network backstop → dispatcher
   required, eslint ban, vitest setup backstop (Decision, rule 2-4).
2. T-003 and HANDOFF still said Node 20 + 24 → Consequences reworded; T-003
   task file updated; HANDOFF corrected at `/handoff`.
3. Evidence not reproducible; Check B only on Node 24 → scripts in the
   appendix; both checks rerun on 22.19.0.
4. Global-`fetch` rejection overclaimed → keep-alive is the reason, drift a
   secondary unobserved risk.
5. `zod ^4` looser than the SDK's `^4.2.0` → `^4.2`.
6. "Bundled copy never called" overclaimed; type split unmentioned → both
   stated.
7. Reversibility missing → added.
8. SPEC §5 "Node ≥ 20" read as a contradiction → annotated.

Round 2, scoped (2026-11-23). Its fixes change the mechanism, so per rule 9
they went to the owner, who approved all three and the flip to Active
without a third round (2026-11-23):

1. A test-built `MockAgent` without `disableNetConnect()`, or `new Agent`
   in a test, bypassed the global backstop → one helper plus
   `no-restricted-syntax` in `test/**` (rule 4).
2. `no-restricted-globals` misses `globalThis.fetch` → plus
   `no-restricted-properties` (rule 3).
3. RFC said `redirect: 'manual'`, T-006 said `'error'` → `'manual'`,
   3xx mapped non-retryable (rule 5); T-006 updated.

Parked: the T-003 wording on where the backstop lands is fixed in T-003;
"never calls the bundled one" holds only while rule 3's lint holds (true by
construction once T-003 lands); the HANDOFF Node-matrix line is corrected
at `/handoff`.

## Appendix: check scripts

Run with `node <script> <dir>`, where `<dir>` holds an `npm i undici@<v>`
install outside the repo.

Check A:

```js
const dir = process.argv[2];
const u = require(require.resolve("undici", { paths: [dir] }));
(async () => {
  const mock = new u.MockAgent();
  mock.disableNetConnect();
  u.setGlobalDispatcher(mock);
  const pool = mock.get("https://acme.freshdesk.com");
  for (let i = 0; i < 2; i++)
    pool
      .intercept({ path: "/api/v2/tickets/1", method: "GET" })
      .reply(200, { id: 1 }, { headers: { "content-type": "application/json" } });
  const url = "https://acme.freshdesk.com/api/v2/tickets/1";
  const out = { node: process.version, bundled: process.versions.undici };
  for (const [k, f] of [["globalFetch", globalThis.fetch], ["undiciFetch", u.fetch]]) {
    try {
      const r = await f(url);
      out[k] = `${r.status} ${JSON.stringify(await r.json())}`;
    } catch (e) {
      out[k] = `ERR ${e.cause?.code || e.message}`;
    }
  }
  try {
    await globalThis.fetch("https://example.com/");
    out.globalUnmocked = "REACHED NETWORK";
  } catch (e) {
    out.globalUnmocked = `blocked: ${e.cause?.code || e.message}`;
  }
  console.log(JSON.stringify(out));
})();
```

Check B:

```js
const u = require(require.resolve("undici", { paths: [process.argv[2]] }));
(async () => {
  const mock = new u.MockAgent();
  mock.disableNetConnect();
  mock
    .get("https://acme.freshdesk.com")
    .intercept({ path: "/x" })
    .reply(302, "", { headers: { location: "https://evil.example/" } });
  const r = await u.fetch("https://acme.freshdesk.com/x", {
    dispatcher: mock,
    redirect: "manual",
  });
  console.log(
    JSON.stringify({
      globalDispatcherIsMock: u.getGlobalDispatcher() === mock,
      status: r.status,
      location: r.headers.get("location"),
    }),
  );
})();
```
