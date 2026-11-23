# T-051 — Lint: allow-list of shortest-form relative specifiers in src/tools/**

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
- **Depends on:** T-050
- **Created:** 2026-11-23

## Goal
In the `src/tools/**` lint block, a specifier that starts with `.` is
accepted only in its shortest form and refused otherwise (fail-closed),
and one starting with `/` or `file:` is refused, replacing T-050's deny
regex. Closes the gap T-050's scoped review round
found (security-reviewer, list A, range `416641e..d8b7967`): a segment
starting with a dot followed by `..` (`../.x/../config.js`,
`../..x/../config.js` in `src/tools/x.ts`) gets past the deny regex and the
anchored `config` globs, and `config` is the module that returns the key.
Owner's choice, 2026-11-23.

## In scope
- `eslint.config.mjs`, the `src/tools/**` block (`src/tools/context.ts`
  exempt as today): T-050's deny `regex` pattern is replaced by one that
  refuses, fail-closed:
  - every specifier starting with `.` unless it is in shortest form: `./`
    or a run of `../`, in either case followed by one or more plain
    segments joined by single `/`. A plain segment is
    `[A-Za-z0-9_-][A-Za-z0-9._-]*`: it may not start with a dot, and it
    has no `\`, `%`, `?`, `#`, space, tab, LF or CR (the URL parser strips
    tab, LF and CR, so `../con\tfig.js` reaches `config`);
  - every specifier starting with `/` or `file:` (absolute and URL forms).

  Shape (the planner's, adapted):
  `^(?!(?:\./|(?:\.\./)+)SEG(?:/SEG)*$)\.|^/|^file:` with
  `SEG = [A-Za-z0-9_-][A-Za-z0-9._-]*`, compiled under the `u` flag (ESLint
  adds it to a `regex` pattern; it also adds `i` unless `caseSensitive`,
  harmless here). Two patterns instead of one alternation are fine if each
  carries its own message. No `allowTypeImports` on it: type imports and
  `export … from` must be in shortest form too (as today). So `.`, `..`,
  `./`, `../`, `.x/config.js`, `.../config.js`, `../context.js/`,
  `./../x`, `../a/../x`, `../.x/../x`, `../.../config.js`, `/x`, `file:x`
  are all refused.
- The `group` pattern (config, client/http, schema/output, schema/index,
  and now `**/dist/**`, so `../../dist/config.js` is refused) stays as it
  is otherwise, `allowTypeImports: true` and its message unchanged; the
  dynamic `import()` ban stays.
- The new pattern's message says what the shortest form is and how to
  write it; it differs from the group's, so a test can tell which fired.
- `test/lint-rules.test.ts`: the cases of the Acceptance.
- Comments brought to what is then true: the dot-segment gap closed; still
  not refused by lint and stated as such: `.constructor` on the client or
  the schema service, `createRequire` from `node:module`, and a re-export
  through a module outside `src/tools/`. In `eslint.config.mjs` (the
  block's comment), `src/tools/context.ts` (lines 15–20 as of `81ee087`),
  `docs/architecture/overview.md` (the `src/tools/context.ts` entry, its
  "known gap" clause).
- If T-017 or T-018 lands first and uses an import the new rule refuses,
  T-051 may touch that file to fix the specifier, and nothing else in it.

## Out of scope
- Closing the three gaps the comments state (`.constructor`,
  `createRequire`, re-export from outside `src/tools/`); `.constructor`
  and `src/client/rate-limit.ts` in the ban list stay parked (`d8b7967`).
- Bare specifiers (packages, `node:`): unchanged; the group pattern
  covers them as today.
- Case-folded names (`../Config.js`) on a case-insensitive filesystem: not
  claimed; CI is Linux. One line in "Open doubts" at handoff if it matters.
- Any change outside the files below, and in T-017's or T-018's files
  anything but a refused specifier.

## Spec sections to read
- SPEC.md §7.1
- SPEC.md §7.3
- SPEC.md §11

## Files expected to change
- `eslint.config.mjs`
- `test/lint-rules.test.ts`
- `src/tools/context.ts` (comment only)
- `docs/architecture/overview.md`
- only if needed (In scope, last item): a `src/tools/` file of T-017 or
  T-018

## Wireframes
`none`

## Acceptance
`test/lint-rules.test.ts`, in-memory `lintText` as today (`TOOL` =
`src/tools/x.ts`, `CORE` = `src/tools/core/x.ts`). "Refused by the rule"
means `@typescript-eslint/no-restricted-imports` with the new pattern's
own message among the messages, so the new pattern, not the group, is
shown to fire.

- **Refused by the rule, generated (a property, not a list):** for each of
  the four modules (`config` from `TOOL`; `client/http`, `schema/output`,
  `schema/index` from `CORE`), written in its shortest form with `.js`,
  and for each position in its path (after the `../` run and between
  every two segments), the specifier with `<seg>/..` inserted, `seg` in
  `.x`, `..x`, `...`, `x`, `x.`; the specifier with `./` inserted at each
  position; with `/` doubled at each position; with a segment's `.` or
  `..` written `%2e` / `%2e%2e`; with a tab, a LF and a CR inserted in a
  segment. The test counts its cases and asserts the count is non-zero.
- **Refused by the rule, explicit regression list (kept):** `..//config.js`,
  `"..\\config.js"`, `../%63onfig.js`, `../config.js?x`, `../config.js#x`,
  `./../config.js`, `.././config.js`, `../tools/../config.js`,
  `../.x/../config.js`, `../..x/../config.js`, `../.../../config.js`,
  `../.../config.js`, `"../con\tfig.js"`, `.x/config.js`, `.../config.js`,
  `../context.js/`, `./`, `../`, `.`, `..`, `/src/config.js`,
  `file:///src/config.js` (`TOOL`); `../../client//http.js`,
  `../../schema//index.js`, `../../tools/../config.js` (`CORE`).
- **Refused, the other forms:** `import type { X } from
  "../.x/../config.js"`, `export { x } from "../.x/../config.js"` and
  `export * from "../..x/../config.js"` (`TOOL`).
- **Refused by the group:** `../../dist/config.js` (`CORE`), value import.
- **Allow** (no rule), only cases not already in
  `test/lint-rules.test.ts` (lines 144–162 as of `81ee087` hold
  `./config.js`, `../context.js`, `../../client/resources/agents.js` and
  the type imports): `../../client/errors.js` (`CORE`, value import:
  T-019 needs `FreshdeskError`), `zod` and `node:path` (`CORE`).
- Every existing case of the file still passes unchanged (context.ts
  exempt, dynamic `import()` refused, "does not reach outside src/tools",
  the depth check).
- **Red first:** the cases for forms not refused today (at least
  `../.x/../config.js`, `../..x/../config.js` in all three forms,
  `../.../../config.js`, `../.../config.js`, `"../con\tfig.js"`,
  `.x/config.js`, `.../config.js`, `../context.js/`, `./`, `../`, `.`,
  `..`, `/src/config.js`, `file:///src/config.js`, `../../dist/config.js`,
  and the generated ones) fail when run against the `eslint.config.mjs` of
  the commit T-051 starts from (HANDOFF's "Describes commit" stamp), and
  pass after; any of them that already passes there is named as such.
  Recorded in this file's "Done": the starting hash; the method (the new
  test file run against `git show <start>:eslint.config.mjs` restored in
  the working tree, then the new config put back, no commit); that
  `git diff --quiet <start> -- eslint.config.mjs` succeeded after the
  restore and before putting it back; vitest's failed and passed case names
  and counts, as T-050's "Red, lint" entry did.
- `grep -n "still reaches"` over `eslint.config.mjs`, `src/tools/context.ts`
  and `docs/architecture/overview.md` prints nothing; each of the three
  names the shortest-form rule and states `.constructor`, `createRequire`
  and a re-export from outside `src/tools/` as not refused by lint
  (`grep -c createRequire` is at least 1 in each).
- `make quality` green.

Split point: none (one config block, one test file, three comments).

**Re-planned 2026-11-23** after the full review round on
`81ee087..b3fdd32` and the planner's review (orchestrator's decisions):
a plain segment is defined by its allowed characters and may not start
with a dot, so `../.../config.js`, first planned as an allow case, is now
refused (simpler and stricter; the owner had not confirmed the allow case,
and tab, LF and CR in a segment reach `config`); refuse cases generated as
a property; `/` and `file:` refused; `**/dist/**` in the group; the
comments name `createRequire` and a re-export from outside `src/tools/`;
`../../client/errors.js` allowed; the red-first record checks the restore;
SPEC §7.1 added.

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
