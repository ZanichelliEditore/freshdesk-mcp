# T-043 — Ticket filters: name → id resolver and filter → request builder

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-24)
- **Depends on:** T-015, T-022, T-024, T-050, T-051
- **Created:** 2026-11-23

## Goal
One module turns a tool's filters into the request
`docs/architecture/ticket-queries.md` names, resolving names to ids on the
read side. It does not use `ticketInput` (which refuses agent and group,
`src/schema/input.ts:244`) and does not wait for T-041.

## In scope
- Resolver: status, priority, type, group and agent by name or id, through
  the schema's choices and name maps. A name two agents or groups share is
  refused, listing the ids; an unknown name lists the valid ones (clipped);
  a name not found while the list is truncated says the list is incomplete.
- Builder: the nine `list_tickets` filters to list-endpoint parameters or a
  search query; a value is quoted and escaped so it cannot add a clause to
  the query; `uncategorized` from the team file's `uncategorised_fields`,
  else SPEC §10's default rule (the last level of the first nested field).

## Out of scope
- Filters by custom field (use `search_tickets`); any write-side mapping.

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §10
- SPEC.md §7.3

## Files expected to change
- `src/tools/ticket-query.ts`
- `test/tools/ticket-query.test.ts`

## Wireframes
`none`

## Split point
The resolver first; the builder (with `uncategorized`) second.

## Acceptance
`test/tools/ticket-query.test.ts`: a status, priority, type, group and agent
given by name each resolve to the fixture's id, and by id to itself; a name
two agents share and one two groups share are each a `validation` error
listing the ids; an unknown name lists the valid ones; a name absent from a
truncated list says the list is incomplete; each of the nine filters gives
the asserted list parameters or search query; a tag containing ` OR ` stays one quoted value, and a tag or type containing `'`, `"`, `\` or a control character is refused as `validation` with no request (Freshdesk documents no escape inside a quoted value; orchestrator, 2026-11-24); `uncategorized` follows `uncategorised_fields`
when set and the default rule when not; `make quality` green.

---
*Filled at `/handoff`:*

## Done
- Commits: `a8a0384` (status), `e3af096` (`src/tools/ticket-query.ts`,
  tests, `categoryFields` exported from `rows.ts`, both architecture docs),
  `d3091cb` (full review fixes, with the orchestrator's amended acceptance
  in PLAN and here), the close commit `T-043: done; task file, T-055
  proposed, parked review items` (this file, PLAN, docs wording,
  improvements, journal).
- `src/tools/ticket-query.ts`: `resolveFilter(schema, kind, value)`,
  `buildTicketQuery(ctx, schema, filters)` (a search query or list
  parameters, plus local checks), `matchesLocal(checks, ticket)`,
  `isUncategorized(checks, ticket)`, `fieldKey`. No new entry in
  `eslint.tool-imports.json`; `categoryFields` is shared from `rows.ts`.
- Acceptance amended by the orchestrator (2026-11-24, in `d3091cb`): a tag
  or type containing `'`, `"`, `\` or a control character is refused, not
  escaped (Freshdesk documents no escape inside a quoted value).
- Tests, `test/tools/ticket-query.test.ts`:
  - acceptance: `resolveFilter::resolves %s %j by name to the fixture's id
    %j`, `::resolves %s %j given by id to itself`, `::refuses an agent name
    two agents share, listing both ids`, `::refuses a group name two groups
    share, listing both ids`, `::refuses an unknown %s name, listing the
    valid ones`, `::says the %s list is incomplete for a name not found in
    a truncated list`; `buildTicketQuery: the nine filters::%j gives the
    search query %j`, `::created_between is a search widened by a day each
    side, with the exact days checked locally`, `::updated_since alone is
    the list endpoint's parameter, as a UTC instant`, `::uncategorized
    alone is the list endpoint with the local check`; `buildTicketQuery:
    values cannot add a clause::keeps a tag containing ' OR ' one quoted
    value`, `::refuses the tag %j, which cannot be quoted safely, with no
    query`; `uncategorized::follows the default rule: the last level of the
    first nested field`, `::follows uncategorised_fields %j`, `::with
    uncategorised_fields set, a ticket with any listed field empty`;
  - beyond it: clipped name lists, unknown and truncated ids, missing
    field, wrong value kind; joined filters, the one-day `created_between`,
    `updated_since` with a search filter and its local check,
    `matchesLocal`, non-boolean `uncategorized`; blank tag, unquotable or
    control-character type, ambiguous type through `plainName`, exactly 512
    characters accepted and 513 refused; strict dates (no zone, `+0100`,
    2026-02-30, `T25`, `:60`, `+24:00`); every problem in one error; a
    default field read at the top level; refused with no field to check;
    `fieldKey` agrees with `output.ts`'s `ticketKey`.
- Failed first: the whole file at import (no module) in `e3af096`. In the
  review pass, 13 new tests failed first: both `created_between` tests, the
  joined-filters query, `updated_since` with a search filter, `matchesLocal`,
  the three non-boolean `uncategorized` rows, the `\n`, NUL and U+200B tags,
  the control-character type and the ambiguous type. The out-of-range times,
  the 512-character query and the tag `a\b` passed at once (already
  handled).
- Choices: refuse rather than escape quoted values; names folded (trim,
  NFC, lower case) with no exact-first, so a case-only difference is
  ambiguous; a number is an id, a string a name; an unknown id refused on a
  complete list, accepted on a truncated one; `created_between` always a
  search filter; both date filters of a search widened a day and checked
  locally, `from` = `to` accepted; dates strict; `uncategorized` checks a
  nested field at its last level and a default field at its ticket key (a
  six-entry copy of `output.ts`'s map, kept in step by a test, rather than
  putting `../schema/output.js` on the lint list); a query over 512
  characters refused here with its reason.
- Review: full round on `901cb00..e3af096`: compliance Wireframes `none`,
  security 3 Low, code 2 Medium plus Lows and a nit, all applied in
  `d3091cb`. Scoped round on `d3091cb`: list A empty for all three; list B
  parked in `docs/improvements.md`; the date boundary raised as the
  proposed row T-055.
- Acceptance: every line (as amended) met; `make quality` green.

## Dead ends
none

## Open doubts
- The date boundary (T-055, proposed): whether search's `>`/`<` on
  `created_at`/`updated_at` keep the boundary day and which time zone's day
  they use is unmeasured; with the account's day and an exclusive operator a
  one-day widening can undercount on one side.
- The ambiguous-type message asks for the choice "exactly as listed", but
  matching folds case, so two choices differing only in case can never be
  told apart (parked).
- `\p{Cf}` also refuses a zero-width joiner or a soft hyphen in a tag,
  beyond the acceptance, while U+2028/U+2029 (category Zl/Zp) pass (parked).
- Year edges: 0000 and 9999 pass the date checks, and widening 9999-12-31
  by a day gives a five-digit year (parked).
- `ticketTime` uses lenient `Date.parse` on the ticket's dates, so a
  rolled-over or zone-less date is still read (parked).
- `matchesLocal` is exported and trusts its bound: an unparseable
  `updated_since` gives a NaN comparison that passes every ticket (parked;
  `buildTicketQuery` only ever passes a valid one).

## Context pressure
Low: one builder session over three passes, files read by range.

## Next action
none: done.
