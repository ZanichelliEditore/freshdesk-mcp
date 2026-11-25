# T-075 — Smoke write script through the core, `mcp-test` tickets only

- **Type:** build
- **Phase:** M2
- **Status:** todo
- **Depends on:** T-071, T-072, T-073, T-074
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
`test/smoke-write.test.ts` (MockAgent): an untagged or spam ticket gets one GET and nothing else; a tagged ticket's write reaches MockAgent only through the core (the script imports no `HttpClient` and sets no `method`, asserted on its source); output holds no id, subject, body, domain or key; a failed write prints its code only and exits non-zero; `make help` lists `smoke-write`; `make quality` green.

No split point.

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
