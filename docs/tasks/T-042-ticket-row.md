# T-042 — Compact ticket row

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
- **Depends on:** T-015, T-017
- **Created:** 2026-11-23

## Goal
One function turns a raw ticket into the compact row of SPEC §8.4, shared by
`get_ticket`'s recent tickets, `list_tickets`, `search_tickets`,
`triage_queue` and `find_similar_tickets`.

## In scope
- Row: id, subject (120 characters at most, wrapped by T-017), status and
  priority names, category labels, updated (ISO 8601 with zone), agent,
  group; built on `ticketOutput` as it is; nothing about hidden fields is
  added or tested here (owner, 2026-11-23). Agent and group names and labels
  are not wrapped: T-017's name helper strips HTML and caps the length.
- The `detail` variant: the full labelled ticket, customer text wrapped.

## Out of scope
- Any tool; urgency signals (T-029).

## Spec sections to read
- SPEC.md §8.4
- SPEC.md §7.3
- SPEC.md §7.4

## Files expected to change
- `src/tools/rows.ts`
- `test/tools/rows.test.ts`

## Wireframes
`none`

## Acceptance
`test/tools/rows.test.ts`: a fixture ticket gives a row with the asserted
id, status and priority names, category labels, agent and group names and an
ISO date with zone; a subject of 121 characters is cut to 120 on a
code-point boundary and is inside `<ticket_content>`; an agent or group name
carrying an HTML tag comes back without it, one over the cap is cut, and
neither is inside `<ticket_content>` (asserted); a category label carrying
an HTML tag comes back without it (asserted); an agent id missing from a
truncated list is said to be not loaded, not guessed; `make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
