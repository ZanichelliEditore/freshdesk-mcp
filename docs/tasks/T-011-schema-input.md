# T-011 — Schema service: input mapping + nested-choice validation

- **Type:** build
- **Phase:** M0
- **Status:** done (2026-11-23)
- **Depends on:** T-010
- **Created:** 2026-11-20

## Goal
Tools can pass labels or API names; values are validated against choices, nested levels included, with an error listing the valid choices.

## In scope
- Accept field label or API name; accept value label. State and test the case rule for labels.
- Nested path `"A > B > C"` resolves to the three API fields.
- Invalid choice → `validation` error listing valid choices at the failing level.
- Unknown field and a label shared by two fields → defined `validation` errors.

## Out of scope
- Any tool using it (M1/M2).

## Spec sections to read
- SPEC.md §7.3

## Files expected to change
- `src/schema/input.ts`, `test/schema/input.test.ts`

## Wireframes
`none`

## Acceptance
`test/schema/input.test.ts` covers label and API-name inputs, the label case rule, a 3-level nested path, an invalid choice at each level, an unknown field and an ambiguous label; `make quality` green; **M0 done:** CI run on this commit observed green, URL in HANDOFF.

---
*Filled at `/handoff`:*

## Done
- `73099a8`: `src/schema/input.ts` `ticketInput`; `test/schema/input.test.ts` (labels and API names, the case rule, 2- and 3-level paths, an invalid choice at each level, unknown field, ambiguous label, prototype-named keys); `fold`/`ticketKey` exported from `src/schema/output.ts`. The build commit did not set the row to `doing` (rule 7 miss); set in `92e6b40`.
- `92e6b40`: review fixes: "ticketInput: fail-closed edges" in `test/schema/input.test.ts` (other type with choices checked or refused, conflicting keys, ids sharing a name, ambiguous nested level, `Status:"2"`, separators, clipping and the error cap); a key that is an API name and another's label is ambiguous; a short path sends `null` for later levels; `src/client/errors.ts` comments.
- `make quality`: 503 tests; `test/schema/input.test.ts` 47.

## Dead ends
none

## Open doubts
- **Owner / live check, top:** `unsupported_field` may refuse Agent, Group and Product on a real account if `/ticket_fields` gives them a name → id `choices` record (unverified; `docs/improvements.md` `92e6b40`). Due before M1's first write tool.
- Orchestrator's choices (review round 1): an unhandled type with a non-empty choice list is checked against it, any other non-empty choices refused (`unsupported_field`, a code SPEC §7.3 does not name); a key that is one field's API name and another's label is `ambiguous_field`, so a field whose API name and label are both ambiguous is unreachable without an escape syntax, owner to decide if one is needed; a short nested path sends `null` for the levels not given, Freshdesk's behaviour not measured live.
- Builder's choices: empty `choices` (`[]` or `{}`) on an unhandled type pass the value through, so text fields work if Freshdesk sends `[]`; agent, group and requester values are ids, no name lookup; the separator is exactly `" > "`; API names compare case-sensitively; all problems come back together, `http_status: null`.
- Owner decisions before M1's first write caller (`docs/improvements.md` `73099a8`): hidden fields output-only or refused on input; a per-tool allow set of writable fields; hard rule 1, an RFC on whether the first write tool needs a safety core.

## Context pressure
ok
