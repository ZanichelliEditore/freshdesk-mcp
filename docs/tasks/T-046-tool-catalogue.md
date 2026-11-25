# T-046 — Tool catalogue (document only)

- **Type:** plan
- **Phase:** M1
- **Status:** done (2026-11-25)
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
- `9f0ebaa`: `docs/tool-catalogue.md` (Name, Toolset, Status, Access,
  Resource, Purpose) and its navigation line in
  `docs/architecture/overview.md`. `660d5c7`: pre-check fixes (exports are
  `write`; the SPEC §9 judgement note). `4fdaf66`: full-round fixes
  (judgement lists a minimum and widened; OD-5 cited; contact and company
  exports split into start and status tools; satisfaction-rating labels).
- SPEC §8.2, active: 21 lines (`core` 15, `write` 4, `send` 2), every tool
  of the section.
- SPEC §8.3, lines per resource (120 names in all, 99 catalogue):
  - `tickets_admin` 22: create 1; delete/restore 2; merge 1;
    bulk_update/bulk_delete jobs 3 (with `get_job_status`); archived
    tickets 1; watchers 3; time entries 5; satisfaction ratings 3; ticket
    summary 3.
  - `contacts` 17: contacts CRUD 8 (with search, hard delete, restore);
    merge 1; make agent 1; export jobs 2; contact fields 5.
  - `companies` 13: companies CRUD 6 (with search); export 2; company
    fields 5.
  - `kb_write` 9: categories 3, folders 3, articles 3 (create, update,
    translate each).
  - `canned_write` 4: folders 2, responses 2.
  - `admin_read` 17: agents 1 and groups 1 (lists are `core`'s
    `list_agents` and `list_groups`), roles 2, skills 2, SLA policies 1,
    business hours 2, products 2, email configs 2, mailboxes 2,
    automations 2.
  - `admin_write` 17: agents 3, groups 3, skills 3, SLA policies 2,
    mailboxes 3, automations 3; roles, business hours, products and email
    configs 0 here (no write endpoint in the API reference, read
    2026-11-25; their lines are `admin_read`'s, and the catalogue says so).
  - `discussions`, `surveys`, `threads`: 1 line each, tools not listed.
- Duplicate check on the name column (the first cell of each tool row,
  through `sort | uniq -d`) printed nothing; every name matches `^[a-z][a-z0-9]*(_[a-z0-9]+)*$`. No
  `src/` or `test/` change.
- `make quality` on `660d5c7`: vitest 39 files / 2645 tests passed,
  `tools/checks` 87 tests OK, exit 0; again on the handoff commit.

## Dead ends
none

## Open doubts
- `admin_write` has no line for roles, business hours, products and email
  configs, which SPEC §8.3 covers by "the above, write": the API reference
  lists no write endpoint for them. Read as meeting the acceptance through
  their `admin_read` lines and the catalogue's note; the owner may judge
  otherwise. **Closed (owner, 2026-11-25):** accepted as read.
- Freshdesk facts in the catalogue come from one read of the API
  reference (2026-11-25; the fetched text was cut after about 100,000 of
  243,000 characters, so the Solutions, Discussions, Watchers, Summary and
  Archive sections were read by title only) and from memory: re-checked
  when each toolset is planned, as the catalogue says. **Closed (owner,
  2026-11-25):** accepted; re-check when each toolset is planned.

## Context pressure
ok

## Next action
none: done (2026-11-25).
