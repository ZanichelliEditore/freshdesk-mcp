# T-020 — Tool: `get_ticket_schema`

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-24)
- **Depends on:** T-017, T-019, T-047
- **Created:** 2026-11-23

## Goal
The first `core` tool: ticket fields with labels, types, choices (nested
tree) and team meanings (C1, C8).

## In scope
- Every field the schema has is listed: `hidden` is not applied here, hidden
  fields are not handled beyond `ticketOutput` for now (owner, 2026-11-23).
- Field labels and choice names through T-017's name helper (HTML stripped,
  length capped), not wrapped (owner, 2026-11-23).
- A long choice list is capped with a marker; the description says the call
  cost (cold and warm cache).
- After T-047: no tool ships without the 30 s deadline of a cold schema load
  (owner, 2026-11-23).

## Out of scope
- Hiding fields from this tool (parked, `docs/improvements.md`).

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §7.3
- SPEC.md §8.4

## Files expected to change
- `src/tools/toolsets/core/get-ticket-schema.ts`
- `src/tools/toolsets/core/index.ts`
- `test/tools/core/get-ticket-schema.test.ts`

## Wireframes
`none`

## Acceptance
`test/tools/core/get-ticket-schema.test.ts` (in-memory client, MockAgent):
the result has each fixture field's label, API name, type and choices, the
3-level field as a tree with asserted values, and the team `meaning`; a
label and a choice name carrying an HTML tag come back without it and capped
(asserted); a choice list over the cap is cut with the marker; a field the
team file marks `hidden` is listed like any other, since `hidden` is not
applied here (asserted, so a later change is a decision); a second call
within the TTL sends no request; a failed schema load returns its error code
as `isError` and the next call tries again; `readOnlyHint` is true; `make
quality` green.

---
*Filled at `/handoff`:*

## Done
- Commits: `ac39e85` (status), `00cccd0` (build), `24af5c3` (full review
  fixes), and the closing commit `T-020: done; task file, parked review
  items, journal` (2026-11-24). Built by a builder agent under the
  orchestrator.
- `src/tools/toolsets/core/get-ticket-schema.ts`: the tool;
  `src/tools/toolsets/core/index.ts`: `CORE_TOOLS`;
  `src/tools/toolsets/index.ts`: `TOOLSETS.core = CORE_TOOLS`, `sentError`.
- Tests, `test/tools/core/get-ticket-schema.test.ts`:
  - `get_ticket_schema: the listing > is listed read-only, with its cold
    and warm cost in the description`;
  - `get_ticket_schema: the fields > returns each fixture field's label,
    API name, type and choices`, `> returns the 3-level field as a tree,
    with its levels`, `> carries the team meaning, matched by label or API
    name whatever the case`, `> lists a field the team file marks hidden
    like any other: hidden is not applied here`;
  - `get_ticket_schema: admin-set names > strips HTML from a label and a
    choice name and caps them`, `> returns a name → id record (agent,
    group, product) as {id, name}`, `> gives id null for a record value
    that is not a number`, `> passes a status key that is not a whole
    number through plainName`, `> with %i choices lists the first
    CHOICE_CAP, choices_not_shown %s` (CAP, CAP + 1), `> cuts a choice
    list over the cap and says how many were not shown`, `> counts every
    level of a tree against the cap, and marks each cut list`;
  - `get_ticket_schema: the cache > sends no request for a second call
    within the TTL`, `> returns a failed load's error code as isError, and
    the next call loads again`.
  - `test/server.test.ts`: `createServer: tool results > wraps each
    errors[] message as untrusted text, and strips and caps its field and
    code` (with `note`), `> turns a returned FreshdeskError into isError
    with its code and message` (no `note` without `errors[]`);
    `createServer: enabled toolsets come from the team file only > a
    server from the real registry lists core's tools` (replaces "has no
    tools/list while core is empty").
- Red first: the whole tool test file (no module yet) and the `errors[]`
  wrapping test (raw `</ticket_content>` and tags came back); in the
  review fixes, the `note` assertion. The review's cap, record, status-key
  and boundary tests passed on their first run: they pin behaviour that
  was already there.
- Beyond "Files expected to change" (decision, orchestrator 2026-11-24,
  T-019 parked security 3): the registry's `sentError` wraps each
  `errors[]` `message` with `untrusted` and passes `field` and `code`
  through `plainName`, and an error with `errors[]` carries a fixed `note`,
  the `DATA_NOT_INSTRUCTIONS` sentence, so a tool without customer text
  still explains the markers. Also `test/server.test.ts`,
  `test/support/mcp-session.ts` (the in-memory JSON-RPC client, now used
  by both test files) and `docs/architecture/overview.md`. No allow-list
  entry added.
- Choices:
  - Output `{ fields: [{label, name, type, choices?, choices_not_shown?,
    levels?, meaning?}] }`. Choices by type: status `{id, name,
    customer_name}`; nested field a tree of `{name, choices}` ending in
    lists of names, plus `levels` from `nested_ticket_fields`; a list of
    names as is; a name → id record `{id, name}`, `id` `null` for a value
    that is not a number. Label, API name, type and every choice name
    through `plainName`; the team `meaning` as written.
  - `CHOICE_CAP = 200` per field, every level of a tree counted, filled
    level by level; a list cut short carries `choices_not_shown: <count>`;
    a branch the cap never reached has `choices: []`.
  - The meaning is matched by label or API name with a local copy of
    `fold` (trim, NFC, lower case): `src/schema/output.ts` is refused at
    T2 by the lint tests on purpose. Unlike `hidden`, the ticket key
    (`responder_id`) does not match.
  - No `api_calls_used`: the schema service does not say whether a call
    loaded cold, and the acceptance does not ask for it.
  - `hidden` is not echoed: a hidden field comes back exactly as without it.
  - Annotations read-only, idempotent, open-world; `customerText: false`;
    the cost names both cases (0 cached, at least 3 cold, within 30 s).
- Reviews: full round, then a scoped round on `00cccd0..24af5c3` with list
  A empty for all three; parked items in `docs/improvements.md`, entry
  stamped `24af5c3`.

## Dead ends
none

## Open doubts
- `errors[]` messages from a local validation (`src/schema/input.ts`,
  echoing the model's own input) are wrapped in `<ticket_content>` too:
  safe, but they are not customer-written.
- A name → id record's values must be numbers. A value that is an array
  (a tree level) gives `id: null` here. A numeric string (`"70421"`) never
  reaches the tool: checked on 2026-11-24 against the built
  `listTicketFields`, it fails the whole ticket-fields load as `server`
  (HTTP 200, "unexpected shape"), so one odd field stops the schema.
  Not tested in the suite.
- No total size cap on the result: `CHOICE_CAP` bounds each field, not
  the number of fields (parked).

## Context pressure
low

## Next action
none: done.
