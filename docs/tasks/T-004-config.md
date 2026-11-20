# T-004 — Config: env + team config (zod)

- **Type:** build
- **Phase:** M0
- **Status:** todo
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
Commits and tests, not narration.

## Dead ends
none

## Open doubts
none

## Context pressure
low | ok | tight | overflowed — and, if tight or overflowed, how it should
have been split.

## Next action
Only if the status is still `doing`: the exact first step for the next
session.
