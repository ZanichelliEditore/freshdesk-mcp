# Release on npm: how a publish is authorised

- **Status:** Active (owner, 2026-11-25)
- **Date:** 2026-11-25
- **Author:** freshdesk-mcp team
- [ ] Implemented

## Context

The runtime-stack RFC leaves release tooling to its own RFC
(`docs/rfc/active/2026-11-23-adopt-runtime-stack.md:126-128`). T-045 writes
the release workflow; this RFC records the owner's release decisions and
decides how a publish is authorised, so T-045 can test for it.

Recorded decisions (owner):

1. Public npm (2026-11-20, SPEC §12; 2026-11-23).
2. Package name `@zanichelli/freshdesk-mcp`, repository public (2026-11-23).
3. Published from CI on a version tag, with provenance and every check run
   again (2026-11-23).
4. Versions stay 0.x until M4, then 1.0.0 (2026-11-23).
5. The first publish is 0.1.0, after T-039 (M1's real-account smoke) and on
   the owner's explicit go (2026-11-23). T-039 is done (2026-11-25).
6. License MIT (SPEC §12, 2026-11-20; confirmed 2026-11-25).
7. Who may publish: "any user allowed to run the pipeline that publishes
   the package can publish it" (2026-11-25). The authorisation is the
   pipeline's, not a personal npm membership, and needs no second human
   approval.
8. `LICENSE` copyright holder: "Zanichelli Editore S.p.A." (2026-11-25).
9. Protect `main` with a branch ruleset (require a pull request and the
   `quality` check green) before the first tag (2026-11-25).

The owner approved this RFC, and its reading of decision 5 (below), on
2026-11-25.

Facts found while drafting (sources read 2026-11-25, listed at the end):

- npm trusted publishing binds a package to a GitHub organisation,
  repository, workflow **file name** and, optionally, a GitHub
  **environment**. The job proves itself with a short-lived OIDC token; no
  npm token exists anywhere. It needs `id-token: write`, a GitHub-hosted
  runner, npm CLI ≥ 11.5.1 and Node ≥ 22.14.0, and `repository.url` in
  `package.json` equal (case-sensitive) to the GitHub repository. Provenance
  is generated automatically; `--provenance` is harmless. Provenance needs a
  public repository and a public package.
- A trusted publisher **cannot be configured for a package that does not
  exist**: "The package you're configuring must already exist on the npm
  registry" (`npm trust` docs). A new configuration must see its first
  successful publish within 2 days or it expires.
- Direct `npm publish` with a granular token (bypass 2FA), the only way an
  environment secret could publish from CI, is due to be removed: npm
  targets January 2027, after which such tokens can only stage a publish
  that a maintainer approves with 2FA.
- Trusted publishing alone checks the workflow file name, not the ref. A
  writer could push a branch whose copy of `release.yml` publishes on a
  branch push, and npm would accept its token. A GitHub environment whose
  deployment policy allows only tags matching `v*`, named in the trusted
  publisher, closes that: a job on any other ref cannot enter the
  environment, so its token never carries the environment claim npm
  requires. Deployment branch and tag rules are available on every public
  repository.
- Node 24.22.3 (2026-11-10) bundles npm 11.19.1, above the trusted
  publishing floor.

## Decision

**npm trusted publishing over OIDC, bound to a GitHub environment that only
`v*` tags can enter, with a tag ruleset deciding who can push a `v*` tag.**
No npm token is stored anywhere, ever.

- **npm side.** The trusted publisher for `@zanichelli/freshdesk-mcp`:
  organisation `ZanichelliEditore`, repository `freshdesk-mcp`, workflow
  `release.yml`, environment `npm`. Then the package's publishing access is
  set to "Require two-factor authentication and disallow tokens" (it does
  not affect trusted publishers).
- **GitHub side.** An environment `npm` with **no** required reviewers and
  **no** secrets, deployment policy "Selected branches and tags" with one tag
  rule, `v*`. A tag ruleset on `v*` that restricts creations, updates and
  deletions, with a bypass list naming who may release (repository admins
  and the maintain role, or a release team; the owner chooses). A branch
  ruleset on `main` (owner, 2026-11-25) that requires a pull request and the
  `quality` check green, with **the same bypass list** as the tag ruleset.
- **Workflow (T-045).** The publish job declares `environment: npm` and
  `permissions: id-token: write`, runs on `ubuntu-latest`, uses Node
  `24.22.3` (bundled npm 11.19.1), and references no secret. It publishes
  the `dist/` built from a fresh checkout by the chain it `needs`, never a
  local tree (the stale-`dist/` park, `docs/improvements.md`, entry
  82ab7a6). It keeps `--provenance --access public`.
- **Pins.** Every `uses:` by commit SHA (read 2026-11-25 with
  `git ls-remote`; all three are lightweight tags, so the SHA is the
  commit). The chain needs all three: the quality job runs ruff and the
  Python checks, and the gitleaks job runs `pre-commit`, both after
  `actions/setup-python`.
  - `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` (v7.0.1,
    released 2026-07-20)
  - `actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1` (v7.1.0,
    released 2026-10-08)
  - `actions/setup-python@6d4fd22b20465ccc0f7354476588e8df7c9ca0e0`
    (v7.1.0, released 2026-10-22)

  `release.yml` copies the quality and gitleaks jobs from `quality.yml`
  rather than calling it: a local reusable workflow is referenced as
  `uses: ./.github/workflows/quality.yml`, a path that cannot carry a SHA,
  and T-045 requires a 40-hex SHA on every `uses:`. The copy can drift from
  `quality.yml`; T-045's checks name the jobs the publish `needs`.

  T-045 rechecks these against the current releases when it writes the
  workflow, and adds any other action only with its SHA.

**Who can trigger a publish:** whoever can create a `v*` tag under the
ruleset (its bypass list), plus repository admins, who can change the
ruleset and the environment. That set is "the users allowed to run the
pipeline". T-045's checks (the tagged commit is an ancestor of
`origin/main`, the tag equals `package.json`) guard against mistakes, not
against the people on the bypass list: the checks live in `release.yml`,
and the run uses the `release.yml` of the tagged commit. A bypass-list user
can tag a branch commit whose `release.yml` drops the check, and publish any
code, with provenance that names that commit. `main` itself is not protected
today (read 2026-11-25 from the public API: `branches/main` reports
`protected: false`, and no ruleset applies to `main`). The owner chose to
protect it (2026-11-25): a `main` ruleset requiring a pull request and the
`quality` check green. "Require a pull request" stops direct pushes to
`main`, the orchestrator's ship script included, for anyone not on the
ruleset's bypass list. The recommendation is the same bypass list as the
`v*` tag ruleset: the people who may release keep direct pushes, so the
rule guards every other writer, not them. Then "on `main`" means "reviewed
or pushed by someone who may release", which is the owner's rule again.

