# T-001 — Connect the remote (GitHub)

- **Type:** build
- **Phase:** M0
- **Status:** todo
- **Depends on:** none
- **Created:** 2026-11-20

## Goal
The repo has a GitHub remote, `main` is pushed, and CI (`quality.yml`) has been observed green on the pushed `HEAD`.

## In scope
- Owner chooses GitHub owner (personal or org) and visibility (SPEC §12, open decision).
- Real account values are in `SPEC.md` **and in every commit since `4b4dc87`**: a HEAD-only scrub is not enough. Values to look for go in a gitignored patterns file (one regex per line); tracked prose names the account by slug (AGENTS.md rule 2, SPEC §14 rule 2).
- If the repo is **public** at first push: move the values out of `SPEC.md` into the gitignored file, then rewrite or squash history before the first push (no remote yet, so rewriting is cheap).
- If **private**: no scrub now; HANDOFF records that the history scrub is due before the repo goes public, and PLAN gains a `proposed` row for it with the same history-wide acceptance.
- Push `main`; watch the `quality.yml` run (`gh run watch`). The first run may be red (`gitleaks-action` has no parent for the root commit): a fix must not skip, weaken or `continue-on-error` the gitleaks step.
- Turn on Dependabot security updates.

## Out of scope
- Any TypeScript or dependency change.
- npm publish, release workflow.

## Spec sections to read
- SPEC.md §12
- SPEC.md §14

## Files expected to change
- `docs/HANDOFF.md`, `docs/tasks/PLAN.md` (private: the `proposed` row)
- `.github/workflows/quality.yml` (only if the first run needs a fix)
- `SPEC.md` and a gitignored patterns file (only if public)

## Wireframes
`none`

## Split point
If public at first push: (a) SPEC scrub + history rewrite, (b) push + CI. Take (a) alone if it is not finished at half the context.

## Acceptance
`main` pushed; a `quality.yml` run observed green on the last pushed commit before the handoff stamp, run URL and the SHA it ran on in HANDOFF (if an earlier run was red, why; gitleaks step unweakened); Dependabot security updates on; public: the patterns file is non-empty, `git grep -iEf <patterns file> $(git rev-list --all)` matched before the rewrite (positive control) and exits 1 after it (0 or 2 fails); private: HANDOFF says the history scrub is due and PLAN has its `proposed` row with this same check.

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
