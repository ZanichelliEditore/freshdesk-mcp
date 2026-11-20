# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-20T11:18:25+01:00`
- **Describes commit:** `<filled by stamp>`, pushed to
  `ZanichelliEditore/freshdesk-mcp` (public). **CI:** `<filled by stamp>`.
  Earlier: run on `80c7aae` green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/44716765351;
  first run on `27a7f16` red (unpinned ruff 0.17.6 rules; `gitleaks-action`
  needs a license key on org repos), fixed in `80c7aae`, gitleaks step
  replaced by the same CLI history scan as `make gitleaks`, not weakened.

- **Current task:** T-001 connect the remote, `done (2026-11-20)`.
  History rewritten (all hashes before `27a7f16` changed); account values
  in gitignored `docs/private/`. Dependabot alerts and security updates on.
  Scrub check: `git grep -iEf docs/private/account-patterns
  $(git rev-list --all)` pre-scrub exit 0 (121 lines), after exit 1, fresh
  GitHub clone exit 1. See `docs/tasks/T-001-connect-remote.md` "Done".

- **Next action:** `/pickup` takes T-002 (RFC: runtime and test stack, no
  dependencies): `docs/tasks/T-002-rfc-runtime-stack.md`. T-003 waits on it.

- **Read before anything else:** `docs/tasks/PLAN.md`; the T-002 task file.
  Owner decisions still open, recorded in their tasks: `tsconfig` NodeNext
  + emit (T-003), Node 20+24 CI matrix (T-003).

- **Reviews:** one full round, R1 = `80c7aae`, range `59e3395..80c7aae`.
  code-reviewer: no blockers; Medium "acceptance evidence not recorded"
  resolved by this HANDOFF and the task file; Low ruff-pin drift parked;
  Info stale `gitleaks-action` docs: grep found none. security-reviewer:
  gitleaks step stronger, HEAD free of account values, `docs/private/`
  ignored; Medium "nothing stops values re-entering" → proposed T-012;
  Low hash pinning and Info scan defined in `.pre-commit-config.yaml`
  parked; asked fresh-clone check: done, exit 1. compliance-reviewer:
  Wireframes `none`, nothing to check. All quotes matched. Parked:
  `docs/improvements.md` entry stamped `80c7aae`. No scoped round (no
  mechanism changed by fixes).

- **Proposed plan changes:** T-012 "Guard: account-value patterns in the
  commit hook" (`proposed (2026-11-20)` in PLAN), owner to confirm.

- **Open doubts:**
  - CI gitleaks step not shown to fail on a planted secret.
  - Hashes quoted in docs up to `59e3395` predate the rewrite and no
    longer resolve (`docs/improvements.md`, `docs/journal.md`).
  - Pre-scrub backup bundle in the session scratchpad still holds the
    values; owner deletes it.
  - Host override exact hostname in personal env (T-004, T-006), still to
    confirm.

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `80c7aae`: eslint and ruff "All
  checks passed!"; prettier "All matched files use Prettier code style!";
  ruff "6 files already formatted"; tsc "no TypeScript yet";
  `tools/checks` "Ran 25 tests", OK; both gitleaks scans passed.
