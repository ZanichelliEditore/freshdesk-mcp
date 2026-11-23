# T-034 — Tools: `list_canned_responses`, `get_canned_response`

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
- **Depends on:** T-017, T-018, T-019, T-033
- **Created:** 2026-11-23

## Goal
Canned-response reads for C3 and C10.

## In scope
- The list: folders and titles in the envelope, bounded, cost in the
  description. One response: content as text; wrapped in `<ticket_content>`
  (owner, 2026-11-23).

## Out of scope
- Suggesting or writing canned responses.

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §8.4

## Files expected to change
- `src/tools/toolsets/core/canned.ts`
- `test/tools/core/canned.test.ts`

## Wireframes
`none`

## Acceptance
`test/tools/core/canned.test.ts`: the list returns the fixture's folders and
titles in the envelope with `api_calls_used` equal to the MockAgent count
and `truncated: true` past its cap; folder and response titles pass through
the name helper, one carrying an HTML tag coming back without it (asserted);
one response returns its text with no HTML tag, inside `<ticket_content>`
(asserted); an unknown id is `isError` `not_found`; `make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
