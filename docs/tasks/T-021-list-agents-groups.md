# T-021 — Tools: `list_agents`, `list_groups`

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-24)
- **Depends on:** T-017, T-018, T-020, T-053
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
- Cursor (`/decompose`, 2026-11-23): before any request the tool calls `readCursor` with its JSON arguments and its own `maxPosition`, a named constant: 0 if it serves one page only, else its source's last page (e.g. `MAX_PAGES - 1`), never a larger number, and gives `listEnvelope` the same arguments. Its input schema has no zod `default` or `transform`, so the arguments it parses are the ones sent (owner, 2026-11-23).

## Out of scope
- Roles, skills, availability.

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §8.4

## Files expected to change
- `src/tools/toolsets/core/list-agents.ts`, `list-groups.ts`
- `src/client/resources/list-all.ts` (`pages`, the pages that came back,
  for `api_calls_used`). `src/client/resources/agents.ts` does not change:
  the tool reads `contact.email` itself (see Dead ends).
- `test/tools/core/list-agents-groups.test.ts`

## Wireframes
`none`

## Acceptance
`test/tools/core/list-agents-groups.test.ts`: `list_agents` returns the
envelope with the fixture's ids, names and work emails, and an agent's phone
and every other key are absent; `list_groups` returns ids and names; no name
is inside `<ticket_content>`, a name carrying an HTML tag comes back without
it and one over the cap is cut (asserted); a list cut by the cap says
`truncated: true`; a client error comes back as `isError` with its code; a cursor from another call is `isError` `validation` with the MockAgent count 0; a cursor built over the arguments as sent, at the tool's `maxPosition`, is accepted, and one at `maxPosition` + 1 is `isError` `validation` with the message "points past the last position" and the MockAgent count 0; `grep -nF -e '.default(' -e '.transform('` over the tool's file prints nothing;
`api_calls_used` matches the MockAgent count when no page is retried, and a page retried after a 503 counts once (a recorded limitation, pinned by a test, until T-054); `make quality` green.

---
*Filled at `/handoff`:*

## Done
Commits `c5e255d` (status), `7ecae5d` (build), `cefd11a` (full-round
fixes) and the close commit (this file, T-054 row, parked items).

- `src/tools/toolsets/core/list-agents.ts`, `list-groups.ts`, registered in
  `core/index.ts` after `get_ticket_schema`; `listAll` returns `pages`.
- Tests, `test/tools/core/list-agents-groups.test.ts`:
  - "list_agents: the items › returns the envelope with the fixture's ids,
    names and work emails, nothing else" and "› leaves out an agent's phone
    even when Freshdesk sends one";
  - "list_agents: the email › an email %s comes back as asserted, the key
    present" (absent, null, a number, an object → `null`; over 254 cut with
    `…`; an HTML tag stripped);
  - "list_groups: the items › returns the envelope with the fixture's ids and
    names, nothing else";
  - "list_agents, list_groups: names › %s: a name loses its HTML tag, one
    over the cap is cut, none is wrapped" and "› list_agents: no fixture name
    is inside <ticket_content>";
  - "… the cap › %s: a list cut at 10 pages says truncated: true";
  - "… errors › %s: a client error comes back as isError with its code",
    "› %s: a page in the wrong shape comes back as isError server";
  - "… the cursor › %s: a cursor from another call is refused, nothing
    sent", "› %s: a cursor at the tool's maxPosition is accepted", "› %s: a
    cursor at maxPosition + 1 is refused, nothing sent" (message "points past
    the last position", MockAgent count 0);
  - "… api_calls_used and retries › %s: recorded limitation: a page retried
    after a 503 counts once in api_calls_used" (count 2, `api_calls_used` 1);
  - "… one 30 s deadline per call › %s: slow pages end the call at 30 s as
    network, with no request after" (fake clock);
  - "… the description's numbers › %s: the cap it states is PER_PAGE ×
    MAX_PAGES, in MAX_PAGES calls".
  - `test/server.test.ts` lists the three core tools;
    `test/client/resources/agents.test.ts`, `groups.test.ts` assert `pages`.
- `grep -nF -e '.default(' -e '.transform('` over both tool files prints
  nothing (exit 1).
- Mutation checks on `list-agents.ts`, each restored: cursor check removed →
  2 failed; `truncated` not passed → 1; raw name plus phone → 3;
  `api_calls_used` fixed at 1 → 3; deadline removed → 1; email unchecked → 4;
  "1,000" changed → 1. The tool test failed first on missing modules only.
- Choices: `MAX_POSITION = 0` for both (the whole list in one response, no
  `next_cursor`; a cursor is still read before any request); input
  `{cursor?: string}`; the email through `plainName` capped at 254 (RFC 5321
  path), a non-string `null`; one 30 s deadline per call (`CALL_DEADLINE_MS`,
  local: the schema module is type-only from this place); the description's
  "1,000" and "10" written out (`list-all.js` is not on the import list),
  pinned by a test.
- `make quality` exit 0: vitest "Test Files 20 passed (20)", "Tests 1413
  passed (1413)"; `tools/checks` 54 OK; eslint, prettier, tsc, build,
  gitleaks clean.

## Dead ends
- The email checked in the shared resource schema
  (`contact.email: z.string().nullish()` in `src/client/resources/agents.ts`,
  `7ecae5d`): reverted in `cefd11a`. The schema service loads the same list,
  so one agent with an odd email would have failed the whole schema load for
  every tool. The tool now checks the email itself.

## Open doubts
- A page retried after an error counts once in `api_calls_used`, though each
  attempt is a call: recorded limitation until T-054.
- A string that is not an email address passes as `email` after `plainName`
  (admin-set, not wrapped).
- An empty-string email gives `""`, not `null` (untested).

## Context pressure
Low: one builder session plus two review-fix rounds; no file dumped whole.

## Next action
none: done.
