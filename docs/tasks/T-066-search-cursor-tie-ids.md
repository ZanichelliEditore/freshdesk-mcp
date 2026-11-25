# T-066 — A search cursor holds the second and the ids written in it

- **Type:** build
- **Phase:** M2
- **Status:** todo
- **Depends on:** T-063 (done)
- **Created:** 2026-11-25

## Goal
`export_tickets` resumed with `next_cursor` on a search-path period (300
matches or fewer) is no longer refused when tickets created in the same
`created_at` second come back in ascending id order. Each ticket is
written once. This is the owner's real case, which 0.3.0 (T-063) does not
fix.

Measured (owner, 2026-11-25, `make smoke-order-probe DAY=2026-11-23`):
- 177 results.
- `created_at` never rises between neighbours.
- id order agrees with `created_at` order across all 176 neighbouring pairs.
- 1 neighbouring pair shares a `created_at` second, and within it the ids
  rise. The probe's last line answers "no" to "search's order is
  created_at, then id, both descending".

T-063's pair `(created_at, id)` must fall strictly, so a resumed read is
refused at that tie, near ticket 154 of 177. A fresh read past it gives no
cursor (`unordered`). It blocks real use, so it is the next task to take,
before any M2 work. Release 0.3.1 follows it: the owner pre-authorised the
release and the orchestrator does it. It is not a row.

## In scope
Owner-approved design (2026-11-25), not to be redesigned:
- **The search position.** It is the `created_at` second `S` of the last
  ticket written, the set of ids already written in `S` (by this call and
  by the calls before it, at most 30, one search page), and the page that
  held the last ticket written.
- **Resume.** A resumed read skips tickets whose `created_at` is later than
  `S` (they come earlier in search's order) and, within `S`, those whose id
  is in the set. It writes the rest.
- **The order check.** It requires only that `created_at` does not rise
  and that every `created_at` reads. Ties may come in any id order.
- **Guarantees.** None written twice. None skipped that still matches. A
  ticket created since with a later `created_at` is left out; a back-dated
  one is written.
- **Step-back.** Go back a page while the page is empty or its first
  result's second is at or after `S` (`<= S` as epoch seconds, i.e. not
  strictly newer). The whole tie run of `S` is then read, whatever its id
  order. The join check is "`created_at` does not rise". Each step counts
  against the budget and the time limit, as now.
- **The bound.** When the call stops and the set for the last second would
  hold more than 30 ids, the call keeps its file and returns
  `truncated: true` with no `next_cursor`. Its `note` says to export the
  rest in shorter periods (narrow `created_between`) and not to call again
  with the same cursor. This replaces T-063's `UNHELD` case: the search
  integer no longer holds an id, so a large id can no longer overflow it.
- **Encoding (planner, 2026-11-25).**
  - `src/tools/list.ts` gains one separate reader and minter, used by
    `export_tickets` only. Its form is `<position>.<id>-<id>-….<digest>`,
    or the plain form when the set is empty.
  - The ids are safe integers of 1 or more, strictly ascending, at most a
    bound the caller passes (30).
  - The digest covers the tool, the arguments, the position and the ids.
  - It has its own length cap, the longest cursor it mints (about 600
    characters).
  - The reader returns the position and the ids, numbers only. The ids are
    compared, never sent, so no cursor content reaches a URL, host or path.
  - `readCursor`, `listEnvelope` and `CURSOR_MAX_LENGTH` stay as they are,
    so the other list tools do not change.
  - The odd search position drops the id: `2*(rel*MAX_SEARCH_PAGE +
    page-1) + 1`.
- **RFC first.** This amends `list.ts`'s documented invariant: "returns a
  position and nothing else" (`docs/architecture/overview.md` line 36), and
  a cursor's form and length, which callers see. So a short RFC goes in
  before any code: `docs/rfc/proposed/` from `docs/rfc/TEMPLATE.md`, the
  `rfc-reviewer` run on it, and Active by the owner's word. T-060 set the
  precedent: its RFC lived inside its row. The RFC records the alternative
  weighed and rejected: keep one integer and stop only on a second's
  boundary, dropping the unfinished tie run. That changes what
  `max_tickets` means, and a tie run longer than `max_tickets` never moves
  forward.
