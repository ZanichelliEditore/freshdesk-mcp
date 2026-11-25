# T-049 — Maintainer's check of a commit range for account values

- **Type:** build
- **Phase:** M1
- **Status:** doing (2026-11-25)
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
- T-012's exits: exit 1 with anything on stderr is not a pass, so a commit
  with a blob git cannot read (a partial clone of a fork) fails naming it.
- Each commit's message and paths too (`account_patterns.py`'s header lists
  them as the hook's limits; a `SKIP` commit brings them into `main`). A
  match there names the commit and `message` or `path`, never the text.
- Fail closed, each with a message saying how to fix it: `RANGE` unset or
  without `..`; an end starting with `-` or not resolved by
  `git rev-parse --verify --end-of-options`; a base that is not an ancestor
  of the head (a reversed or stale range); a range with no commit (a check
  of nothing is not a pass); a shallow repository (`rev-list` stops at the
  boundary silently); a checkout from which any commit of the range is
  reachable, a local merge included (refuse unless
  `git merge-base HEAD <head>` is an ancestor of `<base>`), or whose
  `Makefile` or `tools/` differ from HEAD. A hostile pull request could
  change the checker or read the patterns file; the guard runs inside the
  code it protects, so it catches a slip, not an attack: the control is
  `CONTRIBUTING.md`'s "run from `main`".
- On success, print only the number of commits checked.
- A `make` target with a one-line description taking `RANGE=<base>..<head>`
  through the environment, quoted (`"$$RANGE"`), never spliced into the
  recipe.
- `CONTRIBUTING.md`, "The `account-patterns` hook": fetch the pull request
  as a ref, and run the target from `main`, never from its checkout.

- Parked from review, for the builder to weigh: `docs/improvements.md`,
  entry "M1 plan scoped review (bcf8138..6a8cfdc)".

## Split point
If the session runs tight, stop after the tree scan with every refusal
and its tests; commit messages and paths become a `proposed` row. Then
`CONTRIBUTING.md` does not say messages and paths are scanned until that
row lands.

## Out of scope
- CI (it has no patterns file); scanning only added lines (the whole tree
  of each commit is simpler and stricter, and `main`'s history is clean
  since T-001).
- "One commit at a time" is a constraint of the code (In scope), not of
  the acceptance: no test on a small repository can tell it apart.

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
`tools/checks/test_account_patterns.py` (temporary repositories and pattern files): a new `make` target (one-line description) takes `RANGE=<base>..<head>` through the environment, quoted, and refuses `RANGE` unset, without `..`, with an end starting with `-` or an end `git rev-parse --verify --end-of-options` does not resolve, a base that is not an ancestor of the head (`git merge-base --is-ancestor`), a range with no commit (`git rev-list --count` 0), a shallow repository, a checkout from which any commit of the range is reachable (a local merge of the pull request included) and a checkout whose `Makefile` or `tools/` differ from HEAD (the check runs from `main`, never from the pull request's own code), each non-zero with a message saying how to fix it; it runs `docs/private/account-patterns` over the tree of every commit in the range in both locales with T-012's exits (exit 1 with anything on stderr is not a pass: a commit with a blob git cannot read fails naming that commit), and over each commit's message and paths; a value added in a middle commit and removed at head is refused naming the short commit id and the file, a value in a commit message or a path naming the short commit id and `message` or `path` only; a clean range exits 0 printing only the number of commits checked; a missing, empty or invalid patterns file exits non-zero as in T-012; no output on any path contains a pattern line or the matched text; `CONTRIBUTING.md`'s "The `account-patterns` hook" tells the maintainer to fetch the pull request as a ref and run the target from `main`; `make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
