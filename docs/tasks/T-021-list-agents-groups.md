# T-021 — Tools: `list_agents`, `list_groups`

- **Type:** build
- **Phase:** M1
- **Status:** todo (2026-11-23)
- **Depends on:** T-017, T-018, T-020
- **Created:** 2026-11-23

## Goal
Lookup of agents and groups for assignment and notification, in the list
envelope.

## In scope
- `list_agents`: id, name and work email; phone and every other key absent
  (owner, 2026-11-23). The schema's map keeps id and name only, so the tool
  calls `listAgents` itself and takes the email from `contact.email`
  (`docs/improvements.md` `e85b3db` Info (b)).
- `list_groups`: id and name.
- Names are not wrapped (owner, 2026-11-23): through T-017's name helper,
  HTML stripped and length capped. `truncated` when the 10-page cap cut the
  list.

## Out of scope
- Roles, skills, availability.

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §8.4

## Files expected to change
- `src/tools/toolsets/core/list-agents.ts`, `list-groups.ts`
- `src/client/resources/agents.ts` (the email kept by the resource's zod
  schema)
- `test/tools/core/list-agents-groups.test.ts`

## Wireframes
`none`

## Acceptance
`test/tools/core/list-agents-groups.test.ts`: `list_agents` returns the
envelope with the fixture's ids, names and work emails, and an agent's phone
and every other key are absent; `list_groups` returns ids and names; no name
is inside `<ticket_content>`, a name carrying an HTML tag comes back without
it and one over the cap is cut (asserted); a list cut by the cap says
`truncated: true`; a client error comes back as `isError` with its code;
`api_calls_used` matches the MockAgent count; `make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