- **Old cursors** (decided 2026-11-25 by this planning session under the
  owner's delegation): `CURSOR_FORM` becomes 3, so every cursor minted
  before (form 2, T-063 / 0.3.0) is refused once more, with nothing sent.
  This covers the search cursors and the list-scan cursors. Reading a form-2
  search cursor as the set `{id}` would write twice the tie tickets above
  that id, which T-063 had already written, so it is not read. CHANGELOG
  says so.
- **`count_tickets`** (decided 2026-11-25): it shares `readPeriod`, but it
  never passes `resume` and does not read `unordered`, so its output does
  not change. A fresh read's `unordered` now comes only from a `created_at`
  that rises or does not read. One count test shows it.
- **Docs.** These no longer say "created_at, then id, both descending":
  - `docs/architecture/ticket-queries.md` (T-057's choices, about lines
    302-336)
  - `docs/architecture/overview.md` (lines 36, 48, 49; line 55's probe
    entry is left as it is)
  - the `export-tickets.ts` header (about lines 64-110)
  - the `count-tickets.ts` `Resume` doc comment and the disorder message

  Each says the second plus the id set, and the step-back rule.
  `CHANGELOG.md` gets an "Unreleased" entry.

## Out of scope
- The list-scan position (UTC second and ties by count), beyond the form
  bump.
- The smoke probe (`scripts/smoke/`): it measured what it had to.
- The 0.3.1 version bump and release (the orchestrator).

## Spec sections to read
- `docs/architecture/ticket-queries.md` lines 295-340
- `src/tools/toolsets/core/export-tickets.ts` header, lines 40-110
- `docs/tasks/T-063-search-cursor-pair.md` (Acceptance and Done)

## Files expected to change
- `docs/rfc/proposed/` then `active/`: the new RFC (`make rfc-sync`)
- `src/tools/list.ts` (the ids-form reader and minter)
- `src/tools/toolsets/core/count-tickets.ts` (`Resume`, `keyOf`,
  `precedes`, `falls`, the step-back, the skip, `lowest`, the disorder
  message)
- `src/tools/toolsets/core/export-tickets.ts` (header, `CURSOR_FORM` 3,
  `UNHELD`, `maxPosition`, `resumeAt`, `positionOf`, the cursor's
  read and mint)
- `test/tools/list.test.ts`, `test/tools/core/export-tickets.test.ts`,
  `test/tools/core/count-tickets.test.ts`
- `docs/architecture/ticket-queries.md`, `docs/architecture/overview.md`,
  `CHANGELOG.md`

## Wireframes
`none`

## Acceptance
**The RFC.** It is in `docs/rfc/active/` after `make rfc-sync`, Status
Active by the owner's word, with the `rfc-reviewer`'s findings resolved or
dismissed in it. It states:
- the ids form and its bound;
- the amended `list.ts` invariant;
- the one-integer alternative and why it was rejected;
- form-2 cursors refused.

**`test/tools/list.test.ts`.**
- The ids form round-trips, with the empty set included.
- Each of these is refused as `validation`, `http_status: null`, its
  message not quoting the cursor:
  - ids unsorted, duplicated, 0, or past the safe-integer range;
  - more ids than the bound;
  - over the length cap;
  - an id or the position edited;
  - an ids-form cursor given to `readCursor`.
- The existing `readCursor` and `listEnvelope` tests pass unchanged.

**`test/tools/core/export-tickets.test.ts`** (MockAgent), a new `describe`
"T-066":
- **Regression.** A fixture with a tie of 3 tickets in one second, ids
  ascending, across the page 1 to page 2 boundary. Two variants: one where
  `max_tickets` cuts just before the tie, one where it cuts inside it. Each
  is read and resumed until done, writes every ticket once with no refusal,
  and its last call has neither `next_cursor` nor `truncated`. The builder
  shows it failing on `dd33b08`'s `src/` (`src/` last changed in `823d4eb`)
  and quotes its name in "Done".
- **Ties in either order.** The same resume, with ids ascending and with ids
  descending within the second, writes each ticket once.
- **Within `S`.**
  - An id in the set is skipped.
  - An id not in the set is written, whether higher or lower than the ids
    in the set.
  - Across two resumes inside one tie run, the set is the union.
- **Outside `S`.** A ticket created since with a later `created_at` is left
  out; a back-dated one is written.
- **Step-back.** A written ticket left the results, so an unwritten ticket
  of `S` now sits on the page before the position's page. That ticket is
  written once.
- **`created_at` rises.**
  - A resumed call is refused, nothing kept.
  - A fresh call gives `unordered` and no cursor.
- **Missing or unreadable `created_at`.** T-063's cases pass on the new
  form.
- **The bound.**
  - Exactly 30 ids written in `S` gives a `next_cursor` that resumes
    correctly.
  - 31 keeps the file, with `truncated: true`, no `next_cursor`, and the
    note saying to narrow the period and not to reuse the cursor (the
    description says the same).
- **Cursors refused**, each with no request and no file:
  - a form-2 search cursor and a form-2 list cursor (minted as `dd33b08`
    mints them);
  - an input carrying its own `cursor_form`;
  - a forged ids-form cursor whose digest does not match.
- **T-063's tests.** They are re-minted on form 3. "the largest id a 31-day
  cursor holds" is replaced by the bound cases.

**`test/tools/core/count-tickets.test.ts`.** A fixture with ascending ids in
one second, and T-063's diverging and missing-`created_at` fixtures, each
count the asserted total with no `truncated` key.

**Docs.** `ticket-queries.md`, `overview.md` (lines 36, 48 and 49) and the
`export-tickets.ts` header no longer claim "created_at, then id, both
descending". They name the second plus the id set, the bound and the
step-back rule. The `CHANGELOG.md` "Unreleased" entry says:
- the tie fix;
- form-2 cursors are refused once;
- the new no-cursor case past 30 ids in one second.

**`make quality`** is green.

**Split point** (if the session runs tight):
- (a) the RFC, plus `list.ts`'s ids form and its tests (no caller yet,
  inert);
- (b) the export and count changes, their tests, the docs and CHANGELOG,
  as its own row.

(a) alone must not be released: 0.3.1 waits for (b). Say so in "Done" if
(b) is split off.

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
