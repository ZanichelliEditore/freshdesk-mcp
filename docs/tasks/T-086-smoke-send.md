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
- One GET per ticket with `include=requester` (A6): tags, spam, requester email, and the four CC fields `cc_emails`, `fwd_emails`, `reply_cc_emails` and `ticket_cc_emails` (names unverified; A6).
- A reply or a public note only when the requester's email is on the team allow-list and all four CC fields are empty lists (OD-21 leaves CCs to the procedure; the script checks them); a missing field refuses; a forward only to allow-listed addresses from the private team file, and only on a ticket whose four CC fields are empty (OD-28).
- The one A4 exception (owner, 2026-11-26; RFC `2026-11-26-send-safety-core`, OD-21): with the opt-in flag `TICKET_CC=allow-listed`, a reply only, on a ticket whose one ticket-level CC is allow-listed and is not the requester.
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
`test/smoke-send.test.ts` (MockAgent): cases for a reply, a forward and a public note; one GET per ticket (`include=requester`, A6); an untagged or spam ticket gets that GET and nothing else; a reply or a public note is refused unless the requester's email is on the team allow-list, and refused when the ticket has any of `cc_emails`, `fwd_emails`, `reply_cc_emails` and `ticket_cc_emails` not empty (one case per field), with one exception for the A4 run (OD-21): with the one opt-in flag `TICKET_CC=allow-listed`, on the reply case only, a ticket whose four CC fields together hold exactly one distinct address, lower-cased, on the team allow-list by T-081's matcher and not the requester's email, is accepted, and the reply then sends no `cc` of its own; with that flag, a ticket with no CC, with two distinct CCs, with an off-list CC or with a CC equal to the requester's email, a requester off the allow-list, a `TICKET_CC` value other than `allow-listed`, and a forward or public-note case, each refuse with 0 POSTs (one case each); a forward on a ticket with any of the four CC fields not empty refuses, 0 POSTs (OD-28, SPEC §11); a ticket whose `tags`, `spam` or requester email is missing, or any of the four CC fields absent, null or not a list, refuses; each refusal with 0 POSTs; each send is two steps, the first returning "Not sent" and a `send_id` with 0 POSTs, the second sending with `confirm: true` and that `send_id` (OD-20); a send reaches MockAgent only through the core's entries, built from the team `loadConfig` loads (source asserted as in T-075); a failed tag check refuses with nothing sent; output holds no id, address, body, domain or key; `make help` lists `smoke-send` (OD-28); `make quality` green.

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
