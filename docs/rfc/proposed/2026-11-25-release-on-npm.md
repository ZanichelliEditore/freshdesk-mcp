# Release on npm: how a publish is authorised

- **Status:** Proposed
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
  and the maintain role, or a release team; the owner chooses).
- **Workflow (T-045).** The publish job declares `environment: npm` and
  `permissions: id-token: write`, runs on `ubuntu-latest`, uses Node
  `24.22.3` (bundled npm 11.19.1), and references no secret. It publishes
  the `dist/` built from a fresh checkout by the chain it `needs`, never a
  local tree (the stale-`dist/` park, `docs/improvements.md`, entry
  82ab7a6). It keeps `--provenance --access public`.
- **Pins.** Every `uses:` by commit SHA (read 2026-11-25 with
  `git ls-remote`; both are lightweight tags, so the SHA is the commit):
  - `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` (v7.0.1,
    released 2026-07-20)
  - `actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1` (v7.1.0,
    released 2026-10-08)

  T-045 rechecks these against the current releases when it writes the
  workflow, and adds any other action only with its SHA.

**Who can trigger a publish:** whoever can create a `v*` tag under the
ruleset (its bypass list), plus repository admins, who can change the
ruleset and the environment. That set is "the users allowed to run the
pipeline". The tag must also point at a commit on `origin/main` and match
`package.json` (T-045's checks), so what is published went through `main`.

**What a leaked credential allows:** there is no stored npm credential to
leak. The OIDC token lives for minutes, inside one job, and npm accepts it
only for this package from this workflow in this environment. A leaked
GitHub credential of someone on the bypass list can push a tag, which
publishes a commit already on `main`; that is the same power the owner's
rule gives that person. A leaked credential of a writer not on the list
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
  it would block the name for 24 hours and is not worth it.
- Setting up depends on the owner, by hand, in an order (below). npm does
  not validate a trusted publisher when it is saved: a typo shows only as a
  failed publish.
- `package.json` needs `repository.url`
  (`https://github.com/ZanichelliEditore/freshdesk-mcp`), `"license": "MIT"`
  and a `LICENSE` file before 0.1.0. T-045 removes `private: true` and is the
  natural place for them; T-045's scope does not list them today (owner to
  confirm).
- The tag ruleset and the environment are GitHub settings, not code: no
  test in the repository can prove them. T-045 tests the workflow side
  (`environment: npm`, no secret); the owner confirms the settings.
- `quality.yml` pins actions by tag (`@v6`), not by SHA. Out of scope here;
  T-045's SHA rule covers `release.yml` only.

### Owner's manual steps, in order

1. Before T-045's first tag: GitHub, repository settings. Create
   environment `npm`: no reviewers, no secrets, "Selected branches and
   tags", add tag rule `v*`.
2. Same time: a tag ruleset, target `v*`, rules "Restrict creations",
   "Restrict updates", "Restrict deletions", bypass list = who may release.
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
- **Staged publishing (stage-only token or OIDC `npm stage publish`, then a
  maintainer's 2FA approval).** It can create a new package from CI, so 0.1.0
  would be the very first upload (npm still publishes a public
  `0.0.0-stage` placeholder). Rejected for now: it puts a token in the
  workflow for the bootstrap and adds a human approval to every release,
  which the owner's rule does not ask for. It stays available if the owner
  later wants a second person on each release.
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
- <https://nodejs.org/dist/index.json> (Node 24.22.3 bundles npm 11.19.1)
