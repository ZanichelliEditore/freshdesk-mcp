# T-017 — Untrusted content: delimiters, text bodies, truncation

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
- **Depends on:** T-011
- **Created:** 2026-11-23

## Goal
`src/tools/format.ts` wraps customer-written text in `<ticket_content>` and
truncates long text with a marker (SPEC §7.4), before `ticketOutput` has a
tool caller (`docs/improvements.md` `3ec2fde`, `f8d7db7`).

## In scope
- Wrapped: subject, description, conversation bodies, attachment names, and
  the values of free-text custom fields (told apart by the schema's field
  type).
- Text that contains the opening or closing delimiter cannot end the block.
- Text, not HTML: `description_text` / `body_text` where Freshdesk gives it.
  No HTML parser dependency: if one is needed, stop and raise an RFC.
- A helper for admin-set names and labels, which are not wrapped (owner,
  2026-11-23): HTML tags stripped and length capped (used by T-021 and
  T-042). Truncation on a code-point boundary with a marker saying how much
  was cut and how to fetch the rest.

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
attachment name and a free-text custom field each come back inside one
`<ticket_content>…</ticket_content>` block; a value containing
`</ticket_content>` or `<ticket_content>` (also in another case, with inner
spaces, or written as entities such as `&lt;/ticket_content&gt;` in an HTML
body) yields exactly one opening delimiter, at the start, and one closing
delimiter, at the end; `body_text` is used when present and an HTML-only
body comes back with no tag; a text over the cap is cut on a code-point
boundary with the marker and the count; the name helper strips tags and caps
the length (asserted on a name with a tag and one over the cap); `null`,
numbers and choice labels pass unchanged; `make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
