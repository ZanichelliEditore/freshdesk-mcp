# T-017 — Untrusted content: delimiters, text bodies, truncation

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-23)
- **Depends on:** T-011
- **Created:** 2026-11-23

## Goal
`src/tools/format.ts` wraps customer-written text in `<ticket_content>` and
truncates long text with a marker (SPEC §7.4), before `ticketOutput` has a
tool caller (`docs/improvements.md` `3ec2fde`, `f8d7db7`).

## In scope
- Wrapped: subject, description, conversation bodies, attachment names,
  requester and company names, a conversation's from, to and cc strings, and
  custom-field values. The rule for a field value: wrap unless the schema's
  type is a known closed one (number, boolean, date, a validated choice); an
  unknown type is wrapped.
- Text that contains the opening or closing delimiter cannot end the block.
- Text, not HTML: `description_text` / `body_text` where Freshdesk gives it.
  No HTML parser dependency: if one is needed, stop and raise an RFC.
- A helper for admin-set text, which is not wrapped (owner, 2026-11-23):
  agent and group names, field labels, choice names, and KB, folder and
  canned titles have HTML tags stripped and their length capped (used by
  T-020, T-021, T-032, T-034, T-036, T-042). Truncation on a code-point
  boundary with a marker saying how much was cut and how to fetch the rest.

## Out of scope
- Wrapping agent and group names, field labels and choice names: not wrapped
  (owner, 2026-11-23). KB and canned text are wrapped, in T-032 and T-034.
- The list envelope (T-018).

## Spec sections to read
- SPEC.md §7.4
- SPEC.md §8.4

## Files expected to change
- `src/tools/format.ts`
- `test/tools/format.test.ts`
- `src/schema/output.ts` only if free-text fields must be marked there

## Wireframes
`none`

## Split point
Delimiters and escaping first; HTML-only bodies and truncation second.

## Acceptance
`test/tools/format.test.ts`: subject, description, a conversation body, an
attachment name, a requester name, a company name, a conversation's from, to
and cc, and a free-text custom field each come back inside one
`<ticket_content>…</ticket_content>` block; a custom field of a type the
code does not know is wrapped, one of a number, boolean, date or
validated-choice type is not; a value containing `</ticket_content>` or
`<ticket_content>` (also in another case, with inner spaces, or written as
entities such as `&lt;/ticket_content&gt;` in an HTML body) yields exactly
one opening delimiter, at the start, and one closing delimiter, at the end;
`body_text` is used when present and an HTML-only body comes back with no
tag; a text over the cap is cut on a code-point boundary with the marker and
the count; the name helper strips tags and caps the length (asserted on a
name, a field label and a choice name, each with a tag and each over the
cap); `null` and numbers pass unchanged; `make quality` green.

---
*Filled at `/handoff`:*

## Done
- `fef8a5f`: `src/tools/format.ts` (`untrusted`, `bodyText`, `htmlToText`,
  `plainName`, `fieldValue`; `TEXT_CAP` 10,000, `NAME_CAP` 100) and
  `test/tools/format.test.ts`; overview entry. No new dependency.
- `1950f43` (full-round fixes, orchestrator's decisions of 2026-11-23):
  every `<` inside a block and its entity spellings become `‹` (no
  delimiter word is matched); `<` in JSON written `\u003c`; the truncation
  marker follows CLOSE, outside the block; name types take only a string
  or a number.
- Handoff commit: one test, `test/tools/format.test.ts::truncation > cuts
  a hostile value over the cap: one OPEN at the start, one CLOSE, then only
  the marker`; comment wording (scoped round list B).
- Acceptance, by test (`test/tools/format.test.ts`):
  - each named value in one block: `untrusted: customer-written text is
    one block > wraps a …` (subject to cc); free-text and unknown-type
    fields: `fieldValue > wraps a free-text custom field`, `> wraps a field
    of a type the code does not know`; closed types: `> does not wrap a
    number, boolean or date`, `> does not wrap a choice found among the
    field's choices…`;
  - embedded delimiters, case, inner spaces, invisible characters,
    look-alikes and entities in body_text and HTML: `an embedded delimiter
    cannot end or open the block > …` (one OPEN at the start, one CLOSE, no
    `<` inside);
  - `body_text` first, HTML-only body with no tag: `bodyText: text, not
    HTML > …`;
  - code-point cut with marker and count: `truncation > …`;
  - name helper on a name, a field label and a choice name, each with a tag
    and over the cap: `plainName: admin-set text, not wrapped > strips tags
    from …`;
  - `null` and numbers unchanged: `untrusted … > passes null, undefined,
    numbers and booleans unchanged`, `plainName … > passes null and numbers
    unchanged`, `fieldValue … > passes null and numbers unchanged for any
    type`.
- Red first: before `format.ts` existed the file failed to load ("no
  tests"); afterwards each mechanism was broken by hand in turn (entity
  spellings, digit lookahead, JSON escape, marker position, name-type
  guard, body_text first, code-point cut, choice check) and 1 to 23 cases
  failed each time.
- Linear time checked by hand on 1M-character adversarial inputs (runs of
  `<`, `< `, `<script`, `<!--`, `&`, spaces): worst case under 200 ms,
  ten times the 100k timing.

## Dead ends
- Recognising the delimiter word by pattern (`ticket…content` with a
  backward walk to the `<`): invisible characters and look-alikes inside
  the word passed it (full round, security #1). Replaced by turning every
  `<` into `‹` (`1950f43`).

## Open doubts
- The acceptance's "one closing delimiter, at the end" predates the
  marker-outside decision: a cut value ends with the marker after CLOSE.
  Wording change proposed in HANDOFF (orchestrator's choice of 2026-11-23).
- `ticketOutput` does not wrap: T-026 must apply `fieldValue` per field
  (it needs the `TicketField`) and `plainName` to label keys; proposed
  acceptance line in HANDOFF.
- A `<` written by a customer (`"Ada" <ada@…>`) reads `‹` in every block.

## Context pressure
ok

## Next action
none: done.
