# T-042 — Compact ticket row

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-24)
- **Depends on:** T-015, T-017, T-050, T-051
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
- Commits: `d38404f` (status), `5db3dea` (`src/tools/rows.ts`, tests,
  overview), `44ffa71` (full review fixes), the close commit `T-042: done;
  task file, parked review items, journal` (this file, PLAN,
  improvements, journal).
- `src/tools/rows.ts`: `ticketRow(ctx, schema, ticket)` gives `{id, subject,
  status, priority, category, updated, agent, group}`; `ticketDetail(ctx,
  schema, ticket)` gives `{id, updated, fields}`. Both use the context's
  `ticketOutput` one field at a time (the schema narrowed to that field),
  then `fieldValue` for each value and `plainName` for each label.
  `SUBJECT_CAP = 120`; types `RowContext`, `TicketRow`, `TicketDetail`. No
  new entry in `eslint.tool-imports.json`.
- Tests, `test/tools/rows.test.ts`:
  - acceptance: `ticketRow::gives id, status and priority names, category
    labels, agent, group and an ISO date with zone`, `::cuts a subject of
    121 code points to 120 on a code-point boundary, inside the block`,
    `::strips an HTML tag from agent and group names, outside the block`,
    `::cuts an agent or group name over the cap, outside the block`,
    `::strips an HTML tag from a category label`, `::says an agent id
    missing from a truncated list is not loaded, not guessed`;
  - beyond it: `ticketRow::keeps a subject of exactly 120 code points
    whole, with no marker`, `::names an agent id missing from a complete
    list as unknown`, `::keeps an unassigned agent and group as null`,
    `::wraps a category value that is not one of the field's choices`,
    `::takes the category fields from uncategorised_fields when the team
    sets it`, `::selects a nested field when uncategorised_fields lists one
    of its levels by %s` (API name, label), `::keys a later category field
    whose label cleans to a used one by its API name`, `::drops no category
    value when the fallback key is itself taken`, `::has an empty category
    with no nested field and no team list`, `::gives updated null for %s`
    (no zone, not a date, a number, absent, month 13, an offset without a
    colon);
  - `ticketDetail::gives every field by label, customer text wrapped and
    names plain`, `::gives the description as text inside the block`,
    `::keys a later field with a used label by its API name, each value by
    its own type`, `::keys a field whose label cleans to a used one by its
    API name`, `::drops no value when the fallback key is a label already
    used`, `::strips an HTML tag from a field label used as a key`.
- Failed first: the whole file at import (no module). After the module was
  written, `::wraps a category value that is not one of the field's
  choices` still failed because its expectation was wrong: the value is the
  whole nested path, so the expectation was corrected. In the review pass, 6
  of the 8 new tests failed first: the two level-selection rows, both
  category key tests, the `+0100` row and the detail's three-field fallback
  test. Month 13 and the detail's `<b>Size</b>`/`Size` passed at once
  (`Date.parse` gives NaN for month 13; the detail already deduplicated on
  the cleaned label). The first version of the category fallback test never
  produced a collision, because fields come in schema order; it was rebuilt
  so the literal `Shelf (cf_shelf)` comes before `cf_shelf`.
- Choices: row keys are fixed English names; a field missing from the
  schema, or hidden by the team, leaves its key out, while the subject is
  always shown. The category reuses the uncategorised definition (SPEC
  §10): `uncategorised_fields` (label, API name or a nested level's name)
  else the first nested field. `updated` is normalised to UTC and accepts
  a zone of `Z` or `±HH:MM` only. A cut subject's note is the fixed text
  "get_ticket returns the full subject". The detail shape is `{id,
  updated, fields}`. Keys are deduplicated as `Label (api_name)`, then
  `(2)`, `(3)` and so on. `fold` is a local one-line copy, since
  `src/schema/output.js` is not on the lint list.
- Review: full round on `d38404f..5db3dea`: security none, compliance
  Wireframes `none`, code 2 Medium and 3 Low, all applied in `44ffa71`.
  Scoped round on `44ffa71`: list A empty for all three; list B (code B1 to
  B3) parked in `docs/improvements.md`.
- Acceptance: every line met; `make quality` green.

## Dead ends
none

## Open doubts
- A calendar-impossible day passes `isoUpdated`: `Date.parse` rolls
  `2026-02-30T00:00:00Z` over to `2026-03-02T00:00:00.000Z` (checked on
  Node v26.13.1, 2026-11-24), so "valid ISO 8601" in the header and the
  overview is too strong (parked as B1).
- T-043 must match the category fields the same way, a nested level's name
  selecting its parent nested field included: `categoryFields` in
  `rows.ts` is a local copy, not a shared function (parked as B2).

## Context pressure
Low: one builder session, files read by range.

## Next action
none: done.
