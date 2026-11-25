# T-049 — Maintainer's check of a commit range for account values

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-25)
- **Depends on:** T-012
- **Created:** 2026-11-25

## Goal
A maintainer runs one `make` target over a pull request's commits and
learns whether any of them holds an account value, so a commit made with
`SKIP=account-patterns` is checked before merge (raised by the M1 plan's
full review round, 2026-11-23, security-reviewer; `CONTRIBUTING.md`, "The
`account-patterns` hook").

## In scope
- `tools/checks/account_patterns.py`: a range mode reusing T-012's
  patterns-file checks, matcher and both locale runs, over the tree of
  every commit of `git rev-list <base>..<head>`, one commit at a time (a
  single argument list of all commits can hit `ARG_MAX`).
- Output: the short commit id and the file of each match, as T-012 names
  files; never a pattern line or the matched text.
- Fail closed: an empty range or an unknown revision exits non-zero with
  a message saying how to fix it, as a missing, empty or invalid patterns
  file does.
- A `make` target with a one-line description taking `RANGE=<base>..<head>`.
- `CONTRIBUTING.md`, "The `account-patterns` hook": the maintainer's check
  before merge names the target.

## Out of scope
- CI (it has no patterns file); scanning only added lines (the whole tree
  of each commit is simpler and stricter, and `main`'s history is clean
  since T-001).

## Spec sections to read
- SPEC.md §11

## Files expected to change
- `tools/checks/account_patterns.py`
- `tools/checks/test_account_patterns.py`
- `Makefile`
- `CONTRIBUTING.md`

## Wireframes
`none`

## Acceptance
`tools/checks/test_account_patterns.py` (temporary repositories and
pattern files): a new `make` target (`RANGE=<base>..<head>`, one-line
description) runs `docs/private/account-patterns` over the tree of every
commit in the range, one commit at a time (no single argument list of all
commits), in both locales as T-012; a value added in a middle commit and
removed at head is refused naming the short commit id and the file; a
clean range exits 0 silently; an empty range, an unknown revision, a
missing, empty or invalid patterns file each exit non-zero with a message
saying how to fix it; no output on any path contains a pattern line or the
matched text; `CONTRIBUTING.md`'s "The `account-patterns` hook" names the
target for the maintainer's check before merge; `make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
