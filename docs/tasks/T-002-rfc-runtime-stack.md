# T-002 — RFC: adopt the runtime and test stack

- **Type:** plan
- **Phase:** M0
- **Status:** todo
- **Depends on:** none
- **Created:** 2026-11-20

## Goal
An Active RFC that admits the dependencies M0 and M1 need: `zod`, `undici`, `vitest`, `@types/node` for M0, and `@modelcontextprotocol/sdk` for M1, with pinned major versions.

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
