# T-002 — RFC: adopt the runtime and test stack

- **Type:** plan
- **Phase:** M0
- **Status:** done (2026-11-23)
- **Depends on:** none
- **Created:** 2026-11-20

## Goal
An Active RFC that admits the dependencies M0 and M1 need: `zod`, `undici`, `vitest`, `@types/node` for M0, and `@modelcontextprotocol/sdk` for M1, with pinned major versions. *(2026-11-23: the RFC admits `@modelcontextprotocol/server` v2 instead, per SPEC §5; see its Alternatives.)*

## In scope
- Draft with `/rfc`; alternatives weighed (Node global `fetch` vs undici's `fetch`, `node:test` vs vitest, valibot vs zod).
- Global `fetch` vs undici's: answer with evidence, e.g. a minimal MockAgent check made while drafting (does `setGlobalDispatcher(new MockAgent())` intercept Node's bundled `fetch` with the installed undici version?). The RFC records the result and the rule `http.ts` follows.
- Versions must pass `npm audit --audit-level=high` (CI runs it).
- Each package is installed by the task that first uses it, not by this one.
- Says explicitly what it does **not** cover: `@anthropic-ai/mcpb`, release tooling (M4, their own RFC).
- Run `rfc-reviewer`, resolve findings, flip to Active, `make rfc-sync`.

## Out of scope
- Installing any package in `package.json`.
- Build/emit settings (T-003).

## Spec sections to read
- SPEC.md §7.1
- SPEC.md §11
- SPEC.md §12

## Files expected to change
- `docs/rfc/active/2026-11-NN-adopt-runtime-stack.md`
- `docs/architecture/` (if the RFC changes it)

## Wireframes
`none`

## Acceptance
RFC file is in `docs/rfc/active/` after `make rfc-sync`, status Active, names the five packages and what it excludes, records the MockAgent/global-`fetch` evidence, `rfc-reviewer` findings resolved or dismissed in the RFC; `make quality` green.

---
*Filled at `/handoff`:*

## Done
- `c1ff7fb` start; `2fd2230` RFC `docs/rfc/active/2026-11-23-adopt-runtime-stack.md`
  Active after `make rfc-sync` (five packages, exclusions, MockAgent
  evidence Checks A/B with scripts in its appendix, re-run verbatim on Node
  22.19.0 and 24.22.3); SPEC §5/§11, T-003, T-006, architecture overview
  aligned. The handoff commit (`T-002: done; ...`) applies the `/handoff`
  review fixes to rules 1-5 and parks two items.
- Reviews recorded in the RFC's "Review" section: `rfc-reviewer` round 1
  (8 findings), round 2 scoped (3, owner-approved), `/handoff` round (code,
  security, compliance; rule 4 change owner-approved).
- Owner decisions 2026-11-23: Node ≥ 22.19; `@modelcontextprotocol/server`
  v2 over `sdk` v1; `redirect: 'manual'`; flip without a third round.
- `make quality`: 25 tests OK, both gitleaks scans passed. No tests added:
  plan task, no code.

## Dead ends
- Keeping Node ≥ 20 with `undici@7`/`vitest@4`: works (Check A on 20.19.4),
  rejected by the owner; recorded in the RFC's Alternatives.

## Open doubts
- The test-isolation lint (RFC rule 4) is specified, not yet run: T-003 is
  the first chance to see it refuse a planted `import 'undici'` in `test/`.
- T-003/T-006 acceptance lines do not yet test a 3xx (parked in
  `docs/improvements.md`); `/decompose` decides.

## Context pressure
ok

## Next action
none (done).
