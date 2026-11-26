# T-070 — Stateless preview and `preview_id`

- **Type:** build
- **Phase:** M2
- **Status:** done (2026-11-26)
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
- `70be151`: `src/tools/preview.ts` (`mintPreviewId`, `checkPreviewId`, `PREVIEW_CAP` 50, `PREVIEW_TTL_MS`), one HMAC tag per ticket under a per-process key, so any subset checks; `list.ts` exports `canonical`; `./preview.js` in `eslint.tool-imports.json` (`T0`); overview entry.
- `f64d743`: full-round fixes (a throwing getter or Proxy in the items refused, not thrown; messages; overview); its monotonic clock was reverted by `250d476`.
- `250d476`: TTL on `Date.now()` again (owner, 2026-11-26).
- Tests: `test/tools/preview.test.ts` (57 cases); acceptance in the `checkPreviewId: what is refused` and `the cap` blocks, e.g. `::an id older than 15 minutes; one exactly 15 minutes old still checks`, `::an id minted under another process's key`, `::any subset of the previewed items, fields unchanged, checks`, `::checking over the cap is refused`.
- Accepted limitation (owner, 2026-11-26): the mint time is the wall clock, so a wall clock set back after a preview stretches its 15 minutes by as much. A mint time ahead of the clock is refused (`::an id whose mint time is ahead of the clock is refused`).

## Dead ends
- A monotonic mint time (`performance.now()`, `f64d743`), to stop a wall clock set back from stretching the TTL: it does not count time the machine sleeps, so a preview outlived a closed laptop lid (scoped-round finding). Reverted in `250d476` by the owner's choice.

## Open doubts
- T-073 must write only the checked `ticket_id` and `fields`, from the parsed values, never re-reading the items (`docs/improvements.md` entries `70be151`, `f64d743`).
- An id at the cap is 834 characters for the model to copy back; 8-byte tags would halve it (T-073's call).

## Context pressure
ok

## Next action
none (done).
