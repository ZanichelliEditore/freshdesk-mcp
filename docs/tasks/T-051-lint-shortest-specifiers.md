# T-051 — Lint: allow-list of shortest-form relative specifiers in src/tools/**

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
- **Depends on:** T-050
- **Created:** 2026-11-23

## Goal
In the `src/tools/**` lint block, a specifier that starts with `.` is
accepted only in its shortest form and refused otherwise (fail-closed),
replacing T-050's deny regex. Closes the gap T-050's scoped review round
found (security-reviewer, list A, range `416641e..d8b7967`): a segment
starting with a dot followed by `..` (`../.x/../config.js`,
`../..x/../config.js` in `src/tools/x.ts`) gets past the deny regex and the
anchored `config` globs, and `config` is the module that returns the key.
Owner's choice, 2026-11-23.

## In scope
- `eslint.config.mjs`, the `src/tools/**` block (`src/tools/context.ts`
  exempt as today): the deny `regex` pattern is replaced by one pattern that
  refuses every specifier starting with `.` unless it is in shortest form:
  `./`, or a run of one or more leading `../`, then one or more plain
  segments joined by single `/`. A plain segment is non-empty, is not `.`
  or `..`, and contains none of `\`, `%`, `?`, `#`. So `.`, `..`, `./`,
  `../`, `.x`, `.../x`, a trailing `/`, `./../x`, `../a/../x`, `../.x/../x`
  are all refused. No `allowTypeImports` on it: type imports and
  `export … from` must be in shortest form too (as today).
- The four group patterns (`config` anchored with `../`, `**/src/config`,
  `**/client/http`, `**/schema/output`, `**/schema/index`, each bare,
  `.js`, `.ts`, `allowTypeImports: true`) stay as they are, and the
  dynamic `import()` ban stays.
- The block's message says what the shortest form is and how to write it.
- `test/lint-rules.test.ts`: the cases of the Acceptance.
- Comments brought to what is then true (dot-segment gap closed; the
  `.constructor` gap still stated): `eslint.config.mjs` (the block's
  comment), `src/tools/context.ts` (lines 15–20 as of `81ee087`),
  `docs/architecture/overview.md` (the `src/tools/context.ts` entry, its
  "known gap" clause).

## Out of scope
- `.constructor` on `context.http` and `context.schema` (parked, `d8b7967`).
- `src/client/rate-limit.ts` in the ban list (parked, `d8b7967`).
- Specifiers that do not start with `.` (bare packages, `node:`, absolute
  paths, `file:` URLs): unchanged, the group patterns cover them as today.
- Case-folded names (`../Config.js`) on a case-insensitive filesystem: not
  claimed; CI is Linux. One line in "Open doubts" at handoff if it matters.
- Any change outside the three files above and the test file.

## Spec sections to read
- SPEC.md §7.3
- SPEC.md §11

## Files expected to change
- `eslint.config.mjs`
- `test/lint-rules.test.ts`
- `src/tools/context.ts` (comment only)
- `docs/architecture/overview.md`

## Wireframes
`none`

## Acceptance
`test/lint-rules.test.ts`, in-memory `lintText` as today (`TOOL` =
`src/tools/x.ts`, `CORE` = `src/tools/core/x.ts`):

- **Refuse** (`@typescript-eslint/no-restricted-imports`), each as a value
  import: `..//config.js`, `"..\\config.js"`, `../%63onfig.js`,
  `../config.js?x`, `../config.js#x` (`TOOL`); `../../client//http.js`,
  `../../schema//index.js` (`CORE`); `./../config.js`, `.././config.js`,
  `../tools/../config.js`, `../.x/../config.js`, `../..x/../config.js`
  (`TOOL`); `../../tools/../config.js` (`CORE`); `.../config.js`,
  `../.../../config.js`, `./`, `../`, `.`, `..` (`TOOL`). `../.../config.js`
  is not a refuse case: it names `src/.../config.js`, not `src/config.ts`,
  and the rule accepts `...` as a plain segment (an allow case asserts it,
  so a later change is a decision).
- **Refuse**, the other forms: `import type { X } from "../.x/../config.js"`,
  `export { x } from "../.x/../config.js"` and
  `export * from "../..x/../config.js"` (`TOOL`).
- **Allow** (no rule): `../context.js`, `../../client/resources/agents.js`,
  `./config.js` (`TOOL` and `CORE`), `import type { Schema } from
  "../../schema/index.js"` and `import { type Schema } from
  "../../schema/index.js"` (`CORE`), `import type { Config } from
  "../../config.js"` (`CORE`), `zod` and `node:path` (bare, `CORE`),
  `../.../config.js` (`TOOL`).
- Every existing case of the file still passes unchanged (context.ts
  exempt, dynamic `import()` refused, "does not reach outside src/tools",
  the depth check).
- **Red first:** the refuse cases for `../.x/../config.js`,
  `../..x/../config.js` (value, `import type`, `export … from`),
  `.../config.js`, `../.../../config.js`, `./`, `../`, `.` and `..` fail
  when run against the `eslint.config.mjs` of the commit T-051 starts from
  (HANDOFF's "Describes commit" stamp), and pass after; any of these that
  already passes there is named as such. Recorded in this file's "Done":
  the starting hash, how the starting config was run (the new test file
  against `git show <start>:eslint.config.mjs` restored in the working
  tree, then put back, no commit), and vitest's failed and passed case
  names and counts, as T-050's "Red, lint" entry did.
- `grep -n "still reaches" eslint.config.mjs src/tools/context.ts
  docs/architecture/overview.md` prints nothing; each of the three names
  the shortest-form rule and still states the `.constructor` gap.
- `make quality` green.

Split point: none (one config block, one test file, three comments).

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
