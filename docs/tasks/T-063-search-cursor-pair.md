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
  that still matches; a ticket created since with a later `created_at` is
  left out (a back-dated one is written).
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
  to carries a form tag (e.g. `cursor_form: 2`, placed where no input reaches it: after the
  spread of the arguments, or in the `tool` string), so an old cursor fails
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
`test/tools/core/export-tickets.test.ts` (MockAgent):
- Regression: a search fixture whose id order and `created_at` order
  diverge (e.g. ids 9001, 4000, 9000 at 10:00, 09:00, 08:00), read with
  `max_tickets: 1` and resumed twice, writes all three, each once, no
  refusal, and the third call has neither `next_cursor` nor `truncated`;
  the builder shows it failing on `06088a6`'s `src/` and quotes its name
  in "Done".
- Pair cases: same second, lower id written; same second, higher id
  skipped; a ticket with a later `created_at` created since is left out; the
  step-back when a written ticket left the results, on a fixture where the
  id test and the pair test disagree (the next page starts with a higher id
  but an older `created_at` than the position); a pair that does not fall
  strictly refused, nothing kept, the message no longer saying "id order".
- Missing or unparseable `created_at` on one result: a fresh read gives
  `unordered` (no `next_cursor`); a resumed read is refused, nothing kept,
  also when that result sits between two tickets out of order with each
  other and when it is the first result of a stepped-back page.
- A pair the position cannot hold: the file is kept, `truncated: true`, no
  `next_cursor`, and the message says to narrow the period and not to call
  again with the same cursor (the description says the same); a position
  outside the period or the search still fails the call (an explicit
  predicate, not a broad `catch`).
- Cursors: a search and a list cursor as `06088a6` mints them (the
  existing `mint` helper, no form tag) are each refused with no request and
  no file; an input carrying its own `cursor_form` key, and a forged
  new-form position decoding to id 0, are refused the same way.
`test/tools/core/count-tickets.test.ts`: the diverging fixture, and one
with a ticket missing `created_at`, each count 3 with no `truncated` key.
`test/smoke.test.ts`: the new probe target sends GETs only; its output is
counts and yes/no only (no id, name, subject, `created_at` value,
`FRESHDESK_DOMAIN` value or API key), and it answers both "id order
agrees with `created_at` order" and "within a shared `created_at` second,
ids fall"; a failed probe prints its error code only and exits non-zero;
its `make` target has a one-line description. `ticket-queries.md` and the
export-tickets.ts header name the pair, not "the lowest id", and say a
ticket created since with a later `created_at` is left out while a
back-dated one is written; `CHANGELOG.md` says old cursors are refused
once; `make quality` green.

**Split point** (if the session runs tight): (a) the pair cursor, its
tests, the old-cursor refusal, the docs and CHANGELOG; (b) the smoke probe
and its `make` target, as its own row. Taking (b) ships the fix before the
same-second tie-break (id desc) is measured: unmeasured, a wrong
tie-break makes a resumed read refuse (fails closed), not skip. Say so in
"Done" if (b) is split off.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
