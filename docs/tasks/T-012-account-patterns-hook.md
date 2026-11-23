# T-012 — Guard: account-value patterns in the commit hook

- **Type:** build
- **Phase:** M0
- **Status:** done (2026-11-23)
- **Depends on:** T-001
- **Created:** 2026-11-23

## Goal
A commit that stages a real account value is refused on the owner's
machine, before T-008 brings the first field-label fixtures.

## In scope
- `tools/checks/account_patterns.py`: runs `git grep --cached -n -iE -f
  docs/private/account-patterns` (gitignored file) over the whole index,
  the matcher T-001 used for the history scrub. It is not reimplemented
  with Python's `re` (not POSIX ERE: a bracket class would compile and
  never match) and never reads the working tree.
- Exits, per run (the caller's locale and the C locale; amended by the
  owner on 2026-11-23, in session): 0 is a match and refuses the commit, 1
  with nothing on stderr passes, anything else fails. A match in a binary
  file refuses, naming the file.
- A `repo: local`, `language: system` commit-stage hook in
  `.pre-commit-config.yaml`, `pass_filenames: false`, `always_run: true`.
- Output names `file:line`, never the pattern or the matched text, on
  every path. `git grep`'s own stdout and stderr are never forwarded:
  measured on 2026-11-23 with git 2.53.0, an invalid regex makes it exit
  128 and print the offending pattern in its `fatal:` line.
- A missing file, an empty or blank-only file and an invalid regex each
  exit non-zero with a message saying how to fix it.
- One line in `CONTRIBUTING.md`: the hook needs the patterns file. It
  must not suggest a placeholder file: a one-line dummy passes the
  non-empty check and switches the guard off.
- The positive control uses a temporary repository or a pattern the owner
  adds by hand; the session never writes to the real patterns file.

**Owner decides before the build:** what a contributor without the account
values does. The repo is public and the hook refuses every commit without
the file; a placeholder is a bypass in effect. Until decided, the build
stops at the `CONTRIBUTING.md` line.

Decided by the owner on 2026-11-23, in session: the hook stays fail-closed
on a missing file; a contributor without the account values commits with
`SKIP=account-patterns`, and `CONTRIBUTING.md` says so.

Plan-time choices of 2026-11-23, the planner's recommendation; the owner
reviews them with the plan: whole staged files, not added lines only; the
hook is local only, so a clone without the patterns file cannot commit
until it creates one.

## Out of scope
- Running the hook in `make quality` or in CI (neither has the patterns
  file); a CI scan with an encrypted patterns secret.
- Rescanning history; scanning commit messages.
- Any bypass flag or environment override (AGENTS.md hard rule 3).
- A new dependency: python3 and git only.
- Known limits, to be stated in the script's header, not fixed here:
  `--no-verify` and `SKIP=<hook id>` skip it; a clone that never ran
  `make install` has no hook; a merge commit runs no commit-stage hook;
  paths are not scanned, only content.

## Spec sections to read
- SPEC.md §14
- SPEC.md §9

## Files expected to change
- `tools/checks/account_patterns.py` (new)
- `tools/checks/test_account_patterns.py` (new)
- `.pre-commit-config.yaml`
- `CONTRIBUTING.md`

## Wireframes
`none`

## Acceptance
A local commit-stage hook (not in `make quality`, not in CI) runs `git grep --cached -n -iE -f docs/private/account-patterns` over the index: in the caller's locale and in the C locale: exit 0 from either run refuses, 1 with nothing on stderr from both passes, anything else fails; `tools/checks/test_account_patterns.py`, with temporary repositories and pattern files, proves a match is refused naming `file:line`, a match in a binary file is refused naming the file, content staged but absent from the working tree is caught, and a missing file, an empty or blank-only file and an invalid regex each exit non-zero with a message saying how to fix it; no output on any path, the invalid regex included, contains a pattern line or the matched text; a staged synthetic match is refused by the installed hook (positive control, output in HANDOFF); `make quality` green.

---
*Filled at `/handoff`:*

## Done
- `054da94`: `tools/checks/account_patterns.py`, the `account-patterns`
  hook in `.pre-commit-config.yaml`, the `CONTRIBUTING.md` section, and
  `examples/team-config.example.json:10` (see "Open doubts").
- `f79ffd2`: full-round fixes. `9fbaa8d`: scoped-round fix and the
  owner's both-locales choice.
- Tests: `tools/checks/test_account_patterns.py` (29):
  `Matching::test_match_is_refused_naming_file_and_line`,
  `Matching::test_match_in_a_binary_file_is_refused_naming_the_file`,
  `IndexNotWorkingTree::test_staged_content_deleted_from_the_working_tree_is_caught`,
  `IndexNotWorkingTree::test_temporary_index_of_commit_a_is_the_one_scanned`,
  `CannotCheck::test_invalid_regex_does_not_print_the_pattern`,
  `CannotCheck::test_unreadable_blob_is_not_a_pass`,
  `BothLocales` (each of its two tests seen red with one locale run
  removed).
- Positive control: in `docs/HANDOFF.md`, "Checkpoint".

## Dead ends
- Forcing `LC_ALL=C` on git grep to parse its "Binary file" sentence
  (`054da94`): the C locale does not fold an accented letter's case.
  Binary files are now named from a `-l` run.
- The caller's locale alone (`f79ffd2`): `.` does not match a byte that
  is not valid UTF-8. Hence both runs (`9fbaa8d`).

## Open doubts
- `9fbaa8d` changed the mechanism after the scoped round and no reviewer
  read it (AGENTS.md rule 9: no third round). The owner chose the change
  on 2026-11-23; the builder's tests are its only check.
- The owner's answer on contributors was conditional: `SKIP=` unless the
  patterns file is only the list of custom fields. It also holds other
  kinds of value, so the builder took `SKIP=`; the owner has not
  confirmed that reading.
- `CONTRIBUTING.md` documents `SKIP=account-patterns` beside AGENTS.md
  hard rule 3; the exception is recorded here only.
- The field name that stood at `examples/team-config.example.json:10`
  before `054da94` is a real one and stays in pushed history: owner's
  decision of 2026-11-23, low sensitivity, no rewrite.
- "Plan-time choices" above still says a clone "cannot commit until it
  creates one"; the owner's decision replaces it.
- A caller whose own locale is C gets no case folding of accented
  letters (script header, known limits).
- Parked review items: `docs/improvements.md`, the entry stamped
  `9fbaa8d`.

## Context pressure
ok

## Next action
none: the task is done.
