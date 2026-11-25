# T-073 — Tool: `categorize_tickets`

- **Type:** build
- **Phase:** M2
- **Status:** todo (2026-11-25)
- **Depends on:** T-070, T-071
- **Created:** 2026-11-25

## Goal
`categorize_tickets` previews and applies category changes on a list of `{ticket_id, fields}` (C1, C8): without `confirm` a table current → new and a `preview_id`; with `confirm: true` and the id, one PUT per ticket with a per-ticket result.

## In scope
- Its entry's set: type and any custom field; status, priority, group, agent refused.
- Cap 50 (SPEC §8.2). 50 PUTs at 2 req/s and T-014's 10 s rule do not fit one call: apply what fits, report the rest as not attempted, and the same `preview_id` confirms those tickets later (OD-13, owner 2026-11-25). No re-GET of the tickets at confirm (OD-15).
- Per-ticket result: written, refused (with code), not attempted.

## Out of scope
- Bulk re-categorisation of old tickets (C8 proposal, not committed).
- No release with `write` before T-074 is `done` (OD-16, owner 2026-11-25).

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §9
- SPEC.md §3 (C1, C8)

## Files expected to change
- `src/tools/toolsets/write/categorize-tickets.ts` (new), `index.ts`
- `test/tools/write/categorize-tickets.test.ts` (new)
- `CHANGELOG.md`

## Wireframes
`none`

## Acceptance
`test/tools/write/categorize-tickets.test.ts` (MockAgent): a preview sends GETs only and returns current → new and a `preview_id`; confirm with that id sends one PUT per ticket and a per-ticket result; confirm with a ticket added or a field changed is refused with 0 PUTs; cap + 1 items refused with nothing sent; a preview cut by the call's deadline or budget lists the tickets not read as not previewed, and its `preview_id` covers only those read; status, group or agent in fields `field_not_writable`; a deadline or budget cut reports the rest as not attempted, and a second confirm with the same `preview_id` for those tickets only writes them; `make quality` green.

Split point: the preview path first, the confirm path second.

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
