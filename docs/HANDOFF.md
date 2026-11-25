# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-25T12:02:50+01:00`
- **Describes commit:** `788a0e9`
  (`788a0e967a8935fc35a89c0c009d53387de072a5`), pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45600778805
  (workflow `quality`, ran on `788a0e9`; observed through the public API).
  This file's hash and CI line arrive in the commit right after it.

- **Current task:** T-059 `done (2026-11-25)`, a late request with no
  time left to retry is a cut, `docs/tasks/T-059-late-attempt-cut.md`
  ("Done"). Commits `b599dd2` (task, status), `68453a8` (the client marks
  a GET's late `network` failure; `isCut` asks `http.reachedDeadline`),
  `c4d8548` (only a GET's expiry is marked), `b84dd3e` (lists B parked,
  done), `d528723` (`CHANGELOG.md` 0.1.0 dated; CI green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45596975181).
  Owner's go: 2026-11-25.
  - Earlier today: CI red on `91b6eec` fixed in `1d51e20` (15 timing
    tests deterministic); T-058 done (HANDOFF at `91b6eec`).

- **Release state (2026-11-25):**
  - Step 0: repository public. Steps 1–2 done by the orchestrator with
    `gh` (owner's go, owner is admin): environment `npm` (custom policy,
    only `tag:v*`), ruleset `release tags` (id 28066875: restrict
    create/update/delete of `refs/tags/v*`), ruleset `main` (id 28066876:
    pull request + `quality (22.19)`, `quality (24)`); both bypass:
    repository admins, always.
  - Step 3 done by the owner: `0.0.0` published by hand; npm also created
    `0.0.0-stage` (it is `latest`); both deprecated ("Placeholder, not a
    release. Use 0.1.0 or later.").
  - Step 4 done by the owner: npm trusted publisher (GitHub Actions,
    `ZanichelliEditore` / `freshdesk-mcp` / `release.yml` / `npm`,
    publish action only). The 2-day window runs from 2026-11-25.

- **Released (2026-11-25):** `@zanichelli/freshdesk-mcp@0.1.0` on public
  npm, `latest`. Tag `v0.1.0` on `63cebb9`, pushed by the orchestrator on
  the owner's explicit go. Release run:
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45599837663
  (quality x2, gitleaks, build, publish success; dry-run skipped).
  Provenance signed from GitHub Actions, transparency log
  https://search.sigstore.dev/?logIndex=4100091271. Checked:
  `npm view` latest `0.1.0`, license MIT, bin `freshdesk-mcp`;
  `npx -y @zanichelli/freshdesk-mcp@0.1.0 --version` prints `0.1.0`.

- **Next action:**
  - **The owner:** RFC step 6, npm package settings, Publishing access,
    "Require two-factor authentication and disallow tokens".
  - Then `/pickup` by PLAN's rule (still `proposed`: T-041, T-052,
    T-049; M2 gates T-040, T-014). README examples still run unpinned
    (`docs/improvements.md` entry `03561f8`).

- **Read before anything else:**
  `docs/rfc/active/2026-11-25-release-on-npm.md` steps 5–6.

- **Reviews (T-059):**
  - **Full round** on `9f7c032..68453a8`, R1 = `68453a8`. The four quotes
    matched for all three. compliance: Wireframes `none`. security: no
    fail-open; 1 Low (a write's expiry was marked), 1 info. code-reviewer:
    clean against the acceptance; 2 Low (the same; a write test that could
    barely fail); one Bash call, against rule 8. Fixed in `c4d8548`.
  - **Scoped round** on `68453a8..c4d8548`. The four quotes matched for
    all three; list A empty for all three. Lists B parked, entry
    `c4d8548`.

- **Proposed plan changes:** none new.

- **Open doubts (owner):** see the T-057, T-058, T-059 task files.

- **Dead ends:** see the T-059 task file.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (local Node v26.13.1), run by the
  orchestrator on `b84dd3e`:
  - vitest "Test Files 39 passed (39)", "Tests 2604 passed (2604)";
  - `tools/checks` "Ran 87 tests", OK;
  - lint, format, typecheck, build and both gitleaks scans passed.
