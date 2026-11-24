# T-053 — `readCursor`: `maxPosition` required

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-24)
- **Depends on:** T-018
- **Created:** 2026-11-23

## Goal
`readCursor` takes its `maxPosition` as a required argument, so no list
tool can read a cursor without its own bound. Closes `docs/improvements.md`
`14487fa` code B1 / security B1 before the first list tool exists.

## In scope
- The signature at `src/tools/list.ts:90`: `maxPosition` required; the
  guard at `:91` also throws on `undefined` (a JavaScript caller or a cast).
- The header comment and the doc comment at `:83-89` brought to what is
  then true.
- `test/tools/list.test.ts`: the case that accepts position 101 with no
  bound is replaced by the acceptance's typecheck and cast cases; every
  other call with no bound gets one (the `refused` helper, the round trip
  with `Number.MAX_SAFE_INTEGER`), and `fakeTool`, the shape later list
  tools copy, passes its own bound.
- `docs/architecture/overview.md`: `readCursor(call, maxPosition)`.

## Out of scope
- `14487fa` code B2 and security B2, B3 (parked there).
- Any list tool: T-021, T-026 and the others call it with their bound.

## Spec sections to read
- SPEC.md §8.4

## Files expected to change
- `src/tools/list.ts`
- `test/tools/list.test.ts`
- `docs/architecture/overview.md`

## Wireframes
`none`

## Acceptance
`test/tools/list.test.ts`: a `readCursor` call with no bound, under a
`// @ts-expect-error` with a description, passes `make typecheck`, and
through a cast throws a `TypeError`; the case that accepted position 101
with no bound is replaced by it; the existing bound cases (the maximum
accepted and one above it refused, a maximum of 0 accepting no cursor and
position 0 only, an invalid maximum throwing) pass;
`docs/architecture/overview.md` shows `readCursor(call, maxPosition)`;
`make quality` green.

---
*Filled at `/handoff`:*

## Done
- Commits: `eb0b3df` (status), `ce26fd1` (build), and the closing commit
  `T-053: done; numeric-string bound case, task file` (2026-11-24).
- `src/tools/list.ts`: `readCursor(call, maxPosition: number)`; the guard
  throws a `TypeError` on a missing bound.
- Tests, `test/tools/list.test.ts`:
  - `readCursor: the tool's maximum position > no maximum does not
    type-check, and through a cast throws` (the `@ts-expect-error` case,
    the cast with no bound and with `undefined`, with and without a
    cursor);
  - `readCursor: the tool's maximum position > the maximum is accepted,
    one above it refused`, `> a maximum of 0 accepts no cursor and
    position 0 only`, `> a maximum of %o throws` (now with `"100"`
    through a cast, the security reviewer's Low);
  - `fakeTool` passes its own `MAX_POSITION = 100`.
- Red before the change: the vitest case above failed ("expected function
  to throw an error, but it didn't"), and `tsc` failed with `TS2578:
  Unused '@ts-expect-error' directive` at `test/tools/list.test.ts:279`.
- `docs/architecture/overview.md` shows `readCursor(call, maxPosition)`.
- Reviews: full round on `56f53c0..ce26fd1`, all three clean
  (compliance: Wireframes `none`); no scoped round.
- `make quality` exit 0: vitest 17 files, 1313 tests; `tools/checks`
  54 tests OK.

## Dead ends
none

## Open doubts
- The bound is only as tight as each tool passes: `readCursor` checks
  that one is given, not that it is right.
- The tests' `ANY = Number.MAX_SAFE_INTEGER` is a test stand-in and must
  not be copied by a tool; T-021 onward pass a named constant.

## Context pressure
low

## Next action
none: done.
