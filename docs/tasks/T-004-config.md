# T-004 — Config: env + team config (zod)

- **Type:** build
- **Phase:** M0
- **Status:** done (2026-11-23)
- **Depends on:** T-003
- **Created:** 2026-11-20

## Goal
`src/config.ts` loads personal settings from env and an optional team config file, validated with zod, with clear errors and the documented defaults.

## In scope
- Env (personal): `FRESHDESK_DOMAIN`, `FRESHDESK_API_KEY`, `FRESHDESK_MCP_CONFIG` (path), and the custom-domain override as an **exact hostname** (personal, not team: a shared team file must not be able to point everyone's key at another host).
- Team config: enabled toolsets, field meanings, hidden fields, uncategorised definition, forward allow-list, caps, reserve %, pacing, export dir.
- Defaults: reserve 20 % / floor 5 %, pacing 2 req/s, bulk cap 50, schema TTL 1 h.
- Config checks presence and types only; the host rule belongs to http (T-006), which checks it at construction and per request.
- Install `zod` (per T-002).
- Ship `examples/team-config.example.json` with **synthetic** values only (invented field names, `example.com` addresses).

## Out of scope
- Host regex (T-006).
- Reading config in http/limiter (they take options).

## Spec sections to read
- SPEC.md §10
- SPEC.md §7.2
- SPEC.md §9

## Files expected to change
- `src/config.ts`, `test/config.test.ts`
- `examples/team-config.example.json`
- `package.json`, `package-lock.json`

## Wireframes
`none`

## Acceptance
`test/config.test.ts`: missing domain or key rejected; bad JSON and unknown key each give an error naming the file and the path; no error message contains the API key value; defaults applied; override accepts one hostname, not a boolean; example file parses; `make quality` green.

---
*Filled at `/handoff`:*

## Done
- `3394b0e`: `src/config.ts` (`loadConfig(env)`, `ConfigError`, `TeamConfig`),
  `test/config.test.ts`, `examples/team-config.example.json`, `zod ^4.2`.
- `1e95850`: full-round review fixes (API key text replaced in team-config
  errors; override's last label must start with a letter; read failure
  carries Node's error code; `docs/architecture/overview.md` lists the module).
- Acceptance, each in `test/config.test.ts`:
  - missing domain or key: `personal settings (env)` → `rejects %s = %j, naming the variable`;
  - bad JSON, unknown key: `team config: errors name the file and the path` (15-row table + `bad JSON names the file and quotes none of it`);
  - no key in a message: `no error message contains the API key` (12 rows);
  - defaults: `team config: defaults`;
  - override: `custom-domain override: one exact hostname` (3 accepted, 23 refused, boundaries);
  - example: `examples/team-config.example.json` → `parses, and sets every team key`.
- `make quality` exit 0: vitest 144 tests in 4 files. `make build` emits `dist/config.js`.
- Chosen here (not fixed by SPEC): env name `FRESHDESK_HOST_OVERRIDE`; team
  keys `toolsets`, `fields.<label or API name>.{meaning,hidden}`,
  `uncategorised_fields`, `forward_allow_list`, `limits.{reserve_pct,floor_pct,pacing_rps,bulk_cap,schema_ttl_s}`,
  `export_dir`.

## Dead ends
- A realistic-looking synthetic key in the test (`synthetic-key-0123…`) was
  refused by gitleaks' `generic-api-key` rule at commit. Use a low-entropy
  value (`test-test-test-test`); nothing was a real secret.

## Open doubts
- "In scope" says config checks presence and types only and the host regex
  is T-006's. The acceptance line ("one hostname, not a boolean") needed a
  shape check, so `isHostname` exists here (lower-case dotted name, last
  label starts with a letter). T-006 still owns which host the key may go to.
- SPEC §8.1 says toolsets come from `FRESHDESK_TOOLSETS`; §10 and this task
  say team config. Built: team config only. SPEC §10 and §7.1 do not name
  `FRESHDESK_HOST_OVERRIDE`, floor, pacing or schema TTL. SPEC not edited:
  owner's call.
- The team key names and shape above are this task's choice; the owner has
  not seen them.
- `floor_pct` above `reserve_pct` is accepted here; T-005's limiter should
  refuse it (it takes options).
- No key for §7.2's per-call budget ("caps", plural): left for the task that
  builds the first multi-call operation.
- No team file means no hidden fields (inherent in SPEC §10's two levels);
  the docs should say so.
- `Prodotto` (from SPEC §7.3's example) and `acme.freshdesk.com` appear in
  tests; the security-reviewer asked the owner to check the first against
  the patterns file. The second is never contacted.

## Context pressure
low
