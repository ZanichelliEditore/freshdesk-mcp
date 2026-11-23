# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-23T09:30:54+01:00`
- **Describes commit:** `<hash>`, pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** `<pending>`. This file arrives
  in the commit right after it.

- **Current task:** T-002 RFC: adopt the runtime and test stack,
  `done (2026-11-23)`. RFC
  `docs/rfc/active/2026-11-23-adopt-runtime-stack.md` (Active): Node ≥
  22.19; `zod ^4.2`, `undici ^8`, `@modelcontextprotocol/server ^2`,
  `vitest ^5`, `@types/node ^22`. See `docs/tasks/T-002-rfc-runtime-stack.md`
  "Done".

- **Next action:** `/pickup` takes T-003 (TypeScript toolchain + client
  error model): `docs/tasks/T-003-ts-toolchain-errors.md`. Its in-scope now
  carries the RFC's eslint rules (rule 3-4) and the `FRESHDESK_*` env
  overwrite in the vitest setup file.

- **Read before anything else:** `docs/tasks/PLAN.md`; the T-003 task file;
  the RFC's "Rule for `http.ts`" (rules 1-5). Owner decisions still open in
  T-003: `tsconfig` NodeNext + emit; CI matrix `22.19` + `24` or Node 24
  only (the old "Node 20 + 24" is void: floor is 22.19).

- **Reviews:** `rfc-reviewer` round 1 (8 findings) and round 2 scoped (3,
  mechanism changes, owner-approved), all recorded in the RFC "Review".
  `/handoff` full round, R1 = `2fd2230`, range `7ad29f2..2fd2230`, all four
  quotes matched for all three:
  code-reviewer: 3 Medium (Agent built in `server.ts` which tests import;
  backstop overclaimed; 3xx code unnamed), 2 Low (setup file trips own
  lint; `global.fetch`): all fixed in the RFC. security-reviewer: Medium
  name-based test lint dodgeable + real key in test env → import-path ban
  and env overwrite (owner approved applying without another round,
  2026-11-23); Low 3xx untested, `npm ci` fallback, transitive deps, TLS
  lint: 3xx acceptance and TLS lint parked in `docs/improvements.md`,
  transitive deps and `npm ci` stated in the RFC. compliance-reviewer:
  Wireframes `none`, nothing to check. No scoped round: owner's call.

- **Proposed plan changes:** T-012 still `proposed (2026-11-20)`, owner to
  confirm. None new.

- **Open doubts:**
  - RFC rule 4 lint is specified, not yet shown to refuse a planted
    `import 'undici'` in `test/` (first chance: T-003).
  - CI gitleaks step not shown to fail on a planted secret (from T-001).
  - Hashes quoted in docs up to `59e3395` predate the history rewrite.
  - Pre-scrub backup bundle (T-001) still holds account values; owner
    deletes it.
  - Host override exact hostname in personal env (T-004, T-006).

- **Dead ends:** Node ≥ 20 with `undici@7`/`vitest@4`: works, rejected by
  owner (RFC Alternatives).

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `2fd2230` (Node 22.23.5): eslint
  and ruff "All checks passed!"; prettier "All matched files use Prettier
  code style!"; ruff "6 files already formatted"; tsc "no TypeScript yet";
  `tools/checks` "Ran 25 tests", OK; both gitleaks scans passed. Local Node
  default is now 22.23.5 (nvm); open a new shell.
