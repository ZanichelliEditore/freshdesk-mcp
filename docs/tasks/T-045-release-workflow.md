# T-045 — Release workflow: publish from CI on a version tag

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
- **Depends on:** T-038, T-048
- **Created:** 2026-11-23
- **Gates:** The owner sets up what T-048 chose (the environment and its
  reviewer, or the npm trusted publisher; a token secret only if T-048 keeps
  one) before the first tag; the first publish is the owner's explicit go,
  after T-039, outside this task.

## Goal
A workflow that publishes the package to public npm from CI when a version
tag is pushed, with provenance and every check run again (owner,
2026-11-23). It prepares the release and publishes nothing: the first
publish is 0.1.0, only after T-039 and on the owner's explicit go.

## In scope
- `.github/workflows/release.yml`: a publish only on the push of a `v*` tag;
  the publish job `needs` the quality and gitleaks jobs (jobs, not steps)
  and the build; `npm publish --provenance --access public`.
- The publish job is gated by the mechanism T-048 chose, in the workflow
  itself, not in prose. A token, if T-048 keeps one, is in the publish
  step's `env` only.
- `permissions: contents: read` for the workflow; `id-token: write` on the
  publish job only. Every action pinned by commit SHA.
- The tagged commit must be an ancestor of `origin/main`; the tag must equal
  the `package.json` version, compared by a script with its own unit test.
- A manual dry-run job (`workflow_dispatch`, `npm publish --dry-run`) that
  references no secret; no `workflow_dispatch` input can turn it into a
  publish.
- `private: true` is removed here and in no earlier task; `CHANGELOG.md`
  started; the version policy line (0.x until M4, then 1.0.0) in the README.
- The workflow checks are text-level, standard library only, and ignore
  commented-out lines. No PyYAML: if a parser is needed, stop and raise an
  RFC.
- No token, tag or publish in this session.

## Out of scope
- Pushing a tag, publishing, the `.mcpb` asset (M4).

## Spec sections to read
- SPEC.md §11
- SPEC.md §12

## Files expected to change
- `.github/workflows/release.yml`
- `tools/checks/test_release_workflow.py`
- `tools/checks/release_version.py` and its test
- `package.json`
- `CHANGELOG.md`
- `README.md`

## Wireframes
`none`

## Acceptance
`tools/checks/test_release_workflow.py` (standard library, text-level; a
fixture workflow whose publish line is commented out is not taken as
publishing) asserts on `release.yml`: the publish job's condition is the
push of a `v*` tag alone and names no `workflow_dispatch` input; it `needs`
the quality, gitleaks and build jobs, and what it publishes is what that
chain built; a step before the publish runs the version script on the tag
and fails on a mismatch; it is gated by the mechanism T-048 chose; workflow
`permissions` are `contents: read`, and `id-token: write` appears on the
publish job only; a token, if any, appears only in the publish step's `env`;
the dry-run job references no secret; every `uses:` carries a 40-hex commit
SHA; a step before the publish fails unless the tagged commit is an ancestor
of `origin/main`; the publish carries `--provenance` and `--access public`.
The version script's unit test runs it with a matching and a mismatched tag
and version. `README.md` carries the version policy line (asserted). A
`workflow_dispatch` dry run is observed green on GitHub, its URL in HANDOFF;
no tag exists on the remote and the package is not on npm after the session;
`make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
