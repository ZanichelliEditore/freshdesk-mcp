# T-081 — Recipient allow-list matching in the core

- **Type:** build
- **Phase:** M3
- **Status:** todo (2026-11-26)
- **Depends on:** T-079
- **Created:** 2026-11-26

Sized on T-079's likely answer (PLAN, M3: the OD proposals, and the owner's answers of 2026-11-26 to OD-20, OD-21 and OD-26); its acceptance is re-checked when T-079's RFC is accepted.

## Goal
One pure core module that says whether an address is on the team's `forward_allow_list`, by the rules T-079's RFC sets (OD-23).

## In scope
- `src/core/recipients.ts`: normalise the list entries and the address, match `@domain` and full-address entries, refuse what OD-23 refuses, cap the count (OD-22).
- Refusals name the position, never the address.

## Out of scope
- `src/config.ts` (the entry regex stays; normalisation happens at check).
- Using it from an entry (T-082).

## Spec sections to read
- SPEC.md §9 (recipients row)
- SPEC.md §10 (team config)
- T-079's RFC (OD-22, OD-23)

## Files expected to change
- `src/core/recipients.ts` (new)
- `test/core/recipients.test.ts` (new)
- `docs/architecture/overview.md`

## Wireframes
`none`

## Acceptance
`test/core/recipients.test.ts` (table): `@example.com` matches `a@example.com`, `A@EXAMPLE.COM`, `a+x@example.com`; refuses `a@sub.example.com`, `a@example.com.evil`, `Name <a@example.com>`, a comma or semicolon list, two `@`, whitespace, a control or non-ASCII character, and empty; a full-address entry matches only itself, case-insensitively; an empty list refuses everything; more than the cap is refused; a refusal names the position, never the address; `make quality` green (rules per OD-23).

No split point: one pure module and its table test.

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
