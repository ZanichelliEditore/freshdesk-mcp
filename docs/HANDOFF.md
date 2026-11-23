# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-23T10:12:52+01:00`
- **Describes commit:** `<hash>`, pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** `<pending stamp>`. This file
  arrives in the commit right after it.

- **Current task:** T-004 Config: env + team config (zod),
  `done (2026-11-23)`. Code in `3394b0e` and `1e95850`; see
  `docs/tasks/T-004-config.md` "Done".

- **Next action:** `/pickup` takes T-005 (rate limiter, standalone):
  `docs/tasks/T-005-rate-limiter.md`. It takes options, not `Config`; the
  defaults it must agree with are `limits` in `src/config.ts`.

- **Read before anything else:** `docs/tasks/PLAN.md`; the T-005 task
  file; `src/config.ts` (the `limits` block only: `reserve_pct`,
  `floor_pct`, `pacing_rps`).

- **Reviews:** full round, range `019bf4f..3394b0e`, R1 = `3394b0e`; all
  four quotes matched for all three.
  code-reviewer: 2 Medium (the API key could appear in an error through
  the config path or a key name; the "file holding a string" test hit the
  bad-JSON branch), 6 Low: fixed in `1e95850` (both Mediums, stale
  architecture overview, header comment, hex-IPv4 override, read-error
  code), the rest are open doubts (SPEC out of sync, floor above reserve,
  per-call budget key).
  security-reviewer: no High; 1 Medium (the same key-in-path leak, fixed),
  6 Low: hex-IPv4 fixed; key names uncapped and unescaped, no file-type
  or size check, unconstrained `export_dir`/`limits`/allow-list values,
  enumerable `apiKey` parked (`docs/improvements.md`, entry stamped
  `3394b0e`); "no team file, no hidden fields" is an open doubt.
  Dismissed: `acme.freshdesk.com` in tests (never contacted).
  compliance-reviewer: Wireframes `none`, nothing to check.
  Scoped round, range `3394b0e..1e95850`, quotes matched for all three:
  code-reviewer and security-reviewer both report nothing that falsifies
  the acceptance or opens a fail-open path; their lists are parked in
  `docs/improvements.md` (entry stamped `1e95850`). compliance-reviewer:
  `none`, nothing to check. No third round. No reviewer shelled out.

- **Proposed plan changes:** T-012 still `proposed (2026-11-20)`, owner to
  confirm. None new.

- **Open doubts:**
  - New, from T-004 (detail in the task file's "Open doubts"): the team
    config's key names and `FRESHDESK_HOST_OVERRIDE` are the builder's
    choice, not yet the owner's; SPEC §8.1 (`FRESHDESK_TOOLSETS`), §10 and
    §7.1 are out of sync with what was built, SPEC not edited; config has
    a hostname shape check although the task said "types only"; `floor_pct`
    above `reserve_pct` is accepted (T-005 should refuse it); no key for
    §7.2's per-call budget; owner to check `Prodotto` (from SPEC §7.3)
    against the patterns file.
  - Two `RFC-Not-Needed:` waivers this session: zod (`3394b0e`) and a
    one-line `docs/architecture/overview.md` listing (`1e95850`).
  - Fallback error codes are T-003's choice, not yet the owner's.
  - The test network ban has known holes: parked.
  - The Claude Code tool shell still runs Node 22.18.0, below the floor;
    this session prefixed PATH with nvm's `v22.23.5`.
  - `make quality` does not run `make build`; CI does.
  - CI gitleaks step not shown to fail on a planted secret (from T-001).
  - Hashes quoted in docs up to `59e3395` predate the history rewrite.
  - Pre-scrub backup bundle (T-001) still holds account values; owner
    deletes it.
  - Two Dependabot branches on the remote (npm, GitHub Actions), not
    reviewed.

- **Dead ends:** a high-entropy synthetic key in `test/config.test.ts` was
  refused by gitleaks at commit; replaced with a repetitive value.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on the tree of the described commit
  (Node 22.23.5): eslint and ruff "All checks passed!"; prettier "All
  matched files use Prettier code style!"; ruff "6 files already
  formatted"; `tsc --noEmit` clean; vitest "Test Files 4 passed (4)",
  "Tests 144 passed (144)"; `tools/checks` "Ran 25 tests", OK; both gitleaks
  scans passed.
