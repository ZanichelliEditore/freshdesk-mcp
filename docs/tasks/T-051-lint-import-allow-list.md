# T-051 — Lint: exact allow-list of import specifiers in src/tools/**

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
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
