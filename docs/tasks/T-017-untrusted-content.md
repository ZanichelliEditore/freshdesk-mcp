# T-017 — Untrusted content: delimiters, text bodies, truncation

- **Type:** build
- **Phase:** M1
- **Status:** doing (2026-11-23)
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

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
