# T-057 — `export_tickets` pages: `max_tickets` and a cursor, one file per call

- **Type:** build
- **Phase:** M1
- **Status:** doing (2026-11-25)
- **Depends on:** T-037, T-039
- **Created:** 2026-11-25

## Goal
The caller asks for `n` tickets and pages a large export: each call writes
up to `max_tickets` rows to its own file and returns `next_cursor` while the
period has more (owner's request, 2026-11-25). Today one call writes what
fits in 30 s (about 4,000 tickets, about 40 with threads) and stops with
`truncated: true`.

## In scope
- `max_tickets` input (1 to a named cap); `cursor` input; `next_cursor` in
  the result while more remain, absent on the last page.
- The cursor uses the existing cursor helper (`src/tools/list.ts`,
  `readCursor` with its `maxPosition`): bound to the call's other
  arguments, tampering refused with no request and no file.
- One file per call under a new generated name; never appending to or
  overwriting an earlier file (T-037's file rules unchanged).
- Each ticket exactly once across the pages of a period (the read keeps a
  stable order; the position resumes after the last ticket written).
- Description and README (`export_tickets` section) updated.

## Out of scope
- Background or resumable-after-crash exports; any other format.

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §8.4
- SPEC.md §7.2

## Files expected to change
- `src/tools/toolsets/core/export-tickets.ts`
- `src/tools/toolsets/core/count-tickets.ts` (the shared read) if needed
- `test/tools/core/export-tickets.test.ts`
- `README.md`, `docs/architecture/overview.md`

## Wireframes
`none`

## Acceptance
`test/tools/core/export-tickets.test.ts` (temporary directory, MockAgent):
`max_tickets` (1 to a named cap) bounds the rows a call writes; a call that
stops before the period's end (the caller's `max_tickets`, the budget, the
time limit or a limiter refusal) returns `next_cursor`, and the same
arguments with that cursor write the next tickets to a new file under a new
generated name, never appending to or overwriting the earlier one; the
pages of a period read in sequence hold each fixture ticket exactly once; a
cursor given with other arguments, or tampered, is refused with no request
and no file; the last page has no `next_cursor`; the description names
`max_tickets`, the cursor and one file per call; the file rules of T-037
are unchanged (its tests still pass); `make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
