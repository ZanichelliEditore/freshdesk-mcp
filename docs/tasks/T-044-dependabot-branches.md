# T-044 — Examine the two Dependabot branches and report

- **Type:** spike
- **Phase:** M1
- **Status:** todo (2026-11-23)
- **Depends on:** T-015
- **Created:** 2026-11-23

## Goal
A report on the two Dependabot branches on the remote, so the owner can
decide. Nothing is merged, pushed or deleted without the owner's go (owner,
2026-11-23).

## In scope
- Per branch: the package, the versions from and to, whether the bump stays
  inside the ranges RFC 2026-11-23 admits (outside them it needs `/rfc`,
  AGENTS.md rule 3), the changelog's breaking notes, and what `make quality`
  (with the build) prints on a local worktree of the branch.
- A recommendation per branch: merge, close, or wait.

## Out of scope
- Merging, rebasing, closing or deleting a branch; any change to
  `package.json` on `main`.

## Spec sections to read
- SPEC.md §11

## Files expected to change
- `docs/tasks/T-044-dependabot-branches.md` (the report, under "Done")
- `docs/tasks/PLAN.md` (`proposed` rows only, if a bump needs work)

## Wireframes
`none`

## Acceptance
The task file's "Done" has one entry per Dependabot branch on the remote
(`git branch -r` output quoted): package, from → to, inside or outside the
RFC's range, the last lines `make quality` printed on that branch, and a
recommendation; `git log origin/main` and the remote's branch list are
unchanged by the session; `make quality` green on `main`.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
