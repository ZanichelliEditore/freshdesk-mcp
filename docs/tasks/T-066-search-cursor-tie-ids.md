# T-066 — A search cursor holds the second and the ids written in it

- **Type:** build
- **Phase:** M2
- **Status:** done (2026-11-25)
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
  result is not newer than `S` (its second `<= S`). The whole tie run of
  `S` is then read, whatever its id order. The join check is "`created_at` does not rise". Each step counts
  against the budget and the time limit, as now.
- **The bound.** When the call stops and the set for the last second would
  hold more than 30 ids, the call keeps its file and returns
  `truncated: true` with no `next_cursor`. Its `note` says not to call
  again with the same cursor, and to export the period without
  `max_tickets` (up to 300 matches fit one call, budget permitting) or in
  shorter periods. A one-day period cannot be narrowed further.
  The description says the same. This replaces T-063's `UNHELD` case: the
  search integer no longer holds an id, so a large id can no longer
  overflow it.
- **The set resets.** It holds only the ids of `S`. When a call writes a
  ticket of an older second, the set starts again with that ticket's id.
- **Encoding (planner, 2026-11-25).**
  - `src/tools/list.ts` gains one separate reader and minter, used by
    `export_tickets` only. Its form is `<position>.<id>-<id>-….<digest>`,
    or the plain form when the set is empty.
  - The ids are canonical decimals (`[1-9][0-9]{0,15}`, no leading zero,
    sign or empty segment), safe integers, strictly ascending, at most a
    bound the caller passes (30).
  - The reader checks the length first, then one anchored pattern with no
    nested quantifiers. It still takes a `maxPosition`; for
    `export_tickets` that becomes the period's real bound, since the
    position no longer holds an id.
  - The minter throws a `TypeError` for more ids than the bound, ids not
    strictly ascending, an id below 1 or an unsafe one: it never trims or
    sorts (as `listEnvelope` throws today, `list.ts:74-76`).
  - The digest covers the tool, the arguments, the position and the ids
    array, the empty array included, so a plain cursor and an ids cursor
    never verify as each other.
  - Its length cap is the longest cursor it can mint, computed (a 16-digit
    position, 30 ids of 16 digits, their dashes, two dots and the 43-character
    digest), not a round figure.
  - The reader returns the position and the ids, numbers only. The ids are
    compared, never sent, so no cursor content reaches a URL, host or path.
  - `resumeAt` refuses, after the digest: an odd position whose second is
    outside the period or whose page is over `MAX_SEARCH_PAGE`, and ids on
    position 0 or on an even (list) position.
  - **Threat model** (security-reviewer, 2026-11-25). The digest stays
    unkeyed. It catches mistakes and edits, not forgery: anyone can
    recompute it. A forged position can already skip every ticket newer
    than a chosen second; a forged id set adds the skipping of chosen ids
    in that second. The RFC states this and either accepts it, with the
    reason, or keys the digest (a per-process key also refuses cursors
    after a restart). `list.ts`'s header (lines 16-19, "can only carry a
    whole number") is rewritten either way. The RFC also says, in one
    sentence, that a `next_cursor` now shows ids of tickets already
    written.
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
  forward. Write the RFC first and ask for the owner's word early: the
  design is already approved. If the word does not come in the session,
  the session ends with the RFC Proposed and no code, and hands off as
  `doing` (as T-040 did).
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
  - `overview.md` line 55: drop "(export_tickets' cursor pair)"
  - `ticket-queries.md` about line 329: "a second and an id do not fit one
    cursor position" becomes "the list scan keeps ties by count"

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
- form-2 cursors refused;
- the threat model: the unkeyed digest accepted with its reason, or keyed;
  and that a `next_cursor` shows ids already written.

**`test/tools/list.test.ts`.**
- The ids form round-trips, with the empty set included. The longest
  cursor (the highest position, 30 ids of `Number.MAX_SAFE_INTEGER`)
  round-trips; one character more is refused.
- Each of these is refused as `validation`, `http_status: null`, its
  message not quoting the cursor:
  - ids unsorted, duplicated, 0, or past the safe-integer range;
  - a leading zero, a sign, an empty segment (`..`, `--`, a trailing `-`);
  - more ids than the bound;
  - over the length cap;
  - an id or the position edited;
  - an ids-form cursor given to `readCursor`, and a plain cursor from
    `listEnvelope` given to the ids reader.
- The minter throws a `TypeError` for more ids than the bound, ids not
  strictly ascending, an id below 1 and an unsafe id.
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
  - The set resets: 20 ids written in second S1, then a resume that writes
    tickets of an older second S2 gives a cursor holding only S2's ids,
    and the bound counts only them.
