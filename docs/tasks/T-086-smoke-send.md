# T-086 — Smoke send script through the core, `mcp-test` tickets only

- **Type:** build
- **Phase:** M3
- **Status:** todo (2026-11-26)
- **Depends on:** T-084, T-085, T-088
- **Created:** 2026-11-26

Sized on T-079's likely answer (PLAN, M3: the OD proposals, and the owner's answers of 2026-11-26 to OD-20, OD-21 and OD-26); its acceptance is re-checked when T-079's RFC is accepted.

## Goal
`make smoke-send`: a reply or a forward through the core's send entries, on `mcp-test` tickets only, to allow-listed internal addresses only (OD-28).

## In scope
- `scripts/smoke/send.ts`, reusing T-075's tag and spam check; cases for a reply, a forward and a public note (OD-26).
- Each send in two steps: "Not sent" and a `send_id`, then `confirm: true` with it (OD-20).
- A reply only when the requester's email is on the team allow-list; a forward only to allow-listed addresses from the private team file.
- Output: yes/no and counts only.

## Out of scope
- Running it against the real account (T-087, the owner).
- Any change to `make smoke-write`.

## Spec sections to read
- SPEC.md §11 (Real-account checks)
- SPEC.md §14 rule 1
- T-079's RFC (OD-28)

## Files expected to change
- `scripts/smoke/send.ts` (new)
- `Makefile` (`smoke-send`)
- `test/smoke-send.test.ts` (new)
- `README.md` or `CONTRIBUTING.md` (one line, where `smoke-write` is documented)

## Wireframes
`none`

## Acceptance
`test/smoke-send.test.ts` (MockAgent): cases for a reply, a forward and a public note; an untagged or spam ticket gets one GET and nothing else; each send is two steps, the first returning "Not sent" and a `send_id` with 0 POSTs, the second sending with `confirm: true` and that `send_id` (OD-20); a reply is refused unless the requester's email is on the team allow-list (one GET through the view); a send reaches MockAgent only through the core's entries, built from the team `loadConfig` loads (source asserted as in T-075); a failed tag check refuses with nothing sent; output holds no id, address, body, domain or key; `make help` lists `smoke-send` (OD-28); `make quality` green.

No split point: one script on T-075's pattern.

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
