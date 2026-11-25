# T-045 — Release workflow: publish from CI on a version tag

- **Type:** build
- **Phase:** M1
- **Status:** doing (2026-11-25)
- **Depends on:** T-038, T-048
- **Created:** 2026-11-23
- **Gates:** Before the first tag the owner does steps 0-2 of RFC
  2026-11-25 (release on npm): repository public, environment `npm` (no
  reviewer, no secret, tags `v*` only), `v*` tag ruleset, `main` branch
  ruleset (pull request and `quality` green; same bypass list). No `v*`
  tag before step 1: a tag pushed first creates `npm` with no deployment
  rule. Before step 4 the owner confirms `npm` shows "Selected branches and
  tags" with only the `v*` tag rule. Steps 3-6
  (placeholder `0.0.0`, trusted publisher, tag `v0.1.0`, disallow tokens)
  are the owner's, on the explicit go, after T-039, outside this task.

## Goal
A workflow that publishes the package to public npm from CI when a version
tag is pushed, with provenance and every check run again (owner,
2026-11-23). It prepares the release and publishes nothing: the first
publish is 0.1.0, only after T-039 and on the owner's explicit go.

## In scope
- `.github/workflows/release.yml`: a publish only on the push of a `v*` tag;
  the publish job `needs` the quality and gitleaks jobs (jobs, not steps)
  and the build; `npm publish --provenance --access public`.
- The publish job uses npm trusted publishing (RFC 2026-11-25, release on
  npm): it declares `environment: npm`, and no job references an npm token
  or a secret. The quality and gitleaks jobs are copied from `quality.yml`,
  not called (a local reusable workflow cannot carry a SHA).
- Pins beyond the RFC's three, to hand the build's tarball to the publish:
  `actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9`
  (v7.0.2) and `actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333`
  (v8.0.2), both lightweight tags, read with `git ls-remote` by the builder
  and again by the orchestrator (2026-11-25). The RFC's three rechecked the
  same day, unchanged.
- `package.json` `publishConfig.provenance: true`, so a publish from outside
  Actions fails without an OIDC token (full review, 2026-11-25).
- `package.json`: `repository.url`
  `https://github.com/ZanichelliEditore/freshdesk-mcp` and
  `"license": "MIT"` (owner, 2026-11-25); a root `LICENSE` (MIT, copyright
  holder "Zanichelli Editore S.p.A.", owner 2026-11-25).
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
- `LICENSE`
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
and fails on a mismatch; it publishes by npm trusted publishing (RFC
2026-11-25, release on npm): the publish job declares `environment: npm`,
and no job references an npm token or a secret; `package.json`
`repository.url` is `https://github.com/ZanichelliEditore/freshdesk-mcp` and
`license` is `MIT`, and a root `LICENSE` holds the MIT text with copyright
holder "Zanichelli Editore S.p.A."; workflow `permissions` are `contents:
read`, and `id-token: write` appears on the publish job only; the dry-run
job references no secret; every `uses:` carries a 40-hex commit SHA; a step
before the publish fails unless the tagged commit is an ancestor of
`origin/main`; the publish carries `--provenance` and `--access public`. The
version script's unit test runs it with a matching and a mismatched tag and
version. `README.md` carries the version policy line (asserted). A
`workflow_dispatch` dry run is observed green on GitHub, its URL in HANDOFF;
no tag exists on the remote and the package is not on npm after the session;
`make quality` green.

---
*Filled at `/handoff`:*

## Done
Status stays `doing (2026-11-25)`: the acceptance's `workflow_dispatch` dry
run observed green on GitHub comes after the push.

- Commits: `4bf3ade` (status doing), `2076c9f` (workflow, scripts, tests,
  package metadata, LICENSE, CHANGELOG, README), `b3b8b07` (full review
  fixes), and the commit that parks the scoped round's lists B (this
  section).
