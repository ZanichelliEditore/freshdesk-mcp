# T-081 — Recipient allow-list matching in the core

- **Type:** build
- **Phase:** M3
- **Status:** done (2026-11-26)
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
`test/core/recipients.test.ts` (table): `@example.com` matches `a@example.com`, `A@EXAMPLE.COM`, `a+x@example.com`; refuses `a@sub.example.com`, `a@example.com.evil`, `a@evilexample.com`, `a@example.com.` (trailing dot), `Name <a@example.com>`, a comma or semicolon list, two `@`, whitespace, a control or non-ASCII character, and empty; a full-address entry matches only itself, case-insensitively; an empty list refuses everything; more than the cap is refused; a refusal names the position, never the address; `make quality` green (rules per OD-23).

No split point: one pure module and its table test.

---
*Filled at `/handoff`:*

## Done
- `644cb6c`: `src/core/recipients.ts` (`onAllowList`, `checkRecipients`,
  `RECIPIENT_CAP`), `test/core/recipients.test.ts` (the acceptance table:
  "onAllowList: an `@domain` entry (OD-23)", "a full-address entry",
  "the list itself (OD-23, fail closed)", "checkRecipients: per field, by
  position (OD-22)", "the cap, all fields together (OD-22)"),
  `docs/architecture/overview.md`.
- `4902607`: review fixes: each list copied once and the frozen copies
  returned as `recipients`
  (`test/core/recipients.test.ts::reads each list once…`, `::returns frozen
  copies…`); no throw on a non-list allow-list, unreadable fields or a
  throwing list (`::refuses fields that are not an object…`, `::refuses
  everything with an allow-list that is not a list…`, `::refuses, without
  throwing, a list that throws when read`).
- `make quality` exit 0: Vitest 51 files, 4246 tests; `tools/checks` 138.

## Dead ends
none

## Open doubts
- `%` and `!` pass in a local part (`x%evil.test@example.com` matches
  `@example.com`); OD-23 does not name them. Refusing them changes core
  rules: owner's call, `/rfc` first (`docs/improvements.md`, `644cb6c`).
- An apostrophe is allowed in a local part (`o'brien@`): read OD-23's
  "quotes" as `"` only.
- A revoked Proxy as `fields` still throws (fails closed); parked
  (`docs/improvements.md`, `4902607`).

## Context pressure
low

## Next action
none (done).
