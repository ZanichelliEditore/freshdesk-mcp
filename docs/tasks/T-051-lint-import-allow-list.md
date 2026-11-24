# T-051 — Lint: exact allow-list of import specifiers in src/tools/**

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-24)
- **Depends on:** T-050
- **Created:** 2026-11-23

## Goal
In `src/tools/**` (`src/tools/context.ts` exempt as today), the source of
every import and re-export must be exactly one of a listed set of
specifiers, given per place in the tree; everything else is refused
(fail-closed). This closes, as a class, the gaps that T-050's deny regex left
open and that the plan reviews of 2026-11-23 kept finding:
- dot segments (`../.x/../config.js`, `../..x/../config.js`; T-050 scoped
  round, security-reviewer list A, range `416641e..d8b7967`);
- tab, LF and CR, which the URL parser strips (`../con\tfig.js`; planner,
  2026-11-23);
- bare specifiers that walk out of `node_modules` (`ms/../../src/./config.js`)
  and a `file:` with a leading space (T-051 plan scoped round,
  security-reviewer list A, range `b3fdd32..83acc09`).

`config` is the module that returns the API key. Owner's decision,
2026-11-23 (option A).

## In scope
- **Places.** Tools live where the M1 task files put them:
  - `T0`: `src/tools/*.ts`, the shared modules: `format.ts` (T-017),
    `list.ts` (T-018), `budget.ts` (T-035), `csv.ts` (T-037), `rows.ts`
    (T-042), `ticket-query.ts` (T-043).
  - `T1`: `src/tools/toolsets/*.ts`, the toolset registry `index.ts`
    (T-019).
  - `T2`: `src/tools/toolsets/core/*.ts`, the `core` tools and their
    `index.ts` (T-020 onwards).

  A file anywhere else under `src/tools/` gets the bare list only.
- **The list.** It lives in one module that both `eslint.config.mjs` and
  the test read, so the two cannot drift: the config may export it, or a
  file beside it may hold it; the builder picks. `value` entries may be
  imported in any form; `type` entries may be imported as types only
  (`import type`, inline `type`, `export type … from`). The entries:
  - **Bare (every place):** `zod`, `@modelcontextprotocol/server` (root
    entry only: T-019 adds the package, runtime RFC 2026-11-23), and
    `node:path`, `node:fs/promises`, `node:crypto` (T-037's export: path
    checks, exclusive 0600 open, rename and unlink, generated file name).
    No `node:*` wildcard.
  - **`T0`**:
    - value: `./context.js`, `./format.js`, `./list.js`, `./budget.js`,
      `./csv.js`, `./rows.js`, `./ticket-query.js`, `../client/errors.js`,
      and `../client/resources/<r>.js` for `<r>` in `agents`, `groups`,
      `tickets` (T-023), `search` (T-024), `contacts`, `companies` (T-025),
      `solutions` (T-031), `canned` (T-033);
    - type: `../schema/index.js`, `../config.js`,
      `../client/resources/ticket-fields.js` (`format.ts`, T-017, imports
      `TicketField`).
  - **`T1`**:
    - value: `./core/index.js`, `../context.js`, `../format.js`,
      `../../client/errors.js`;
    - type: `../../config.js`.
  - **`T2`**:
    - value: `./<t>.js` for `<t>` in `get-ticket-schema`, `list-agents`,
      `list-groups`, `get-ticket`, `list-tickets`, `search-tickets`,
      `triage-queue`, `find-similar-tickets`, `solutions`, `canned`,
      `count-tickets`, `export-tickets`;
    - value: `../../context.js`, `../../format.js`, `../../list.js`,
      `../../budget.js`, `../../csv.js`, `../../rows.js`,
      `../../ticket-query.js`, `../../../client/errors.js`, and
      `../../../client/resources/<r>.js` for the eight `<r>` above;
    - type: `../index.js` (the registry's tool type; type-only, so
      `core/index.ts` and `toolsets/index.ts` make no runtime cycle),
      `../../../schema/index.js`, `../../../config.js`.

  `src/schema/input.ts` is not listed: T-043 does not use `ticketInput`.
