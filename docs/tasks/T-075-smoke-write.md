# T-075 — Smoke write script through the core, `mcp-test` tickets only

- **Type:** build
- **Phase:** M2
- **Status:** done (2026-11-26)
- **Depends on:** T-071, T-072, T-073, T-074, T-078
- **Created:** 2026-11-25

## Goal
A manual script, `make smoke-write`, that the owner runs to exercise each write tool on given ticket ids of the real account: it refuses any ticket without the `mcp-test` tag (SPEC §11) and writes only through the core's entry points (no second write path, AGENTS.md rule 1).

## In scope
- One mode per use case: C1/C8 categorise, C4 note, C5 update, C6 hand-off.
- Before each write: GET the ticket, refuse with nothing written if the tag is missing or the ticket is spam.
- Output: yes/no and counts only; no id, text, domain or key.

## Out of scope
- Running it against the real account (T-076).

## Spec sections to read
- SPEC.md §11 (Real-account checks)
- SPEC.md §14 rule 1

## Files expected to change
- `scripts/smoke/write.ts` (new)
- `scripts/smoke/cli.ts`
- `Makefile` (`smoke-write`)
- `test/smoke-write.test.ts` (new)
- `docs/architecture/overview.md`

## Wireframes
`none`

## Acceptance
`test/smoke-write.test.ts` (MockAgent): an untagged or spam ticket gets one GET and nothing else; a tagged ticket's write reaches MockAgent only through the core's entries: `scripts/smoke/write.ts` and every `scripts/` module it imports take from `src/core/` only the entry builder, import no `HttpClient` and set no `method` (asserted on their source), and the entries are built from the team `loadConfig` loads, never from a literal toolsets list; a failed tag check (5xx, 404, timeout) or a ticket whose `tags` or `spam` field is missing refuses with nothing written; output holds no id, subject, body, domain or key; a failed write prints its code only and exits non-zero; `make help` lists `smoke-write`; `make quality` green.

No split point.

---
*Filled at `/handoff`:*

## Done
- `094564e`: `scripts/smoke/write.ts` (`runWrite`), `scripts/smoke/cli.ts`
  `--write`, `Makefile` `smoke-write` (CASE, TICKETS, FIELDS, NOTIFY, each
  unexpanded), `tools/checks/test_make_version.py` (help lists
  `smoke-write`), `docs/architecture/overview.md` (`scripts/smoke/` entry).
- The handoff commit: review fixes (tags in FIELDS refused for C1, C5, C6;
  C5's ticket GET pinned to one; the non-atomic check written in the
  header).
- Tests: `test/smoke-write.test.ts` (67 cases, MockAgent): describe "the tag
  check refuses with one GET and nothing else" (untagged and spam per case,
  exact tag, `tags`/`spam` missing or mistyped, 404, 5xx, timeout, C1's
  second ticket untagged); "a tagged ticket's write goes through the write
  tools" (C1, C4, C5, C6, C8, bodies asserted); "a failed write prints its
  code only and exits non-zero"; "refused before any request" (no `write`
  in the team file, host override, config, every bad argument); "its source
  takes the write side from the core's builder only" (no `src/core/` import
  but `createWritePath`, no client, no `method`, no toolsets literal,
  `loadConfig(env)` and `createContext(config, ...)`).
- Design: the lint fence (T-077) lets only `src/tools/context.ts` call
  `createWritePath`, so the script builds the context with `createContext`
  and calls `toolsetsOf(context).write`'s tools; it imports nothing from
  `src/core/`. No change to `src/**` or `eslint.config.mjs`.
- Shown with an empty environment (no credentials, no request possible):
  `make smoke-write CASE=C9` prints `config: fail (CASE takes C1, C4, C5,
  C6 or C8)`; a FIELDS holding `$(touch <file>)` and backticks ran nothing.

## Dead ends
- Calling the tools through an in-process MCP session (as `core.ts` does):
  its JSON-RPC client sets a `method` key, which the source check forbids;
  calling the toolset's tools directly is simpler and the same check-then-
  handler path `registerTool` uses.

## Open doubts
- The tag check and the write are not atomic (a tag removed in between is
  not seen); accepted for the owner's own test tickets (both reviewers,
  low).
- `cli.ts`'s `--write` parsing has no test (tests may not import
  `**/cli.ts`); traced by both reviewers as failing closed.

## Context pressure
ok

## Next action
none (done).
