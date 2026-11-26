# T-086 — Smoke send script through the core, `mcp-test` tickets only

- **Type:** build
- **Phase:** M3
- **Status:** done (2026-11-26)
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
`test/smoke-send.test.ts` (MockAgent): cases for a reply, a forward and a public note; one GET per ticket (`include=requester`, A6); an untagged or spam ticket gets that GET and nothing else; a reply or a public note is refused unless the requester's email is on the team allow-list, and refused when the ticket has any of `cc_emails`, `fwd_emails`, `reply_cc_emails` and `ticket_cc_emails` not empty (one case per field), with one exception for the A4 run (OD-21): with the one opt-in flag `TICKET_CC=allow-listed`, on the reply case only, a ticket whose four CC fields together hold exactly one distinct address, lower-cased, on the team allow-list by T-081's matcher and not the requester's email, is accepted, and the reply then sends no `cc` of its own; with that flag, a ticket with no CC, with two distinct CCs, with an off-list CC or with a CC equal to the requester's email, a requester off the allow-list, a `TICKET_CC` value other than `allow-listed`, and a forward or public-note case, each refuse with 0 POSTs (one case each); a forward on a ticket with any of the four CC fields not empty refuses, 0 POSTs (one case per field; OD-28, SPEC §11); a ticket whose `tags`, `spam` or requester email is missing, or any of the four CC fields absent, null or not a list, refuses; each refusal with 0 POSTs; each send is two steps, the first returning "Not sent" and a `send_id` with 0 POSTs, the second sending with `confirm: true` and that `send_id` (OD-20); a send reaches MockAgent only through the core's entries, built from the team `loadConfig` loads (source asserted as in T-075); a failed tag check refuses with nothing sent; output holds no id, address, body, domain or key; `make help` lists `smoke-send` (OD-28); `make quality` green.

No split point: one script on T-075's pattern.

---
*Filled at `/handoff`:*

## Done
- `6709f63`: `scripts/smoke/send.ts` (`runSend`), `--send` in `scripts/smoke/cli.ts`, `make smoke-send` (`CASE=reply|forward|public-note TICKET=<id> TO=<address>[,<address>] TICKET_CC=allow-listed`), its line in `docs/architecture/overview.md` (README and CONTRIBUTING do not document `smoke-write`, so the line went where it is).
- Tests: `test/smoke-send.test.ts` (92 tests): `::reply: one GET, step 1 sends nothing, step 2 one POST, no cc of its own`, `::forward: one POST to the TO address, no cc, attachments off`, `::public note: one POST of {body, private: false}, answered public`, `::public note answered private: true: sent, reported, exit non-zero`; tag, spam, requester, each CC field per case, missing fields; the A4 accepted case and each A4 refusal; config refusals with 0 requests; the source assertions and the `make help` line.
- Small decisions (orchestrator's go, recorded here): a forward's `to` comes from `TO`, each address pre-checked with T-081's `onAllowList` before any request (the core checks again); a requester email is required for a forward too (fail closed, the acceptance's "missing requester email refuses" read for every case); the GET with `include=requester` goes through `context.http.requestWithRetry` (the GET-only view), since `getTicket` takes `include=stats` only and `src/client` stays unchanged; T-075's tag and spam check is re-written in `send.ts`, not imported (`write.ts` reads through `getTicket`, and importing it would pull the write smoke into the send script's graph); a public note's answer is read at the dispatcher for its `private` flag (T-088's open doubt, no `src/core` change), printed `answered private yes|no|unknown`, and anything but `no` exits 1; `unknown` is reachable only with an answer over 1 MiB, since the core already refuses an answer without a boolean `private` (`server`, `may_have_been_sent`), so it has no test.
- Review: full round clean (see HANDOFF "Reviews"); low items parked in `docs/improvements.md` (`6709f63` entry).

## Dead ends
none

## Open doubts
- The CC field names (A6) are unverified: a fifth field or a wrong name is not seen by the script (parked at T-079). T-087's first run shows whether the GET carries all four.
- The GET-then-POST gap: a CC or tag changed between the check and the send is not seen (accepted on owner-made `mcp-test` tickets).

## Context pressure
ok

## Next action
none (done).
