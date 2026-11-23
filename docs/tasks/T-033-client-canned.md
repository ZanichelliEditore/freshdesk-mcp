# T-033 — Client resource: canned responses (read)

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
- **Depends on:** T-013
- **Created:** 2026-11-23

## Goal
`src/client/resources/canned.ts`: folders, a folder's responses, one
response.

## In scope
- zod schemas with unknown keys passed through.

## Out of scope
- Create or update (`canned_write`, M5+).

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §7.1

## Files expected to change
- `src/client/resources/canned.ts`
- `test/client/resources/canned.test.ts`
- `test/fixtures/canned.ts`

## Wireframes
`none`

## Acceptance
`test/client/resources/canned.test.ts` (MockAgent): folders, a folder's
responses and one response return asserted ids, titles and content; a
malformed item is `server`; a 404 is `not_found`; `make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
