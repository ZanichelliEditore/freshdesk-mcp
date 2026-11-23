# T-018 — List envelope and cursor

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
- **Depends on:** T-011
- **Created:** 2026-11-23

## Goal
Every list tool returns `{items, next_cursor?, has_more, truncated?,
api_calls_used}` (SPEC §8.4) through one function, with an opaque cursor
(`docs/improvements.md` `9676d5b`, `e85b3db`).

## In scope
- Envelope builder; `truncated` carried from `listAll` / `paginate` caps.
- Cursor: encodes a position and a digest of the tool name, every argument
  of the call and the position, nothing else. It is model-supplied input:
  validated before any request.

## Out of scope
- Any tool (T-021 is the first user).

## Spec sections to read
- SPEC.md §8.4
- SPEC.md §7.1

## Files expected to change
- `src/tools/list.ts` (or `format.ts`, builder says which)
- `test/tools/list.test.ts`

## Wireframes
`none`

## Acceptance
`test/tools/list.test.ts`: the envelope always has `items`, `has_more` and
`api_calls_used`; `next_cursor` is present exactly when `has_more` is true;
a source cut by a cap gives `truncated: true`; a cursor round-trips its
position; a cursor used with another tool or with any argument of the call
changed, one whose digest does not match (it covers the tool name, every
argument and the position), one over the length cap and one that does not
decode are each a `validation` error with no request sent; no cursor content
can become a URL, host or path (it decodes to a whole number and a digest
only); `make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
