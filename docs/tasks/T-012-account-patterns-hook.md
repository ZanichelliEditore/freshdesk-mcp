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
- `tools/checks/account_patterns.py`: checks every staged file's whole
  content against `docs/private/account-patterns` (gitignored), with the
  semantics T-001 used for the history scrub (case-insensitive extended
  regex, one pattern per line).
- A `repo: local`, `language: system` commit-stage hook in
  `.pre-commit-config.yaml`, `pass_filenames: false`, `always_run: true`.
- Output names `file:line`, never the pattern or the matched text.
- A missing file, an empty or blank-only file and an invalid regex each
  exit non-zero with a message saying how to fix it. A grep exit of 2
  counts as a failure, never as "no match".
- One line in `CONTRIBUTING.md`: the hook needs the patterns file, and
  what a contributor without it does.

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
A local commit-stage hook (not in `make quality`, not in CI) checks every staged file's content against `docs/private/account-patterns`; `tools/checks/test_account_patterns.py`, with temporary pattern files, proves a staged match is refused naming `file:line` and never the pattern, and that a missing file, an empty or blank-only file and an invalid regex each exit non-zero with a message saying how to fix it; a staged synthetic match is refused by the installed hook (positive control, output in HANDOFF); `make quality` green.

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
