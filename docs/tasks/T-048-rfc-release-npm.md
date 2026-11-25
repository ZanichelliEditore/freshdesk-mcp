# T-048 — RFC: release on npm

- **Type:** plan
- **Phase:** M1
- **Status:** doing (2026-11-25)
- **Depends on:** none
- **Created:** 2026-11-23

## Goal
The RFC the runtime-stack RFC leaves to release tooling
(`docs/rfc/active/2026-11-23-adopt-runtime-stack.md:126-128`): it records
the owner's release decisions and decides how a publish is authorised.

## In scope
- Recorded (owner, 2026-11-23): public npm, `@zanichelli/freshdesk-mcp`,
  published from CI on a version tag with provenance, 0.x until M4, first
  publish 0.1.0 after T-039 on the owner's go.
- Decided here, the RFC recommends and the owner approves: a GitHub
  Environment with the owner as required reviewer and an environment secret,
  or npm trusted publishing over OIDC with no long-lived token. For each:
  who can trigger a publish, and what a leaked credential allows.
- Also weighed: who can push a `v*` tag (tag protection), and whether npm
  trusted publishing works for a package that does not exist yet (if not,
  0.1.0 may need a token).
- Any tool or action the workflow needs is named with its pin.
- `rfc-reviewer` on the draft. An accepted RFC may amend T-045's acceptance
  line (decompose.md step 6), in the row and the task file.

## Out of scope
- The workflow itself (T-045); the `.mcpb` and its tooling (M4, their own
  RFC).

## Spec sections to read
- SPEC.md §11
- SPEC.md §12

## Files expected to change
- `docs/rfc/proposed/` → `docs/rfc/active/`
- `docs/tasks/PLAN.md` and `docs/tasks/T-045-release-workflow.md`
  (acceptance amendment only)

## Wireframes
`none`

## Acceptance
The RFC is in `docs/rfc/active/` after `make rfc-sync`, Status Active by the
owner's word; it states the five recorded decisions, chooses one
authorisation mechanism with the other weighed and rejected for a stated
reason, and says who can trigger a publish; `rfc-reviewer`'s findings are
resolved or dismissed in the RFC; T-045's acceptance names the chosen
mechanism in both places it is written; `make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
