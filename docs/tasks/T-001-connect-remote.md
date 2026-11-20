# T-001 — Connect the remote (GitHub)

- **Type:** build
- **Phase:** M0
- **Status:** todo
- **Depends on:** none
- **Created:** 2026-11-20

## Goal
The repo has a GitHub remote, `main` is pushed, and CI (`quality.yml`) has been observed green on it.

## In scope
- Owner chooses GitHub owner (personal or org) and visibility (SPEC §12, open decision).
- If the repo is **public** at first push: move real account values out of `SPEC.md` into a gitignored file, committed prose names the account by slug (AGENTS.md rule 2, SPEC §14 rule 2). If **private**, record in HANDOFF that the scrub is due before the repo goes public, and add a `proposed` row for it.
- Push `main`; watch the first `quality.yml` run (`gh run watch`). The first run may be red: `gitleaks-action` has no parent for the root commit; fix or document.
- Turn on Dependabot security updates.

## Out of scope
- Any TypeScript or dependency change.
- npm publish, release workflow.

## Spec sections to read
- SPEC.md §12
- SPEC.md §14

## Files expected to change
- `docs/HANDOFF.md`
- `SPEC.md` (only if public)
- gitignored values file (only if public)

## Wireframes
`none`

## Split point
If public at first push: (a) SPEC scrub, (b) push + CI. Take (a) alone if it is not finished at half the context.

## Acceptance
`git ls-remote origin main` equals local `HEAD`; first `quality.yml` run on `main` observed green, run URL in HANDOFF; Dependabot security updates on; if public, SPEC.md holds no real account values (owner-checked grep, recorded in HANDOFF).

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
