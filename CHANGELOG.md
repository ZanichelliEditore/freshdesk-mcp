# Changelog

All notable changes to `@zanichelli/freshdesk-mcp`. Versions follow semver
and stay 0.x until milestone M4, then 1.0.0.

## Unreleased

- **Added:** the `write` toolset registers when the team file's `toolsets`
  enables it, with its first tool, `update_ticket`: status (Resolved and
  Closed included), priority, type, group, agent, custom fields by label,
  and tags added or removed. Not for release before the rest of `write`
  (`add_note`, `categorize_tickets`, `hand_off_draft`) is in (PLAN OD-16).
  `send` is still refused.
- **Added:** `add_note` in `write`: a private note on a ticket, always
  private, notifying agents named by id (looked up with `list_agents`). It
  returns the note's id and the agent ids notified, never an email address.
- **Added:** `categorize_tickets` in `write`: the ticket type and custom
  fields on up to 50 tickets, previewed first (current and new values, and
  a `preview_id`), then applied with `confirm: true`, one ticket at a time,
  with a result per ticket. Tickets the call's time or the API budget left
  are reported not attempted, and the same `preview_id` applies them later.
  A ticket whose change was sent without a clear answer (a timeout, a 5xx,
  a 3xx, an answer of another shape) is reported `may_have_been_applied`,
  with its own count, apart from `refused`.
- **Added:** `hand_off_draft` in `write`: a draft reply handed to another
  agent in one call, as a private note headed `DRAFT REPLY`, then the ticket
  assigned to an agent and/or a group, the agents named by id notified. With
  nothing to assign, only the note is written. If the assignment fails after
  the note, the error gives the note's id; the note stays and nothing is
  retried. No email address in its output.
- **Changed:** `add_note` now returns an error naming the `note_id` when
  Freshdesk answers that the note is public (`private: false`): the note
  must be checked on the ticket.

## 0.3.1 (2026-11-25)

- **Fixed:** `export_tickets` resumed with `next_cursor` on a period of 300
  matches or fewer is no longer refused ("out of its own order") when
  tickets created in the same second come back with their ids rising, which
  Freshdesk's search does. 0.3.0 did not fix this. The cursor now holds the
  `created_at` second of the last ticket written and the ids already written
  in that second, so ties in any order are each written once. A cursor is
  longer (at most 570 characters) and shows those ids.
- **Changed:** cursors given by `export_tickets` 0.3.0 and earlier are
  refused, once: "Call again without a cursor to start over". This holds for
  both kinds of cursor. Start the export of that period again.
- **Changed:** when more than 30 tickets written share the last `created_at` second, the
  call keeps its file and says `truncated: true` with no `next_cursor`, and
  a `note` asks you not to reuse the cursor and to export the period without
  `max_tickets` (up to 300 matching tickets fit one call) or in shorter
  periods. This replaces 0.3.0's very-large-id case, which no longer
  happens.

## 0.3.0 (2026-11-25)

- **Fixed:** `export_tickets` resumed with `next_cursor` on a period of 300
  matches or fewer is no longer refused ("out of order") when a ticket has a
  higher id but an older `created_at` (phone tickets, merges, restores,
  back-dated tickets). The cursor now resumes after the last ticket
  written as search orders it, by `created_at` and then id. A ticket created
  between calls with a later `created_at` is left out; a back-dated one is
  written.
- **Changed:** cursors given by `export_tickets` before this version are
  refused, once: "Call again without a cursor to start over". This holds for
  both kinds of cursor, the one for 300 matches or fewer and the one for
  larger periods. Start the export of that period again.
- On a very long period, a ticket with a very large id cannot be held in a
  cursor. The call keeps its file and says `truncated: true` with no
  `next_cursor`, and a `note` asks you to export the rest in shorter
  periods.

## 0.2.0 (2026-11-25)

- The export directory is set with a command-line argument in the MCP
  client's `args`: `--export-dir <dir>` or `--export-dir=<dir>`.
  `FRESHDESK_EXPORT_DIR` still works as the fallback; the argument wins when
  both are set.
- **Changed:** an argument the server does not know (an unknown option, a
  positional argument, `--export-dir` with no value, an empty one, or given
  twice, `--version` with a value or given twice) now stops the server at
  start with a message on stderr and exit code 1; 0.1.0 ignored it. The
  message never quotes the argument.
- `--version` is read anywhere in the argument list.

## 0.1.0 (2026-11-25)

- First release: the read-only `core` toolset (fifteen tools), served over
  stdio with your own Freshdesk API key, runnable with `npx`.
- `export_tickets` pages a period: `max_tickets` and a cursor, one file per
  call.
- `list_solution_tree` takes an optional `category`, so a large knowledge
  base still shows articles.
- Checked against a real account (GET only) before release.
- Published from CI on a version tag, with provenance.