- **Mechanism.** Anything not in the list for the file's place is
  refused, with a message that names the place's list and says that adding
  an entry is a reviewed config line. The builder picks the form, for
  example:
  - one `no-restricted-imports` `regex` pattern per place, a negative
    lookahead over the escaped list, anchored `^…$`, with
    `allowTypeImports: false`;
  - plus a pattern that refuses the `type` entries with
    `allowTypeImports: true`;
  - or `no-restricted-syntax` selectors on `ImportDeclaration`,
    `ExportNamedDeclaration` and `ExportAllDeclaration` sources.

  The acceptance tests the behaviour, not the form. The dynamic `import()`
  ban stays.
- **Adding to the list.** Adding a module is one config line, and it goes
  through review like any other change. The task that first needs it adds
  it in its own diff, and the reviewers see it there. The comment in
  `eslint.config.mjs` says so.
- **What T-050 left.** T-050's deny regex and the `group` pattern may be
  removed only if every case of the Acceptance still passes without them.
  The "Done" says which were removed and which kept.
- **Existing tests.** The cases in `test/lint-rules.test.ts` move to the
  places above: `src/tools/core/x.ts` becomes `src/tools/toolsets/core/x.ts`,
  with one more `../`. The tool-local `./config.js` allow case is dropped:
  it is not in the list. The depth test ("no file deeper than one
  subfolder") is replaced: every file under `src/tools/` is `context.ts`,
  or sits in `T0`, `T1` or `T2`.
- **Comments brought to what is then true** in `eslint.config.mjs` (the
  block's comment), `src/tools/context.ts` (lines 15–20 as of `81ee087`)
  and `docs/architecture/overview.md` (the `src/tools/context.ts` entry).
  Each states the exact allow-list and these gaps, which lint does not
  refuse:
  - `createRequire` from `node:module` (not listed, so refused as an
    import; stated for the global `require` if a build ever exposes it);
  - a re-export through a module outside `src/tools/`;
  - a symlink under `src/tools/` or under a listed path;
  - `.constructor` on the client or the schema service.
- If T-017 or T-018 lands first and imports something the list refuses,
  T-051 may change that specifier in their files, and nothing else in them.

## Out of scope
- Closing the gaps the comments state. `.constructor` and
  `src/client/rate-limit.ts` stay parked (`d8b7967`).
- Case-folded names on a case-insensitive filesystem. CI is Linux, and an
  exact list refuses any case change anyway (Acceptance).
- Any change outside the files below, and anything in T-017's or T-018's
  files except a refused specifier.

## Spec sections to read
- SPEC.md §7.1
- SPEC.md §7.3
- SPEC.md §11

## Files expected to change
- `eslint.config.mjs` (and a list module beside it, if the builder picks
  one)
- `test/lint-rules.test.ts`
- `src/tools/context.ts` (comment only)
- `docs/architecture/overview.md`
- only if needed (In scope, last item): a `src/tools/` file of T-017 or
  T-018

## Wireframes
`none`

## Acceptance
`test/lint-rules.test.ts` runs in-memory `lintText`, as today, with these
places:
- `T0` = `src/tools/x.ts`
- `T1` = `src/tools/toolsets/x.ts`
- `T2` = `src/tools/toolsets/core/x.ts`
- `TX` = `src/tools/core/x.ts` (not a listed place)

"Refused by the list" means `@typescript-eslint/no-restricted-imports` (or
the rule the builder picks) reports the list's own message. For a `type`
entry imported as a value, it means the type-only message.

- **Allowed, generated from the list module the config reads:** every
  entry at its place gives no rule:
  - a `value` entry as `import { x } from`;
  - a `type` entry as `import type { X } from`;
  - every bare entry at `T0`, `T1`, `T2` and `TX`.
- **Refused, generated from the same list:** for each entry at its place,
  each of these variants:
  - with an extra `./` (as a prefix, and before its last segment);
  - with one `/` doubled;
  - with a trailing `/`;
  - with one letter's case changed.

  The test asserts that the number of generated cases is at least
  entries × 4.
- **Refused, the explicit set** (the forms found so far):
  - at `T0`: `..//config.js`, `"..\\config.js"`, `../%63onfig.js`,
    `../config.js?x`, `../config.js#x`, `./../config.js`,
    `../tools/../config.js`, `../.x/../config.js`, `../..x/../config.js`,
    `../.../../config.js`, `"../con\tfig.js"`, `/src/config.js`,
    `file:///src/config.js`, `" file:///src/config.js"` (leading space),
    `ms/../../src/./config.js`, `ms/../../%64ist/config.js`,
    `../client/http.js`, `../schema/output.js`, `../../dist/config.js`;
    `../config.js` and `../schema/index.js` as value imports;
  - at `T2`: `../../../client/http.js`, `../../../schema/output.js`,
    `../../../../dist/config.js`; `../../../config.js` and
    `../../../schema/index.js` as value imports;
  - at `TX`: `../../dist/config.js`, `../../../dist/config.js`,
    `../context.js`.
- **The other forms:**
  - refused at `T0`: `import type { X } from "../.x/../config.js"`,
    `export { x } from "../client/http.js"`,
    `export * from "../schema/output.js"`;
  - allowed at `T2`: `export { x } from "../../format.js"`,
    `export * from "../../list.js"`.
- **Kept:** the dynamic `import()` refusal, the `context.ts` exemption and
  "does not reach outside src/tools" still pass. The other T-050 cases pass
  at their new places. The replaced depth test passes on the tree as it is.
- **Red first:** every refuse case that lint lets through today fails when
  run against the `eslint.config.mjs` of the commit T-051 starts from
  (HANDOFF's "Describes commit" stamp), and passes after. Any that already
  passes there is named as such. This file's "Done" records:
  - the starting hash;
  - the method: the new test file run against
    `git show <start>:eslint.config.mjs` restored in the working tree, then
    the new config put back, with no commit;
  - that `git diff --quiet <start> -- eslint.config.mjs` succeeded after the
    restore and before putting it back;
  - vitest's failed and passed case names and counts, as T-050's
    "Red, lint" entry did.
- **Comment check:** `grep -n "still reaches"` over `eslint.config.mjs`,
  `src/tools/context.ts` and `docs/architecture/overview.md` prints
  nothing. In each of the three, `grep -c` finds `createRequire`,
  `symlink`, `constructor` and `outside src/tools` at least once.
- `make quality` green.

Split point: none. It is one config block, its list, one test file and
three comments. If the generated cases make the test file hard to review,
the list module and its generator are one commit and the explicit set
another, in the same session.

## Re-plans

- **2026-11-23, after the full round.** Full review round on
  `81ee087..b3fdd32` and the planner's review; applied in `83acc09`. The
  shortest-form rule was tightened: a plain segment defined by its
  characters; refuse cases generated; `/`, `file:` and `dist` refused.
- **2026-11-23, after the scoped round.** Scoped round on
  `b3fdd32..83acc09`:
  - security-reviewer, list A: a rule that checks only specifiers starting
    with `.`, `/` or `file:` is weaker than T-050's deny regex, which sees
    every specifier. `ms/../../src/./config.js` resolves through a package
    without `exports`, and a `file:` with a leading space gets past it.
  - code-reviewer, list A: a generated `%2e` or tab case at position 0
    yields a bare specifier the rule cannot refuse.

  Owner's decision (option A): an exact allow-list replaces the
  shortest-form rule, and this file was rewritten to it in the handoff
  commit. The places follow the task files (`src/tools/toolsets/core/`),
  not `src/tools/core/` as T-050's tests assumed. The rewrite was not
  reviewed again as a plan (owner, 2026-11-23); the reviews of T-051's
  build cover it.
- **2026-11-23, `/decompose`.** `T0` gains the `type` entry
  `../client/resources/ticket-fields.js`: T-017's `format.ts` imports
  `TicketField` from it (HANDOFF at `d20c83b`). No other import under
  `src/tools/` is off the list (planner's check).

---
*Filled at `/handoff`:*

## Done
- **Commits:** `0f42776` (status `doing`), `cd5672c` (the list, the rule,
  the tests, the comments), `1677572` (full review fixes).
- **The list:** `eslint.tool-imports.json`, imported by `eslint.config.mjs`
  and by `test/lint-rules.test.ts` (`with { type: "json" }`; a JSON file
  needs no declaration file, where an `.mjs` would). It holds each place's
  glob and its `value` and `type` entries, one entry per line, and the bare
  list with glob `src/tools/**`.
- **The rule:** per place, `@typescript-eslint/no-restricted-imports` with
  two `regex` patterns, both `caseSensitive: true`: `^(?!(?:<bare|value|type
  entries, escaped>)$)` refuses any source not exactly on the list (the
  list's message, naming the place's glob and saying an entry is one
  reviewed line); `^(?:<type entries>)$` with `allowTypeImports: true`
  refuses a `type` entry imported as a value (the type-only message). The
  place blocks (`T0`, `T1`, `T2`) come after the `src/tools/**` block (bare
  list) and replace its options; `context.ts` is ignored by all of them. A
  `no-restricted-syntax` selector refuses an import, re-export or
  `import = require` source with whitespace at either end, which the rule
  trims before matching. The dynamic `import()` ban stays.
- **T-050's patterns:** the deny regex and the `group` pattern were both
  removed. Every case of the Acceptance passes without them: the allow-list
  refuses whatever is not exactly an entry, so each form they caught (a
  value import of the config, client or schema modules, `./`, `name/..`,
  `//`, `\`, `%`, `?`, `#`) is off the list.
- **Tests,** `test/lint-rules.test.ts`, describe "eslint: a tool imports
  only its allow-list (src/tools/**)":
  - generated from the list: "allows in %s the entry %s as a %s import"
    (76), "refuses in %s %j as a %s import" (extra `./` as prefix and
    before the last segment, doubled `/`, trailing `/`, case change);
    "generates at least four refused spellings per entry" asserts
    generated ≥ entries × 4;
  - the explicit set: "refuses in %s a value import of %j", "refuses a
    file: URL with a leading space, and its whitespace", "refuses in %s a
    value import of the type entry %s";
  - the other forms: "refuses in %s: %s" (`import type`, `export … from`,
    `export *`), "allows in %s: %s" (`export … from`, `export *`, inline
    `type`);
  - T-050's cases at the new places: "refuses in %s a value import of %s"
    (two blocks), "refuses a type import of a path that is not an entry",
    "refuses a re-export of the client", "allows in %s a type import of
    %s", "allows in %s a value import of %s". The tool-local `./config.js`
    allow case is dropped (task file); the type imports of
    `../../../client/http.js` and `../../../schema/output.js`, allowed by
    T-050, are off the list and now refused ("refuses in
    src/tools/toolsets/core/x.ts even a type import of %s, not on the
    list");
  - "puts every file under src/tools in context.ts or in T0, T1 or T2,
    none ignored" replaces the depth test; "refuses a dynamic import",
    "exempts src/tools/context.ts", "does not reach outside src/tools"
    kept.
  - Two changes, each tried and reverted: `caseSensitive: false` fails 75
    cases (the case changes); the whitespace selector removed fails the 4
    whitespace cases then present.
- **Red first:** starting hash `2d5e281` (HANDOFF's "Describes commit"
  `20f4b2f` plus its stamp commit; the build started from `2d5e281`).
  Method: `git show 2d5e281:eslint.config.mjs` restored in the working
  tree, the new test file run, the new config put back (checked with
  `cmp`), no commit. `git diff --quiet 2d5e281 -- eslint.config.mjs`
  succeeded after the restore and before putting it back. vitest: 503
  cases, **392 failed, 111 passed.**
  - Failed, 187 with nothing reported (lint let them through): most
    generated variants (extra `./` prefix, trailing `/`, case change, the
    bare entries' variants), and of the explicit set "refuses in
    src/tools/x.ts a value import of" `"../.x/../config.js"`,
    `"../..x/../config.js"`, `"../.../../config.js"`, `"../con\tfig.js"`,
    `"../../dist/config.js"`; in src/tools/toolsets/core/x.ts
    `"../../../../dist/config.js"`; in src/tools/core/x.ts
    `"../../dist/config.js"`, `"../../../dist/config.js"`,
    `"../context.js"`; "refuses in src/tools/x.ts: import type { X } from
    "../.x/../config.js";"; the three whitespace cases; the type imports of
    `../../../client/http.js` and `../../../schema/output.js`.
  - Failed, 205 refused by the old lint with its own message, not the
    list's: generated variants with `./` inside or `//`, `..//config.js`,
    `..\config.js`, `../%63onfig.js`, `?x`, `#x`, `./../config.js`,
    `../tools/../config.js`, `/src/config.js`, `file:///src/config.js`,
    the leading-space `file:` case, `ms/../../src/./config.js`,
    `ms/../../%64ist/config.js`, `../client/http.js`,
    `../schema/output.js` (T0 and T2), the type entries as values, the
    `export` forms at T0, and T-050's cases at their new places.
  - Passed, 111: the 23 cases of the RFC network and fetch blocks, and 88
    of the allow-list block: every allow case, the depth replacement,
    "refuses a dynamic import" (kept from T-050), the `context.ts`
    exemption and "does not reach outside src/tools". No new refuse case
    passed at the start.
- **Comments:** `eslint.config.mjs`, `src/tools/context.ts` and
  `docs/architecture/overview.md` state the exact allow-list by pointing to
  `eslint.tool-imports.json`, with no copy of its entries, so the three
  cannot drift from it (the orchestrator accepted this reading of "states
  the exact allow-list", 2026-11-24). Each names the gaps. `grep -n "still
  reaches"` over the three prints nothing; `createRequire`, `symlink`,
  `constructor` and `outside src/tools` each count ≥ 1 in each.
- **Full review fixes** (`1677572`):
  - S1/S2: the global `process` (so `process.env` and
    `process.getBuiltinModule`), `globalThis.process` and `global.process`
    refused in all of `src/tools/**`, `context.ts` included (it uses none);
    that block repeats the `src/**` fetch ban, since it replaces the
    rule's options;
  - S3: `no-eval`, `no-new-func`, `no-implied-eval` (with `setTimeout`,
    `setInterval`, `setImmediate` declared as globals, which
    `no-implied-eval` needs to see them);
  - S4: the placement test asserts no file under `src/tools/` is ignored;
  - S5: "refuses an off-list import in a dotfile" (`src/tools/.x.ts`);
  - C2: whitespace cases for `export { x } from " ../../format.js"` and
    `import x = require(" ./format.js")`; the `import = require` selector
    entry kept, since typescript-eslint's rule handles that form;
  - C3/C4: the three comments point to the JSON only;
  - C5: no ExperimentalWarning from `path.matchesGlob` on Node 22.23.5;
    kept, with a leading dot in each segment neutralised in the test, since
    node's `matchesGlob` skips dotfiles and ESLint matches them.
  - Second red check, against `cd5672c:eslint.config.mjs` (same method,
    `git diff --quiet cd5672c -- eslint.config.mjs` succeeded): 532 cases,
    **24 failed, 508 passed.** Failed: "refuses in %s: %s" for
    `process.getBuiltinModule("node:module")`,
    `globalThis.process.getBuiltinModule("node:http")`,
    `global.process.getBuiltinModule("node:http")`,
    `void process.env.FRESHDESK_API_KEY;`, `const { env } = process;`,
    `eval("1")`, `new Function("return 1")`, `setTimeout("x()", 1)`, each
    at src/tools/x.ts, src/tools/toolsets/core/x.ts and
    src/tools/context.ts. S4, S5 and both C2 cases already passed there.
- **Reviews:** full round, then a scoped round with list A empty for all
  three; list B parked in `docs/improvements.md`.
- `make quality` green: vitest 17 files, 1311 tests; `tools/checks` 54 OK.

## Dead ends
none

## Open doubts
- `import { type X } from "../config.js"` passes (every name a type); it is
  safe only while `verbatimModuleSyntax` is off, which makes TypeScript
  drop the import (checked with a scratch compile, 2026-11-23).
- The ban on the global `process` goes beyond the review's ask (two
  properties); it also closes `const p = process; p.env`.
- Not refused by lint, as the three comments say: a global `require`, if a
  build ever exposed one; a re-export through a module outside
  `src/tools/`; a symlink under `src/tools/` or a listed path;
  `.constructor` on the client, the schema service or any function; a
  computed property on `globalThis`. The alias, chain and reflection forms
  that reach `process` are parked (scoped review list B).

## Context pressure
ok

## Next action
none: done.
