# T-018 — List envelope and cursor

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-23)
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
- `86d293c` (build): `src/tools/list.ts` (`listEnvelope`, `readCursor`,
  `CURSOR_MAX_LENGTH`; module picked: `list.ts`), `test/tools/list.test.ts`.
  Red first (module missing), then green; six hand mutations each caught.
- `14487fa` (full-round fixes): arguments that are not JSON throw a
  `TypeError` (`test/tools/list.test.ts` "arguments are the raw JSON ones:
  anything else throws"); `readCursor(call, maxPosition?)` refuses a
  position above the tool's bound ("readCursor: the tool's maximum
  position"); non-canonical forms with the real digest refused
  ("readCursor: non-canonical forms carrying the real digest"); messages
  reworded.
- Acceptance, by test name: "listEnvelope" (keys, `next_cursor` exactly
  when `has_more`, `truncated`), "readCursor: round trip", "readCursor:
  refused before anything is sent" (another tool, each argument changed,
  edited position or digest, over the cap, undecodable), "readCursor before
  a request: nothing is sent on a refusal" (MockAgent call count 0).
- Imports: `node:crypto` and `../client/errors.js`, both on T-051's list.

## Dead ends
none

## Open doubts
- The digest is unkeyed (stated in the header): a forged cursor carries a
  whole number only, bounded by `maxPosition` when the tool passes one.
- `maxPosition` is optional until T-021 (parked `14487fa`, HANDOFF's
  proposed plan changes).
- With no cursor, arguments that are not JSON are caught only by
  `listEnvelope`, after the requests (fails closed; parked `14487fa`).

## Context pressure
ok

## Next action
none (done). Next session: see `docs/HANDOFF.md`.
