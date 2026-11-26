# T-073 — Tool: `categorize_tickets`

- **Type:** build
- **Phase:** M2
- **Status:** done (2026-11-26)
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
- `3a2ba75`: `src/tools/toolsets/write/categorize-tickets.ts` (new), wired in
  `write/index.ts` and `eslint.tool-imports.json` (T3); `checkPreviewId`
  gives back the checked items and `canonical` reads each value once
  (improvements `70be151`, `f64d743` done).
- `3b3bec6`: full-round fixes: `may_have_been_applied` on a refused write
  sent and answered `network`/`server`; `duplicate_field` at the preview;
  `expires_at` from `mintPreviewId`.
- Acceptance, `test/tools/write/categorize-tickets.test.ts` (29 cases):
  "sends GETs only, one per ticket, and returns current → new and a
  preview_id"; "sends one PUT per ticket, the previewed fields as ids and
  choices, and a per-ticket result"; "a ticket added is refused with 0
  PUTs"; "a field changed, dropped or added is refused with 0 PUTs";
  "cap + 1 items are refused with nothing sent, the schema not loaded";
  "cut by the deadline: the tickets not read are not previewed, the
  preview_id covers those read"; "cut by the budget: below the reserve the
  next read is not sent, the rest not previewed"; "%s is
  field_not_writable, nothing sent" (status, priority, group, agent,
  requester); "cut by the deadline: the rest not attempted; the same
  preview_id then writes only those"; "cut by the budget: a write the
  limiter refuses and every one after it are not attempted" (with the
  second confirm); "the confirm writes only the checked values".
  `test/tools/preview.test.ts` "the checked items it gives back";
  `test/server.test.ts` "the write wiring".
- `make quality` exit 0: Vitest 3924 passed, `tools/checks` 138 OK.

## Dead ends
none

## Open doubts
- A confirm item binds the key as typed (a label), re-resolved against the
  schema at confirm: a relabel inside the 15 minutes could move the write
  to another custom field (improvements `3a2ba75`, owner question).
- Values are checked only at the confirm (the core's `ticketInput`; tools
  cannot import it): a bad choice shows in the preview wrapped as
  untrusted and refuses that ticket at the confirm.
- `may_have_been_applied` tickets count as `refused` and can be re-sent
  within the 15 minutes (improvements `3b3bec6`).

## Context pressure
ok

## Next action
none (done)
