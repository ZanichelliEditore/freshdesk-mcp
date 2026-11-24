# T-037 — Tool: `export_tickets`

- **Type:** build
- **Phase:** M1
- **Status:** doing (2026-11-24)
- **Depends on:** T-027, T-035
- **Created:** 2026-11-23

## Goal
Writes tickets as JSONL or CSV into the export directory and returns path,
row count and calls used (C7). Not a rule-1 capability, no RFC (owner,
2026-11-23).

## In scope
- The project's first file write. `/security-review` on this diff is
  mandatory (owner, 2026-11-23), beside the three handoff reviewers.
- The export directory comes from the personal env `FRESHDESK_EXPORT_DIR`,
  not from the team file (owner, 2026-11-23): `export_dir` leaves the team
  schema (a team file that still carries it is refused by name). It must be
  an absolute path to an existing directory, or the tool is refused; unset:
  refused with a message saying how to set it.
- The file name is generated, never taken from input; the file and its
  temporary file are created exclusively, without following a link, mode
  0600 from creation, in that directory only (`docs/improvements.md`
  `3394b0e`); no partial file under the final name.
- Labels resolved, on `ticketOutput` as it is: nothing about hidden fields
  is added or guaranteed here. CSV escapes quotes, newlines and a leading
  `=`, `+`, `-`, `@`, tab or carriage return, in header cells too (customer
  text opened in a spreadsheet).
- Estimate and budget per T-035; `expensive` and paced.
- The files hold customer text unwrapped: the tool description says so (and
  the README, T-038).

## Out of scope
- Resumable or background export; any other format.

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §7.2
- SPEC.md §10

## Files expected to change
- `src/tools/toolsets/core/export-tickets.ts`
- `src/tools/csv.ts`
- `src/config.ts`, `test/config.test.ts`,
  `examples/team-config.example.json`
- `test/tools/core/export-tickets.test.ts`

## Wireframes
`none`

## Split point
JSONL, the file rules and the budget first; CSV and the conversations option
second.

## Acceptance
`test/tools/core/export-tickets.test.ts` (temporary directory, MockAgent):
JSONL and CSV files hold the fixture rows with labels; a cell and a header
cell starting with `=`, `+`, `-`, `@`, a tab or a carriage return, and one
with a quote and a newline, are escaped (asserted bytes); the file is inside
`FRESHDESK_EXPORT_DIR`, and it and its temporary file are mode 0600 from
creation; a relative path, a path that is not an existing directory, a
symlinked directory, and an existing file or a symlink at the generated name
are each refused; the tool description says the file holds customer text
unwrapped; with the variable unset the tool is refused with no request and a
message naming the variable; with the conversations option each row carries
its thread and the estimate counts one call per ticket more; a failure
mid-run leaves no file under the final name and no temporary file in the
directory; the result has path, row count and `api_calls_used` equal to the
MockAgent count; over budget without `confirm` is refused;
`test/config.test.ts`: a team file with `export_dir` is refused naming the
key; the `/security-review` findings are resolved or dismissed in the task
file; `make quality` green.

## Security review

Full round on `d46df76..7afc903` (2026-11-24): `/security-review`
(owner-mandated) and `security-reviewer`; fixes in the full-review-fixes
commit after `7afc903`.

`/security-review`: no finding at or above 8/10. Below the threshold:

- The `node:fs/promises` allow-list width (every core tool, not
  `export-tickets.ts` alone): parked in `docs/improvements.md`
  (`7afc903`, single-file place); `overview.md` now says "allowed in core
  tools; `export-tickets.ts` the only importer today".
- Full-width formula characters (＝ ＋ － ＠, 3/10): parked in
  `docs/improvements.md` (`7afc903`).

`security-reviewer`:

1. A trailing `/` or `/.` on `FRESHDESK_EXPORT_DIR` made `lstat` follow a
   symlinked directory (same as code M1): fixed, `lstat` and `join` work on
   `path.resolve(dir)` after the `isAbsolute` check on the raw value; tests
   for `<link>/`, `<link>/.` (refused) and `<dir>/` (accepted).
2. The directory swapped between the check and the write: fixed, its device
   and inode are kept and it is `lstat`ed again before `open`, before the
   rows are written and before `link`; any change refuses with a fixed
   message. Tests: swapped during the read, and before the temporary file
   is created. Accepted residual: a swap after the last check and before
   `open` or `link` (node:fs has no openat); and after a detected swap no
   path reaches the temporary file, so it is left where the directory went,
   empty (truncated through its handle when the rows were written).
3. The allow-list width (same as code L3): the core-tools place is kept;
   the single-file place is parked.
4. `taken()` read any `lstat` error as "free": fixed, only ENOENT is free,
   any other error refuses (test: a directory that is not searchable).
5. `O_NOFOLLOW ?? 0` unexplained: fixed, one-line comment (no such flag on
   Windows; `O_EXCL` alone never follows a link).
6. The result carries the file's `path`: dismissed, the acceptance requires
   it ("the result has path, row count and `api_calls_used`"), and it is the
   owner's own directory plus a generated name, no ticket text.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
