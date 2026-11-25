# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-25T09:27:48+01:00`
- **Describes commit:** `d1c7efe`
  (`d1c7efe4175b3535eedb1f0bc28bc6a0cb26d0a6`), pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45576596660
  (workflow `quality`, ran on `d1c7efe`; observed through the public API).
  This file's hash and CI line arrive in the commit right after it.

- **Current task:** T-048 `done (2026-11-25)` (plan), RFC release on npm,
  `docs/rfc/active/2026-11-25-release-on-npm.md`, Status Active (owner,
  2026-11-25). Commits `fda62ac` (status), `ed35b74` (RFC proposed),
  `415abb1` (rfc-reviewer fixes), `7150965` (RFC active, SPEC §11, T-045
  amended, done). Built by a builder agent under the orchestrator.
  - **Decision:** npm trusted publishing over OIDC, no npm token stored;
    GitHub environment `npm` admits `v*` tags only; a `v*` tag ruleset's
    bypass list is who can publish (owner's rule, 2026-11-25: whoever may
    run the publish pipeline may publish). A deprecated `0.0.0` placeholder
    is published by hand once (npm needs the package to exist); 0.1.0 is
    the first release, from CI.
  - **Owner's answers (2026-11-25):** RFC approved; license MIT, holder
    "Zanichelli Editore S.p.A."; a `main` branch ruleset (pull request and
    `quality (22.19)`, `quality (24)` green) added to the owner's steps.
  - **Fact (public API, 2026-11-25):** `main` is not protected today; the
    repository is public.

- **Next action:** `/pickup`. By PLAN's rule it takes **T-045** (release
  workflow, `LICENSE`, `repository.url`, `"license": "MIT"`, `private:
  true` removed, `workflow_dispatch` dry run observed green).
  - **The owner, before the first tag:** RFC manual steps 0–2
    (environment `npm`, `v*` tag ruleset, `main` ruleset). If the `main`
    ruleset requires a pull request, its bypass list must hold the
    maintainers (same as the tag ruleset), or the orchestrator's direct
    pushes to `main` stop; owner to say which.
  - **The owner, on the go for 0.1.0:** RFC steps 3–6 (placeholder, npm
    trusted publisher, tag `v0.1.0` within 2 days, disallow tokens).

- **Read before anything else:** PLAN row T-045 and its task file; the
  RFC's Decision and manual steps.

- **Reviews:** plan task: `rfc-reviewer` on `ed35b74`: decision sound; 1
  High (T-045 Gates/In scope still named a token), 3 Medium (SPEC §11
  "first publish 0.1.0"; `actions/setup-python` unpinned; overclaim that
  published code went through `main`), 2 Low; all fixed in `415abb1`,
  recorded in the RFC's "Review" section. code/security/compliance
  reviewers not run: no code in the range (docs, SPEC, PLAN only).

- **Proposed plan changes:** none new. T-057, T-058 after T-045 and the
  first publish. Still `proposed`: T-041, T-052, T-049.

- **Open doubts (owner):**
  - **T-048:** the GitHub/npm settings cannot be tested in the repo;
    `release.yml` copies the quality jobs and can drift from
    `quality.yml`; the trusted-publisher setup expires after 2 days
    without a publish.
  - **Earlier:** see HANDOFF at `fe81a3c`, `f1dde79`, `41de8bc`.

- **Dead ends:** trusted publishing cannot be configured for a package
  that does not exist yet (`npm trust`: "Package must exist").

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (local Node v26.13.1), run by the
  orchestrator on `7150965`:
  - vitest "Test Files 39 passed (39)", "Tests 2528 passed (2528)";
  - `tools/checks` "Ran 54 tests", OK;
  - lint, format, typecheck, build and both gitleaks scans passed.
