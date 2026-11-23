# T-045 — Release workflow: publish from CI on a version tag

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
- **Depends on:** T-038
- **Created:** 2026-11-23
- **Gates:** The owner sets the npm token secret before the first tag; the
  first publish is the owner's explicit go, after T-039, outside this task.

## Goal
A workflow that publishes the package to public npm from CI when a version
tag is pushed, with provenance and every check run again (owner,
2026-11-23). It prepares the release and publishes nothing: the first
publish is 0.1.0, only after T-039 and on the owner's explicit go.

## In scope
- `.github/workflows/release.yml`: on a `v*` tag only; the quality job and
  the build run again before the publish step; `npm publish --provenance
  --access public`; the tag must equal the `package.json` version or the job
  fails before publishing.
- A manual dry-run entry (`workflow_dispatch`, `npm publish --dry-run`) so
  the workflow can be observed on GitHub without a tag.
- `private: true` removed here; `CHANGELOG.md` started; versions stay 0.x
  until M4, then 1.0.0 (written in the README or CONTRIBUTING).
- The npm token is a repository secret the owner sets; no token, tag or
  publish in this session.

## Out of scope
- Pushing a tag, publishing, the `.mcpb` asset (M4).

## Spec sections to read
- SPEC.md §11
- SPEC.md §12

## Files expected to change
- `.github/workflows/release.yml`
- `tools/checks/test_release_workflow.py`
- `package.json`
- `CHANGELOG.md`
- `CONTRIBUTING.md`

## Wireframes
`none`

## Acceptance
`tools/checks/test_release_workflow.py` reads `release.yml` and asserts: the
only push trigger is a `v*` tag; the publish step comes after the lint,
type-check, test, build and gitleaks steps; it carries `--provenance` and
`--access public`, with `id-token: write`; the token comes from `secrets`; a
tag that differs from the `package.json` version fails a step placed before
the publish; the dry-run entry never publishes; a `workflow_dispatch` dry
run is observed green on GitHub, its URL in HANDOFF; no tag exists on the
remote and the package is not on npm after the session; `make quality`
green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
