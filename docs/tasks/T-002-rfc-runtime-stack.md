# T-002 — RFC: adopt the runtime and test stack

- **Type:** plan
- **Phase:** M0
- **Status:** todo
- **Depends on:** none
- **Created:** 2026-11-20

## Goal
An Active RFC that admits the dependencies SPEC §11 names: `zod`, `undici`, `vitest` for M0, and `@modelcontextprotocol/sdk` for M1, with pinned major versions.

## In scope
- Draft with `/rfc`; alternatives weighed (Node global `fetch` vs undici, `node:test` vs vitest, valibot vs zod).
- Require `http.ts` to import `fetch` from `undici` (MockAgent intercepts only undici's own dispatcher).
- Versions must pass `npm audit --audit-level=high` (CI runs it).
- Each package is installed by the task that first uses it, not by this one.
- Run `rfc-reviewer`, resolve findings, flip to Active, `make rfc-sync`.

## Out of scope
- Installing any package.
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
RFC file is in `docs/rfc/active/` after `make rfc-sync`, status Active, `rfc-reviewer` findings resolved or dismissed in the RFC; `make quality` green.

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
