# T-070 — Stateless preview and `preview_id`

- **Type:** build
- **Phase:** M2
- **Status:** todo (2026-11-25)
- **Depends on:** none (ordered after the core)
- **Created:** 2026-11-25

## Goal
A mechanism `categorize_tickets` uses: a preview yields a `preview_id` that a confirm can check without server state; a changed ticket set or field invalidates it (SPEC §9).

## In scope
- `src/tools/preview.ts`: mint and check a `preview_id` over the tool name, the canonical sorted ticket set and the fields per ticket; an HMAC under a random key made once per process (a preview dies on restart), valid 15 minutes; the tickets are not read again at confirm (OD-15, owner 2026-11-25). The key from `crypto.randomBytes`, 32 bytes or more; the mint time inside the MAC; the comparison by `timingSafeEqual`.
- Cap 50 (SPEC §8.2) refused, not truncated.
- A confirm naming any subset of the previewed tickets, each with its previewed fields, checks: that is how the tickets a deadline or budget cut left not attempted are confirmed with the same `preview_id` (OD-13, owner 2026-11-25). With no server state, the check cannot tell which tickets were attempted, so a repeat confirm within the TTL re-sends identical values.
- Listed in `eslint.tool-imports.json`.

## Out of scope
- The tool (T-073).

## Spec sections to read
- SPEC.md §9
- SPEC.md §8.2 (`categorize_tickets`)

## Files expected to change
- `src/tools/preview.ts` (new)
- `eslint.tool-imports.json`
- `test/tools/preview.test.ts` (new)

## Wireframes
`none`

## Acceptance
`test/tools/preview.test.ts`: a minted id checks against the same items in any order; a ticket added (also within a subset), a field value changed (also within a subset), another tool name, an edited id, an id minted under another process's key, and an id older than 15 minutes each give `validation`, `http_status: null`, without quoting the id; any subset of the previewed items, fields unchanged, checks (no server state: a repeat within 15 minutes also checks); over the cap is refused; `make quality` green.

No split point.

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
