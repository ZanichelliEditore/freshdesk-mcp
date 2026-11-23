# T-012 — Guard: account-value patterns in the commit hook

- **Type:** build
- **Phase:** M0
- **Status:** todo (2026-11-23)
- **Depends on:** T-001
- **Created:** 2026-11-23

## Goal
A commit that stages a real account value is refused on the owner's
machine, before T-008 brings the first field-label fixtures.

## In scope
- `tools/checks/account_patterns.py`: runs `git grep --cached -iE -f
  docs/private/account-patterns` (gitignored file) over the whole index,
  the matcher T-001 used for the history scrub. It is not reimplemented
  with Python's `re` (not POSIX ERE: a bracket class would compile and
  never match) and never reads the working tree.
- Exits: 0 is a match and refuses the commit, 1 passes, any other exit
  fails. A match in a binary file refuses, naming the file.
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
A local commit-stage hook (not in `make quality`, not in CI) runs `git grep --cached -iE -f docs/private/account-patterns` over the index: exit 0 refuses, 1 passes, any other exit fails; `tools/checks/test_account_patterns.py`, with temporary repositories and pattern files, proves a match is refused naming `file:line`, a match in a binary file is refused naming the file, content staged but absent from the working tree is caught, and a missing file, an empty or blank-only file and an invalid regex each exit non-zero with a message saying how to fix it; no output on any path, the invalid regex included, contains a pattern line or the matched text; a staged synthetic match is refused by the installed hook (positive control, output in HANDOFF); `make quality` green.

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
