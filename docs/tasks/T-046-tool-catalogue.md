# T-046 — Tool catalogue (document only)

- **Type:** plan
- **Phase:** M1
- **Status:** todo (2026-11-23)
- **Depends on:** none
- **Created:** 2026-11-23

## Goal
`docs/tool-catalogue.md`: one line per planned tool of SPEC §8.3's toolsets.
Only the catalogue now (owner, 2026-11-23): interfaces and implementations
land with the toolset that first uses them (M5+).

## In scope
- Per tool: name (English `snake_case`), toolset, one-line purpose, the
  Freshdesk resource, read or write. The active tools of SPEC §8.2 are
  listed as active.
- A navigation line in `docs/architecture/overview.md`.
- SPEC §8.3's last row (`discussions`, `surveys`, `threads`, "as Freshdesk
  exposes them") names no resources: one line per toolset saying which
  Freshdesk API section it would wrap, its tools not listed, and the
  catalogue says so.

## Out of scope
- Any type, interface or code; any tool input design beyond the one line.

## Spec sections to read
- SPEC.md §8.3
- SPEC.md §8.2
- SPEC.md §4

## Files expected to change
- `docs/tool-catalogue.md`
- `docs/architecture/overview.md`

## Wireframes
`none`

## Acceptance
`docs/tool-catalogue.md` has at least one line for every resource named in
SPEC §8.3's table, and one line for each of the three toolsets of its last
row, (the task file's "Done" lists the resources and their line counts) and
one per SPEC §8.2 tool marked active; every name is `snake_case` and no name
appears twice (a duplicate check on the name column prints nothing); no
`src/` or `test/` file changes; `make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