**What a leaked credential allows:** there is no stored npm credential to
leak. The OIDC token lives for minutes, inside one job, and npm accepts it
only for this package from this workflow in this environment. A leaked
GitHub credential of someone on the bypass list can publish any code, as
above, with provenance pointing at the commit it tagged; that is the same
power the owner's rule gives that person, and the provenance shows what was
published. A leaked credential of a writer not on the list
cannot push a `v*` tag or enter the environment. A leaked npm session of a
package maintainer can still publish by hand with 2FA; that is outside CI
and outside this RFC.

**The first publish (one-time bootstrap).** Because a trusted publisher
needs an existing package, the owner publishes a **placeholder `0.0.0`** by
hand once, from an empty directory (not from the repository, so no local
`dist/` can leak): a `package.json` with the name, version `0.0.0`,
`"license": "MIT"`, the `repository` field, no `bin`, and a README line
"placeholder; the first release is 0.1.0". It is deprecated at once. Then
the trusted publisher is configured, and 0.1.0 is the first **release**,
from CI, within 2 days of configuring the publisher. Decision 5 is read as
"the first release is 0.1.0"; the placeholder is not a release. The owner
approves that reading with this RFC.

## Consequences

- No npm token exists to rotate, store or leak; the release survives npm's
  January 2027 removal of direct token publishing.
