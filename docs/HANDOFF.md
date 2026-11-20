# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-20T10:19:25+01:00`
- **Describes commit:** `bb5b570`, local only: no remote yet (T-001).
  **CI:** unobserved (no remote; `quality.yml` has never run). This file
  arrives in the commit right after `bb5b570`.

- **Current task:** none. Bootstrap (2026-11-20): scaffold (node, claude),
  faigo kit (core + advisor, stack none, safety core none, `git_host:
  github`), design doc moved to `SPEC.md` with §13-§14.1, onboarding
  closed. Commits `29e8a85`, `4b4dc87`, `bb5b570`.

- **Next action:** owner reviews `SPEC.md`; then `/pickup` and
  `/decompose` on M0 (SPEC §13).

- **Read before anything else:** SPEC §9 (which kit rules are kept), §13,
  §14. Rule 3 of `AGENTS.md`: the runtime and dev dependencies SPEC §11
  names (MCP SDK, zod, vitest, undici) are not in `package.json` yet and
  go through `/rfc`.

- **Reviews:** none: bootstrap, generated files plus docs only.

- **Proposed plan changes:** T-001 Connect the remote (GitHub),
  `proposed (2026-11-20)`.

- **Open doubts:**
  - SPEC names the owner, this account's custom fields, its rate limit and
    the allow-list domain. Fine while private; T-001's acceptance asks for
    a pass before any public push (SPEC §14 rule 2).
  - M0's "repo, CI" overlaps T-001; `/decompose` decides whether T-001
    becomes M0's first row.

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `bb5b570`'s tree: eslint and
  ruff "All checks passed!"; prettier "All matched files use Prettier code
  style!"; ruff "6 files already formatted"; tsc "no TypeScript yet";
  `tools/checks` "Ran 25 tests", OK; both gitleaks scans passed.
