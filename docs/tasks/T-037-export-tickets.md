# T-037 — Tool: `export_tickets`

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-24)
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

Scoped round on `7afc903..45b21c1` (2026-11-24): list A empty for all
three reviewers; every list-B item parked in `docs/improvements.md`
(`45b21c1`, with `file:line`): sec B1 (cleanup unlinks by path with no
identity check), sec B2 (`moved` set before `truncate(0)`), sec B3
(`isCut` cuts on any `network` error after the deadline), sec B4 = code B4
("nothing was kept" while an empty temporary file stays in the moved
directory), sec B5 = code B7 (the non-searchable-directory test fails as
root), code B1 (truncate path untested), code B2 (`isCut`'s `>=` and an
early timer: fail-closed), code B3 (`count_tickets`' description omits the
deadline cut), code B5 (`calls()` duplicated), code B6 (`resolve()`
collapses `..` lexically; not fail-open).

---
*Filled at `/handoff`:*

## Done
Commits `a37a289` (status), `a62188a` (JSONL, file rules, budget),
`7afc903` (CSV, conversations), `45b21c1` (full review fixes), and the
closing commit (scoped round parked, done).

Acceptance, clause by clause (`test/tools/core/export-tickets.test.ts` unless named):

- JSONL and CSV files hold the fixture rows with labels: `::writes the
  fixture rows with labels to a generated name inside FRESHDESK_EXPORT_DIR,
  mode 0600`, `::the full fixture schema: labels and names resolved, a
  field a ticket lacks empty`.
- Cells and header cells starting with `=`, `+`, `-`, `@`, tab, CR, and a
  quote and a newline, escaped (asserted bytes): `::writes a header and the
  fixture rows with labels, every cell escaped (asserted bytes)`;
  `test/tools/csv.test.ts::csvRecord joins the cells with commas and ends
  with CRLF, header cells guarded like any cell`.
- Inside `FRESHDESK_EXPORT_DIR`, file and temporary file mode 0600 from
  creation: `::writes the fixture rows with labels …`, `::the temporary
  file exists while the call reads, in the directory, mode 0600, and no
  final file yet`.
- Relative path, not an existing directory, symlinked directory refused:
  `::%s: refused, nothing written, no request` (relative, absent, a file,
  a symlink), `::a symlink to a directory written with %s is refused`.
- Existing file or symlink at the generated name refused: `::%s: refused,
  left as it was, no request` (file, symlink, file at the temporary name);
  during the run `::a file planted at the final name during the read …`,
  `::a symlink planted at the temporary name before it is created …`,
  `::a file planted at the temporary name before it is created …`.
- Description says the file holds customer text unwrapped: `::is listed as
  writing a file, never overwriting one, and says the file's text is
  unwrapped`.
- Variable unset: refused, no request, message names it: `::unset:
  refused, naming the variable and how to set it, with no request even on a
  cold schema`.
- Conversations: each row carries its thread, estimate one call per ticket
  more: `::JSONL: each row carries its thread, one more request per ticket,
  all counted`, `::CSV: the thread is one last column, its JSON escaped
  (asserted bytes)`, `::the estimate counts one call per ticket more: over
  the budget with it, not without`, `::past 300, the floor estimate counts
  one call per ticket of the total more`.
- Failure mid-run leaves no final and no temporary file: `::a later page
  Freshdesk refuses fails the call: no final file, no temporary file`,
  `::a thread Freshdesk refuses fails the call: no final file, no temporary
  file`.
- Result has path, row count, `api_calls_used` equal to the MockAgent
  count: `::writes the fixture rows …`, `::on a cold schema api_calls_used
  equals the MockAgent count, the schema's load included`.
- Over budget without `confirm` refused: `::an estimate over the budget is
  refused without confirm, after the probe only, nothing kept`.
- `test/config.test.ts::a team file with export_dir is refused, naming the
  key: the directory is personal env`.
- `/security-review` findings resolved or dismissed: section "Security
  review" above.
- `make quality` green (2,486 tests at `45b21c1`).

Choices:

- `node:fs/promises` moved from every `src/tools/` place to the core
  tools' place (`eslint.tool-imports.json`); `export-tickets.ts` is its
  only importer; a single-file place is parked.
- The final file is a hard `link` of the temporary file (never
  overwrites), then the temporary file is unlinked; `rename` would replace.
- The read is shared with `count_tickets` (`readPeriod`, `periodQuery` in
  `count-tickets.ts`), so the same 30 s deadline, `SCAN_START_MS`, budget,
  `expensive` class and cuts; the scan bound is settled in
  `docs/architecture/ticket-queries.md` (`export_tickets`).
- A request aborted at the call's deadline is a cut (`isCut`), for both
  tools.

Reviews: full round on `d46df76..7afc903` (R1 = `7afc903`): compliance
none (Wireframes `none`); security-reviewer 1 Medium, 2 Low, 3 info; code
3 Medium, 5 Low; `/security-review` no finding at or above 8/10; all fixed,
parked or dismissed in `45b21c1`. Scoped round on `7afc903..45b21c1`: list
A empty for all three, list B parked (above).

Outside "Files expected to change": `src/client/resources/list-all.ts`
(a failed request carries `attempts`), `src/client/resources/tickets.ts`
(`listConversations` takes a cost class), `src/schema/index.ts` (drops
that `attempts` so a failed load reports none), `src/tools/context.ts`
(`exportDir`), `src/tools/toolsets/core/count-tickets.ts` (the shared
read), `src/tools/toolsets/core/index.ts`, `eslint.tool-imports.json`,
`test/lint-rules.test.ts`, `test/server.test.ts`,
`test/tools/context.test.ts`, `test/client/resources/tickets.test.ts`,
`test/tools/core/count-tickets.test.ts`, `test/tools/csv.test.ts`,
`docs/architecture/overview.md`, `docs/architecture/ticket-queries.md`,
`docs/improvements.md`.

## Dead ends
- An `ms` bound on the export's deadline-cut test: the settle loop counts
  the real file I/O after the cut as fake time (31.7 s measured); the
  timing is asserted on `count_tickets`' twin test instead.
- A test that fails when `O_NOFOLLOW` alone is dropped: `O_CREAT |
  O_EXCL` never follows a link at the final component, so none can.

## Open doubts
- One call exports about 4,000 tickets, or about 40 with their threads, at
  the default pacing; SPEC §7.2's example (2,000 tickets with
  conversations, about 2,020 calls) cannot run in one call. Owner decision.
- A file system without hard links (FAT/exFAT, some network shares) makes
  every export fail, with a clear message.
- No UTF-8 BOM in the CSV, so Excel may misread accented characters.
- Negative numbers and JSON cells (a thread) are not formula-guarded.
- The accepted no-openat window after the last directory check, and the
  empty temporary file left in a directory moved away during the call.

## Context pressure
Moderate: one build session with two review rounds; no split needed.

## Next action
none: done.