- Who may publish is one GitHub setting (the ruleset's bypass list), in line
  with the owner's rule; no reviewer has to be online to release.
- `@zanichelli/freshdesk-mcp@0.0.0` stays on npm, deprecated. Unpublishing
  every version blocks any new publish of the package for 24 hours (npm
  unpublish policy), which is not worth it.
- SPEC §11 said "the first publish is 0.1.0". With the owner's approval
  (2026-11-25) it reads "the first release is 0.1.0; a deprecated 0.0.0
  placeholder precedes it (RFC 2026-11-25)".
- Setting up depends on the owner, by hand, in an order (below). npm does
  not validate a trusted publisher when it is saved: a typo shows only as a
  failed publish.
- `package.json` needs `repository.url`
  (`https://github.com/ZanichelliEditore/freshdesk-mcp`), `"license": "MIT"`
  (owner, 2026-11-25) and a root `LICENSE` file, copyright holder
  "Zanichelli Editore S.p.A." (owner, 2026-11-25), before 0.1.0. T-045 adds
  all three (orchestrator, 2026-11-25).
- The rulesets and the environment are GitHub settings, not code: no
  test in the repository can prove them. T-045 tests the workflow side
  (`environment: npm`, no secret); the owner confirms the settings.
- `quality.yml` pins actions by tag (`@v6`), not by SHA. Out of scope here;
  T-045's SHA rule covers `release.yml` only.

### Owner's manual steps, in order

0. Before anything else: confirm the repository is public (provenance and
   trusted publishing need it; the public API showed `public` on 2026-11-25).
1. Before T-045's first tag: GitHub, repository settings. Create
   environment `npm`: no reviewers, no secrets, "Selected branches and
   tags", add tag rule `v*`.
2. Same time: a tag ruleset, target `v*`, rules "Restrict creations",
   "Restrict updates", "Restrict deletions", bypass list = who may release.
   And a branch ruleset, target `main`: "Require a pull request before
   merging" and "Require status checks to pass" with the `quality` job's
   checks (the matrix makes them `quality (22.19)` and `quality (24)`),
   bypass list = the same people as the tag ruleset.
3. After T-045 is merged, on the go for 0.1.0: from an empty directory,
   `npm publish --access public` the placeholder `0.0.0`, then
   `npm deprecate @zanichelli/freshdesk-mcp@0.0.0 "placeholder"` (both with 2FA, as an `@zanichelli` member who can publish).
4. npmjs.com, package settings, Trusted publishing: GitHub Actions,
   `ZanichelliEditore` / `freshdesk-mcp` / `release.yml` / environment `npm`.
5. Within 2 days of step 4: push tag `v0.1.0` on the `main` commit whose
   `package.json` says `0.1.0`. Check the release run and the provenance
   badge on npmjs.com.
6. After step 5 succeeds: package settings, Publishing access, "Require
   two-factor authentication and disallow tokens".

## Alternatives considered

- **GitHub environment with a required reviewer and an npm token as an
  environment secret.** Who triggers: anyone who can push a `v*` tag, then
  the reviewer approves. A leaked token publishes any version, from
  anywhere, without provenance or CI, until it expires (granular write
  tokens: 90 days at most) or is revoked. Rejected: a long-lived secret the
  chosen option does not need; a second human approval the owner's rule
  does not ask for; and npm plans to remove direct token publishing in
  January 2027, so it would stop working within weeks.
- **Trusted publishing without an environment.** Simpler by one setting, but
  npm checks only the workflow file name, so a writer can publish from a
  branch copy of `release.yml`, around the tag ruleset. Rejected: the
  environment costs one setting and closes it.
- **Staged publishing (`npm stage publish`, then a maintainer's 2FA
  approval).** A new package can be created by staging only with a local
  session or a granular (stage-only) token, not OIDC; and staging a new
  package publishes a public `0.0.0-stage` placeholder, so it does not avoid
  a placeholder either. The deciding reason: it adds a human approval to
  every release, which the owner's rule does not ask for. It stays available
  if the owner later wants a second person on each release.
- **The owner publishes 0.1.0 by hand, then CI from 0.1.1.** Rejected:
  breaks decision 3 for the first release and risks a stale local `dist/`.
- **A one-time token secret for 0.1.0 only, then trusted publishing.**
  It avoids the placeholder, and nothing else. Rejected: two workflow
  states and a secret in the repository for a window, to avoid one
  deprecated `0.0.0`.

## Sources (read 2026-11-25)

- <https://docs.npmjs.com/trusted-publishers>
- <https://docs.npmjs.com/cli/v11/commands/npm-trust>
- <https://docs.npmjs.com/generating-provenance-statements>
- <https://docs.npmjs.com/staged-publishing>
- <https://github.blog/changelog/2026-10-02-npm-staged-publishing-now-supports-creating-new-packages>
- <https://github.blog/changelog/2026-07-31-restricting-npm-bypass-2fa-granular-access-tokens>
- <https://github.blog/changelog/2025-11-05-npm-security-update-classic-token-creation-disabled-and-granular-token-changes/>
- <https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments>
- <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets>
- <https://docs.npmjs.com/policies/unpublish>
- <https://nodejs.org/dist/index.json> (Node 24.22.3 bundles npm 11.19.1)
- `https://api.github.com/repos/ZanichelliEditore/freshdesk-mcp` and its
  `branches/main` and `rules/branches/main` (visibility, protection)

## Review

`rfc-reviewer` on the draft (2026-11-25): decision sound; 1 High, 3 Medium,
2 Low, all text. Resolutions:

1. High: T-045's Gates and In scope still offered a token or a reviewer.
   Resolved: rewritten to this RFC (`environment: npm`, no secret; the
   owner's steps 0-2 before the first tag, 3-6 on the go); T-045 also adds
   `repository.url`, `"license": "MIT"` and `LICENSE` (scope, files and
   acceptance, task file and PLAN row); the license line here closed with
   the owner's MIT decision of 2026-11-25.
2. Medium: SPEC §11 says "first publish is 0.1.0". Resolved: the amendment
   is stated under Consequences, made on the owner's word with the flip to
   Active; `SPEC.md` added to T-048's files expected.
3. Medium: `actions/setup-python` was not pinned. Resolved: pinned above,
   with the consequence that `release.yml` copies the quality jobs.
4. Medium: the RFC claimed the `main` check means what is published went
   through `main`. Resolved: corrected under "Who can trigger"; `main`
   protection stated as read.
5. Low: staged publishing claimed an OIDC bootstrap. Resolved: OIDC
   dropped; the placeholder is shared, the deciding reason is the approval
   on every release.
6. Low: no step confirms the repository is public; the 24-hour claim had no
   source. Resolved: step 0 added; npm unpublish policy cited.