- **Outside `S`.** A ticket created since with a later `created_at` is left
  out; a back-dated one is written.
- **Step-back.**
  - A written ticket left the results, so an unwritten ticket of `S` now
    sits on the page before the position's page, and the position's page
    starts with a ticket whose second equals `S` (T-063's strict rule would
    not step back there). That ticket is written once.
  - A resumed page that starts with the last ticket written steps back one
    page: one more request is sent (MockAgent count).
- **`created_at` rises.**
  - A resumed call is refused, nothing kept.
  - A fresh call gives `unordered` and no cursor.
- **Missing or unreadable `created_at`.** T-063's cases pass on the new
  form.
- **The bound.**
  - Exactly 30 ids written in `S` gives a `next_cursor` that resumes
    correctly.
  - 31 keeps the file, with `truncated: true`, no `next_cursor`, and the
    note saying not to reuse the cursor and to export without
    `max_tickets` or in shorter periods (the description says the same).
- **Cursors refused**, each with no request and no file:
  - a form-2 search cursor and a form-2 list cursor (minted as `dd33b08`
    mints them);
  - an input carrying its own `cursor_form`;
  - an ids-form cursor whose digest does not match;
  - validly digested ids cursors (minted by the test) whose second is at
    or past the period's end, whose page is over 10, or that carry ids on
    position 0 or on an even position.
- **T-063's tests.** They are re-minted on form 3. "the largest id a 31-day
  cursor holds" is replaced by the bound cases.

**`test/tools/core/count-tickets.test.ts`.** A fixture with ascending ids in
one second, and T-063's diverging and missing-`created_at` fixtures, each
count the asserted total with no `truncated` key.

**Docs.** `ticket-queries.md`, `overview.md` (lines 36, 48, 49 and 55),
`list.ts`'s header and the `export-tickets.ts` header no longer claim
"created_at, then id, both descending" or that a cursor carries only a
whole number. They name the second plus the id set, the bound and the
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
(b) is split off. If the owner's word on the RFC does not come in the
session, the session stops at the RFC Proposed, before (a)'s code.

---
*Filled at `/handoff`:*

## Done
- RFC `docs/rfc/active/2026-11-25-search-cursor-tie-ids.md`, Active by the
  owner's word (2026-11-25, recorded in it), commit `5bf5c8a`;
  `rfc-reviewer`: no design change, seven wording findings resolved.
- Code `67b2173`; review fixes in the handoff commit.
  - `src/tools/list.ts`: `idsCursor`, `readIdsCursor`,
    `idsCursorMaxLength` (570 for 30); `test/tools/list.test.ts`
    describe "the ids form (T-066)".
  - `count-tickets.ts` `readPeriod`: `ordered`, the skip, the set and its
    reset, the step-back `<= S`; `export-tickets.ts`: `CURSOR_FORM` 3,
    `MAX_CURSOR_IDS`, `maxPosition`, `resumeAt`, `positionOf`, `UNHELD`.
- Regression, shown failing on `dd33b08`'s `src/` (export and count code
  unchanged, `list.ts` only added to; refused "out of its own order"):
  `test/tools/core/export-tickets.test.ts::export_tickets: pages, max_tickets and the cursor (T-057) > T-066: a search position is the second and the ids written in it > regression: a tie of 3 in one second, ids ascending, across pages 1 and 2`
  (3 cases: cut before the tie, at 29, at 15). The "a ticket a call"
  variant was replaced by the cut at 15: 35 calls exceed the test
  limiter's window.
- The rest of the acceptance: the same describe ("ties descending too",
  "within the position's second", "the step-back", "the bound: 30 ids of
  one second", "cursors refused: no request, no file"); T-063's and R2's
  tests re-minted on form 3; `count-tickets.test.ts` "a tie in one
  second, ids ascending (T-066)".
- "Page over 10" cannot be expressed (RFC point 9): tested as the
  highest position (last second, page 10) accepted and the next refused.
- Fixture change: the T-057 describe's `down()` gives each ticket its own
  second (`createdOf`), since one shared second would now pass the bound.
- `make quality`: vitest 2746 passed, `tools/checks` 138 OK.

## Dead ends
none

## Open doubts
- The RFC's threat model names a prompt-injection path to a forged id
  set (rfc-reviewer). The owner's word accepted the forgery risk for the
  user's own client; whether that covers the injected-model path is the
  owner's to confirm.

## Context pressure
ok

## Next action
none (done).
