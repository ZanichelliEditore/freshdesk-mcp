# T-087 — M3 acceptance on `mcp-test` tickets (owner action)

- **Type:** spike
- **Phase:** M3
- **Status:** done (2026-11-26)
- **Depends on:** T-086, T-076 `done`
- **Created:** 2026-11-26

## Goal
M3's acceptance shown on the real account: C5 reply, C4 forward and the public note work on `mcp-test` tickets, mail reaches only the expected internal mailboxes, the activity log shows no automation acted, and A1 to A6 are checked (A4 by one opt-in reply run).

## In scope
- Owner: the private team file's `forward_allow_list` holds the builders' own addresses or an internal `@domain`; `mcp-test` tickets with an internal requester on that list, no ticket-level CC, group `MCP Test`, each checked not spam; plus one such ticket for A4 whose only ticket-level CC is another allow-listed internal mailbox, not the requester.
- Owner: `make smoke-send` once each for a reply, a forward and a public note (OD-26); check which mailboxes received mail; read the activity log after each send; record A1 to A6.
- Owner, A4 (owner, 2026-11-26): one reply run with `TICKET_CC=allow-listed` on the A4 ticket; record whether the CC mailbox received the reply.
- Results in `docs/private/account-facts.md` (gitignored); this task file holds yes/no lines only.

## Out of scope
- Production tickets; any address outside the allow-list.

## Spec sections to read
- SPEC.md §13 (M3)
- SPEC.md §11 (Real-account checks)
- T-079's RFC

## Files expected to change
- `docs/private/account-facts.md` (gitignored)
- this task file

## Wireframes
`none`

## Acceptance
"Done" lists, with dates, one yes line each for C5 reply, C4 forward and the public note (OD-26) from the owner's `make smoke-send` runs, one line that mail reached only the expected internal mailboxes, one line "no automation rule acted" from the activity log after each reply, forward and public note (SPEC §13, OD-31), and one yes/no line per API assumption A1 to A6 (A4 from one reply run with T-086's `TICKET_CC=allow-listed` on an `mcp-test` ticket whose only ticket-level CC is an allow-listed internal mailbox, the reply's own `cc` empty: yes if that mailbox received the reply, no if not); no account value in any tracked file (commit hook passes); `make quality` green.

No split point. Needs the owner's actions throughout; taken only after T-076 is `done`.

## Owner commands (prepared by T-086, 2026-11-26)
Placeholders only; real values stay in your shell and in `docs/private/`.
The environment is the server's: `FRESHDESK_DOMAIN`, `FRESHDESK_API_KEY`,
and `FRESHDESK_MCP_CONFIG` pointing at the private team file, whose
`toolsets` include `send` and whose `forward_allow_list` holds the
internal addresses. `FRESHDESK_HOST_OVERRIDE` unset. Check first that no
`TO`, `TICKET` or `TICKET_CC` is exported in your shell (`env | grep -E
'^(TO|TICKET|TICKET_CC)='` prints nothing): make reads them too.

1. Reply (C5, A1, A4's "no CC" side): `make smoke-send CASE=reply TICKET=<ticket id>`
2. Forward (C4, A2, A5): `make smoke-send CASE=forward TICKET=<ticket id> TO=<allow-listed internal address>`
3. Public note (OD-26, A3): `make smoke-send CASE=public-note TICKET=<ticket id>`
4. A4 run, on the ticket whose only ticket-level CC is another allow-listed internal mailbox: `make smoke-send CASE=reply TICKET=<A4 ticket id> TICKET_CC=allow-listed`

Each prints yes/no and counts only. A run that sent ends `smoke send <case>: ok, requests 2`; step 1's line must say `requests 0`. Step 3's last step line says `answered private no` when Freshdesk kept the note public (A3 yes); `yes` or `unknown` exits 1 and is A3's answer. A `may_have_been_sent yes` failure: check the ticket's conversation before running again. After each run: check which mailboxes received mail and read the ticket's activity log.

---
*Filled at `/handoff`:*

## Done
Runs by the owner on 2026-11-26, four `mcp-test` tickets made by the
owner in the UI (none spam, group set, no ticket-level CC but the A4
ticket's one). Ids, addresses and mail text in `docs/private/account-facts.md`
"T-087 test tickets" and "T-087 runs". Each run printed `ok, requests 2`
(one GET, one POST answered 201), step 1 `not sent yes, send_id yes`.

- C5 reply: yes (2026-11-26).
- C4 forward: yes (2026-11-26).
- Public note (OD-26): yes (2026-11-26), `answered private no`.
- Mail reached only the expected internal mailboxes: yes (2026-11-26).
  Reply: the requester only. Forward: the one `TO` only. Public note: no
  mailbox. A4 reply: the requester and the ticket's CC, as designed.
- No automation rule acted: yes, from the activity log after the reply,
  the forward, the public note and the A4 reply (owner, 2026-11-26).
- A1: yes, `POST /tickets/{id}/reply` answered 201.
- A2: yes, `POST /tickets/{id}/forward` answered 201.
- A3: yes, `POST /tickets/{id}/notes` answered 201 and the note stayed
  public.
- A4: yes. The ticket-level CC mailbox received a reply sent with an
  empty `cc`: Freshdesk copies ticket CCs on a reply. This is the case
  OD-21 guards against, so its consequence is as stated, not smaller.
- A5: yes for the description. The forward quotes it under the agent's
  signature. Not checked: conversation and private notes, because the
  ticket had neither. Reply and status: no status change seen (Open
  after the reply; Open was the UI form's default, not read back before
  the run).
- A6: yes. The GET with `include=requester` carried all four CC fields
  as lists, and the tags, `spam` and the requester's email (all four
  tickets).
- No account value in this file. `make quality` green on this tree.

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
