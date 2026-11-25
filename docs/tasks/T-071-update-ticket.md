# T-071 — Tool: `update_ticket`, and the `write` toolset registers

- **Type:** build
- **Phase:** M2
- **Status:** todo (2026-11-25)
- **Depends on:** T-041, T-068
- **Created:** 2026-11-25

## Goal
`update_ticket` exists and `write` is a toolset the server registers: `server.ts` stops refusing `write` (`send` still a `ConfigError`); each write tool is a factory handed its own entry point by one wiring module.

## In scope
- `src/tools/toolsets/write/index.ts` (wiring), `update-ticket.ts`: status (Resolved and Closed allowed), priority, type, group, agent, tags add/remove, custom fields by label.
- Description: "Freshdesk automations may act on the change, as for an agent's edit" and that Resolved or Closed may make Freshdesk email the requester and send a satisfaction survey (RFC decision 6).
- MCP annotations (`destructiveHint` etc.).
- `docs/tool-catalogue.md` if it lists `write` as planned.

## Out of scope
- The other write tools.
- No release with `write` before T-074 is `done` (OD-16, owner 2026-11-25).

## Spec sections to read
- SPEC.md §8.2
- RFC `2026-11-25-write-safety-core`, OD-2 and owner's decision 6
- SPEC.md §8.1

## Files expected to change
- `src/tools/toolsets/write/index.ts`, `update-ticket.ts` (new)
- `src/tools/toolsets/index.ts`
- `src/server.ts`
- `eslint.tool-imports.json`
- `test/tools/write/update-ticket.test.ts` (new)
- `test/server.test.ts`
- `docs/tool-catalogue.md`, `docs/architecture/overview.md`
- `CHANGELOG.md`

## Wireframes
`none`

## Acceptance
`test/tools/write/update-ticket.test.ts` (MockAgent): a status/agent/custom-field change sends one PUT with ids; tags add/remove merged from the current tags; Resolved and Closed allowed; a requester or subject input refused `field_not_writable` with 0 dispatches; the description holds both sentences; `test/server.test.ts`: a team file with `write` lists `update_ticket` with `destructiveHint`, without it the tool is absent; `send` still a `ConfigError`; the wiring hands each write factory exactly its own entry point and no entries object (asserted on what each factory receives); `make quality` green.

Split point: the registry wiring and `server.ts` first, the tool second.

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
