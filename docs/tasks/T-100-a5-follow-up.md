# T-100 — A5 follow-up on `mcp-test` tickets (owner action)

- **Type:** spike
- **Phase:** M3
- **Status:** doing (2026-11-27)
- **Depends on:** T-087
- **Created:** 2026-11-26 (proposed); sized `todo` by the owner 2026-11-27

## Goal
Close A5's two open halves left by T-087: whether a forward quotes the
ticket's conversation and private notes (OD-29), and whether a reply
changes the ticket's status, each with a check that can fail.

## In scope
- Owner: one `mcp-test` ticket as in T-087 (internal requester on the
  allow-list, no ticket-level CC, group `MCP Test`, not spam), holding,
  before any run, one private note whose text contains the marker
  `T100-PRIVATE-NOTE` and one public reply (agent, from the UI) whose
  text contains `T100-PUBLIC-REPLY`.
- Owner: one `make smoke-send CASE=forward` on it; search the received
  mail for each marker.
- Owner: read the ticket's status in the UI, then one `make smoke-send
  CASE=reply` on it, then read the status again.
- Owner: read the activity log after each run (no automation acted).
- Results in `docs/private/account-facts.md` (gitignored); this task
  file holds yes/no lines only.

## Out of scope
- Whether a public note notifies ticket CCs (T-087's last open doubt).
- Any code change: the smoke script is used as T-086 built it.
- Production tickets; any address outside the allow-list.

## Spec sections to read
- SPEC.md §11 (Real-account checks)
- RFC `2026-11-26-send-safety-core`: A5, OD-29

## Files expected to change
- `docs/private/account-facts.md` (gitignored)
- this task file
- `docs/tasks/PLAN.md` (status)

## Wireframes
`none`

## Acceptance
"Done" lists, with dates: one yes/no line "forward quotes the private
note" (marker `T100-PRIVATE-NOTE` found in the forwarded mail or not);
one yes/no line "forward quotes the conversation" (marker
`T100-PUBLIC-REPLY`); one line with the status read before and after
the reply run and whether it changed; one line "no automation rule
acted" from the activity log after each run; each run printed
`ok, requests 2`; no account value in any tracked file (commit hook
passes); `make quality` green.

No split point. Needs the owner's actions throughout.

## Owner commands (2026-11-27)
Placeholders only; real values stay in your shell and in `docs/private/`.
Environment as T-087: `FRESHDESK_DOMAIN`, `FRESHDESK_API_KEY`,
`FRESHDESK_MCP_CONFIG` on the private team file (`toolsets` with `send`,
`forward_allow_list` with the internal addresses),
`FRESHDESK_HOST_OVERRIDE` unset; `env | grep -E '^(TO|TICKET|TICKET_CC)='`
prints nothing.

0. In the UI, on the new `mcp-test` ticket: add a private note containing
   `T100-PRIVATE-NOTE`, then a public reply containing
   `T100-PUBLIC-REPLY`. Order matters: both must exist before step 1.
1. Forward: `make smoke-send CASE=forward TICKET=<ticket id> TO=<allow-listed internal address>`.
   In the `TO` mailbox, search the forwarded mail for each marker. Read
   the activity log.
2. Read the ticket's status in the UI and note it.
3. Reply: `make smoke-send CASE=reply TICKET=<ticket id>`.
4. Reload the ticket, read the status again. Read the activity log.

Each run must end `smoke send <case>: ok, requests 2`. A
`may_have_been_sent yes` failure: check the conversation before running
again.

---
*Filled at `/handoff`:*

## Done
Runs by the owner on 2026-11-27, two `mcp-test` tickets made by the owner
in the UI (each marked spam by Freshdesk at creation and restored at
once; no ticket-level CC; group set). Ids, addresses and mail text in
`docs/private/account-facts.md` "T-100 step 0" to "T-100 step 2-4".

- Forward quotes the private note: no (2026-11-27). Marker
  `T100-PRIVATE-NOTE` absent from the forwarded mail, text and HTML.
- Forward quotes the conversation: no (2026-11-27). Marker
  `T100-PUBLIC-REPLY` absent. The forward quotes the ticket description
  only, as T-087's A5 found. OD-29 answered for this account: a forward
  carries no reply and no private note.
- Reply changes the status: no (2026-11-27). Status Aperto before and
  Aperto after the reply, on a second ticket (see Dead ends); the
  activity log shows no status-change entry. The check could fail: the
  status was read before the run.
- No automation rule acted: yes (2026-11-27), from the activity log
  after the forward and after the reply (system SLA policy at creation
  only).
- Both runs that sent printed `ok, requests 2` (one GET, one POST
  answered 201); step 1 `not sent yes, send_id yes, requests 0`.
- A5 is now yes in full, with T-087's description half.
- No account value in this file; commit hook and `make quality` at
  handoff (HANDOFF "Checkpoint").

## Dead ends
- The reply on the forward's ticket: `make smoke-send CASE=reply` refused
  it (`ticket: refused (fwd_emails not empty)`, requests 1, nothing
  sent). The forward put its `TO` in the ticket's `fwd_emails`, and
  T-086's A6 guard refuses any non-empty CC field, as designed. The reply
  ran on a fresh ticket instead.

## Open doubts
- A forward leaves its recipients in the ticket's `fwd_emails`. Whether
  a later reply copies `fwd_emails` is not checked; if it does, a reply
  after a forward reaches the forward's recipients, unseen in the
  approval prompt (the same class as A4, which the owner accepted on
  2026-11-27).
- On the second ticket the status was read at 09:53, before the restore
  from spam at 09:54; the log has no status-change entry, so it was
  Aperto at the reply.

## Context pressure
low

## Next action
none