- Acceptance clause -> test (`tools/checks/test_release_workflow.py` unless
  named):
  - commented-out publish line is not publishing:
    `Helpers::test_commented_out_publish_is_not_publishing`,
    `test_uncommented_publish_is_publishing`;
    `ReleaseWorkflow::test_one_job_publishes_and_it_is_publish`
  - publish condition is a `v*` tag push alone, no `workflow_dispatch`
    input: `test_publish_condition_is_a_v_tag_push_alone`,
    `test_triggers_are_v_tags_and_dispatch_without_inputs`
  - `needs` quality, gitleaks, build; publishes what the chain built:
    `test_publish_needs_quality_gitleaks_and_build`,
    `test_publish_ships_what_build_packed`,
    `test_checkouts_take_the_triggering_commit`,
    `test_copied_jobs_equal_quality_yml`
  - version script on the tag before the publish, fails on a mismatch:
    `test_version_script_runs_on_the_tag_before_publish`,
    `test_checks_and_publish_steps_are_unconditional`;
    `tools/checks/test_release_version.py` (matching and mismatched tag and
    version, run as a subprocess)
  - trusted publishing, `environment: npm`, no token or secret:
    `test_trusted_publishing_with_provenance`,
    `test_no_job_references_a_token_or_secret`,
    `Helpers::test_every_secret_form_is_found`
  - `package.json` `repository.url`, `license`, no `private`,
    `publishConfig.provenance`; LICENSE MIT with the holder:
    `PackageMetadata::test_package_json`,
    `test_license_is_mit_with_the_holder`; LICENSE required in the pack
    list: `test/package.test.ts` ("packs only dist/, README.md, LICENSE,
    ...")
  - workflow `contents: read`, `id-token: write` on publish only:
    `test_permissions`, `test_wider_job_permissions_are_found`
  - dry-run job references no secret:
    `test_dry_run_publishes_nothing_and_needs_nothing_secret`
  - every `uses:` by 40-hex SHA: `test_every_uses_is_pinned_by_sha`,
    `Helpers::test_tag_pin_is_not_a_sha_pin`
  - tagged commit an ancestor of `origin/main` before the publish:
    `test_tagged_commit_must_be_on_main_before_publish`
  - `--provenance` and `--access public`:
    `test_trusted_publishing_with_provenance`
  - README version policy line: `test_readme_states_the_version_policy`;
    CHANGELOG started: `test_changelog_started`
- Mutations, each made on the real files and restored, each seen red: 14
  at `2076c9f` (publish commented out, tag dropped from `if:`, gitleaks
  dropped from `needs`, version check not on the tag, ancestor step
  removed, `environment` removed, a secret added, top-level `id-token`,
  dry run without `--dry-run`, a tag pin, no `--provenance`, no
  `npm pack`, a local build in publish, a step dropped from the quality
  copy); 14 at `b3b8b07` (gitleaks copy without `fetch-depth`, matrix,
  block-scalar body, a `with:` value, `secrets['X']`, `toJSON(secrets)`,
  `github.token`, `ref:` on the build checkout, `if:` on the ancestor and
  on the version step, `write-all` on build, `contents: write` on
  publish, `id-token` on dry-run, `publishConfig` removed).
- Pins: the RFC's three rechecked with `git ls-remote` (2026-11-25),
  unchanged; `actions/upload-artifact` v7.0.2 and
  `actions/download-artifact` v8.0.2 (In scope) read with `git ls-remote`
  by the builder and again by the orchestrator, lightweight tags, match.
- `package.json` version already `0.1.0`: this task bumps nothing.
- `publishConfig.provenance: true`: a publish outside Actions fails (npm
  11.19.1 `libnpmpublish` throws EUSAGE "Automatic provenance generation
  not supported for provider" before the upload). The dry run needs no
  `--provenance=false`: npm 11.19.1 calls libnpmpublish, where provenance
  is signed, only when not `--dry-run` (`lib/commands/publish.js:194`), and
  its OIDC step returns early without `ACTIONS_ID_TOKEN_REQUEST_URL`
  (`lib/utils/oidc.js:64-68`). Read from the npm 11.19.1 tarball, not run.
- Reviews: full round on `737b262..2076c9f` (compliance: Wireframes
  `none`; security 2 Medium, 1 Low, 1 info; code 3 Medium, 4 Low), all
  applied in `b3b8b07`; scoped round on `2076c9f..b3b8b07`, lists A empty,
  lists B parked in `docs/improvements.md` (entry `b3b8b07`).
- `make quality` green before `2076c9f`, `b3b8b07` and this commit
  (vitest 2528, Python checks 87); `4bf3ade` (status only, docs) was
  committed before the gate ran, which then passed on the same code.

## Dead ends
none

## Open doubts
- The GitHub settings (environment `npm` with only the `v*` tag rule, the
  `v*` tag ruleset, the `main` ruleset) cannot be tested in the repository;
  the owner confirms them (RFC steps 0-2, and the check before step 4).
- A `workflow_dispatch` dry run after 0.1.0 is published may be refused:
  npm 11 rejects publishing over an existing version even with
  `--dry-run`. Expected then, not a fault.
- `release.yml`'s quality and gitleaks jobs are copies: they can drift
  from `quality.yml` only if both change together, since
  `test_copied_jobs_equal_quality_yml` compares them whole.

## Context pressure
Moderate: one task, two review rounds, no reread of large files.

## Next action
Orchestrator/owner: push, run `release.yml` by `workflow_dispatch` on
`main`, observe quality x2, gitleaks, build, dry-run green and publish
skipped; record the URL; confirm no remote tag and
`npm view @zanichelli/freshdesk-mcp` 404; then tick the RFC's Implemented
box and set done.
