# T-063 — A search cursor resumes on (created_at, id), not the lowest id

- **Type:** build
- **Phase:** M2
- **Status:** todo (2026-11-25)
- **Depends on:** none (T-057, done)
- **Created:** 2026-11-25

## Goal
`export_tickets` resumed with `next_cursor` on a search-path period (under
300 matches) stops being refused with "Freshdesk gave the tickets out of
order" when a ticket has a higher id but an older `created_at` (phone
tickets, merges, restores, back-dated). Owner's real use (2026-11-25): one
day of 177 tickets refused again and again near ticket 154. It blocks real
use (owner), so it comes before T-040.

## In scope
Owner-approved design (2026-11-25), not to be redesigned:
- The search position becomes the pair `(created_at, id)` of the last
  ticket written, the key search sorts by (`created_at` desc, then id
  desc; `docs/architecture/ticket-queries.md` T-057's choices), plus the
  page that held it. A resumed read writes only tickets strictly after
  that pair in that order; the step-back keeps working on the pair.
- The disorder check becomes "the pair falls strictly": refused only when
  Freshdesk breaks its own order. A fresh read's `unordered` follows the
  same rule.
- No extra API calls. Guarantees kept: none written twice; none skipped
  that still matches; a ticket created since is left out.
- Encoding (planner, 2026-11-25): one safe-integer position, e.g.
  `2*((id*S + rel)*10 + page-1) + 1`, `S` the period's length in seconds,
  `rel` `created_at` minus the period's start; `src/tools/list.ts` does not
  change. A pair the position cannot hold (very large id on a long period)
  fails closed after the file is kept: `truncated: true`, no
  `next_cursor`, and the description or message says to narrow the period.
  A missing or unreadable `created_at` fails closed.
- Old cursors (decided 2026-11-25 by the planning session under the
  owner's delegation): **refused**, not read. Reading them would keep the
  id-only path, which is the bug. The `ListCall` export binds its cursor
  to carries a form tag (e.g. `cursor_form: 2`), so an old cursor fails
  the digest and gets list.ts's refusal ("Call again without a cursor to
  start over"), nothing sent. Old list-scan cursors are refused once too;
  CHANGELOG says so.
- `count_tickets` shares the read (count-tickets.ts) but never passes
  `resume` and does not read `unordered`: its output must not change; one
  count test with diverging fixtures shows it.
- A GET-only smoke probe (`scripts/smoke/`, like T-055's `--dates`): one
  day's search results, all pages; prints the date, results, pages read,
  "id order agrees with created_at order: yes/no", how many neighbouring
  pairs disagree and how many share a `created_at` second. No ids, names or
  subjects. A `make` target with a one-line description; the owner runs it.
- `docs/architecture/ticket-queries.md` (T-057's choices, about lines
  302-325) and the export-tickets.ts header (lines 64-86) say the pair.

## Out of scope
- The list-scan position (UTC second and ties) beyond the form tag.
- Any change to `src/tools/list.ts`.

## Spec sections to read
- `docs/architecture/ticket-queries.md` lines 290-330
- `src/tools/toolsets/core/export-tickets.ts` header, lines 40-110
- SPEC.md §13 (M1's acceptance)

## Files expected to change
- `src/tools/toolsets/core/count-tickets.ts` (`Resume`, `falls`, the
  search loop)
- `src/tools/toolsets/core/export-tickets.ts` (header, `resumeAt`,
  `positionOf`, `maxPosition`, the `ListCall`)
- `test/tools/core/export-tickets.test.ts` (pinned tests about lines
  1464-1537 re-minted or changed), `test/tools/core/count-tickets.test.ts`
- `scripts/smoke/smoke.ts`, `scripts/smoke/cli.ts`, `test/smoke.test.ts`,
  `Makefile`
- `docs/architecture/ticket-queries.md`, `CHANGELOG.md`

## Wireframes
`none`

## Acceptance
`test/tools/core/export-tickets.test.ts` (MockAgent): a search fixture
whose id order and `created_at` order diverge (e.g. ids 9001, 4000, 9000
at 10:00, 09:00, 08:00), read with `max_tickets: 1` and resumed twice,
writes all three, each once, with no refusal; the builder shows this test
failing on `06088a6`'s `src/` and quotes its name in "Done". Pair resume
cases: same second, lower id written; same second, higher id skipped; a
ticket created since (later `created_at`) left out; the step-back when a
written ticket left the results; a pair that does not fall strictly
refused, nothing kept; a pair the position cannot hold gives
`truncated: true` and no `next_cursor` with the file kept; a cursor of the
old form refused with no request sent and no file.
`test/tools/core/count-tickets.test.ts`: the diverging fixture gives the
same count as before. `test/smoke.test.ts`: the new probe target sends
GETs only and its output has no id, name or subject. `ticket-queries.md`
and the export-tickets.ts header name the pair, not "the lowest id";
`make quality` green.

**Split point** (if the session runs tight): (a) the pair cursor, its
tests, the old-cursor refusal and the docs; (b) the smoke probe and its
`make` target, as its own row.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
