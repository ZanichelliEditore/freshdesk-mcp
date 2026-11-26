# T-072 — Tool: `add_note`

- **Type:** build
- **Phase:** M2
- **Status:** done (2026-11-26)
- **Depends on:** T-069, T-071
- **Created:** 2026-11-25

## Goal
`add_note` writes a private note on a ticket and notifies agents named by id (C4).

## In scope
- Inputs: ticket id, body, agent ids to notify; no `private`, no `notify_emails`.
- Description says the note is private and how to find agent ids (`list_agents`).

## Out of scope
- Public notes (`send`, M3).
- No release with `write` before T-074 is `done` (OD-16, owner 2026-11-25).

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §3 (C4)
- RFC `2026-11-25-write-safety-core`, invariants 4 and 5

## Files expected to change
- `src/tools/toolsets/write/add-note.ts` (new), `index.ts`
- `test/tools/write/add-note.test.ts` (new)
- `CHANGELOG.md`

## Wireframes
`none`

## Acceptance
`test/tools/write/add-note.test.ts` (MockAgent): one POST with `private: true` and the resolved emails; a `private` or `notify_emails` input is `validation` with 0 dispatches; an unresolved agent refuses the note; listed only with `write`; `make quality` green.

No split point.

---
*Filled at `/handoff`:*

## Done
- `23ebc5d`: `src/tools/toolsets/write/add-note.ts` (`addNote(entry)`: strict
  input `{ticket_id, body, notify_agent_ids?}`; output allow-listed only:
  `ticket_id`, `note_id`, `private`, `notified_agent_ids`,
  `api_calls_used`; addresses replaced in a refusal's text);
  `src/tools/toolsets/write/index.ts` hands it `entries.add_note` only;
  `eslint.tool-imports.json` T3 lists `./add-note.js`; the
  `docs/tool-catalogue.md` line now says "private note only" (improvements
  `f22c4a3`); overview, CHANGELOG.
- `e985d67`: full-round fixes: redaction splits on whitespace and replaces
  each word holding an at sign (plain, fullwidth, HTML entity), linear;
  tests for each form and for exactly 10 agents.
- Tests: `test/tools/write/add-note.test.ts` (30 cases). One POST with
  `private: true` and the resolved emails ("sends one POST with private:
  true and the resolved emails, after one GET per agent"); `private` (true
  or false), `notify_emails`, `user_id`, `incoming` refused with 0
  dispatches; an agent 404 or inactive refuses the note, no POST; "no
  email ever reaches the output" (answer carrying `notified_to`,
  `to_emails`, `cc_emails`, `bcc_emails`, `support_email`, `from_email`;
  a 400 quoting an address; a 404) and "an address in any error text is
  replaced"; listed only with `write`. `test/server.test.ts` "the write
  wiring" now expects `update_ticket`, `add_note`.
- Reading of the acceptance's "`validation`": a `private` or
  `notify_emails` key is refused by the MCP SDK's input validation (zod
  strict object), an `isError` text starting "Input validation error", not
  a `FreshdeskError` JSON with `code: "validation"`; the same mechanism as
  `update_ticket`'s unnamed key. Nothing is sent either way.
- `make quality` on `e985d67`: vitest 3880 passed, `tools/checks` 138 OK.

## Dead ends
none

## Open doubts
- If Freshdesk ever answered a note with `private: false`, the tool reports
  `private: false` with `ok: true`; it does not flag it (owner's call; the
  core always sends `private: true`).
- A whitespace-only `body` is sent (`min(1)` refuses only `""`).

## Context pressure
ok

## Next action
none (done)
