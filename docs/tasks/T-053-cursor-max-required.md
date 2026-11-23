# T-053 — `readCursor`: `maxPosition` required

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
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
