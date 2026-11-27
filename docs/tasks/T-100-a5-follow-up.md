# T-100 — A5 follow-up on `mcp-test` tickets (owner action)

- **Type:** spike
- **Phase:** M3
- **Status:** done (2026-11-27)
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
  only, as T-087's A5 found. For one forward on one ticket, under the
  account's configuration on 2026-11-27: a forward carried no reply and
  no private note (OD-29).
- Reply changes the status: no (2026-11-27), for one reply on an Open
  ticket: Aperto before and Aperto after, on a second ticket (see Dead
  ends); the activity log shows no status-change entry. The check could
  fail: the status was read before the run. Other starting statuses
  (Pending, Resolved) not tried.
- No automation rule acted: yes (2026-11-27), from the activity log
  after the forward and after the reply (system SLA policy at creation
  only).
- The two runs that sent printed `ok, requests 2` (one GET, one POST
  answered 201), and the confirm-less first call of each `not sent yes,
  send_id yes, requests 0`. The acceptance's "each run" is not met as
  written: a third run, on the forward's ticket, was refused by the smoke
  script with `requests 1` and sent nothing (Dead ends).
- A5 answered, at the size above: a forward quotes the description only,
  no conversation or private note; a reply on an Open ticket left it
  Open. With T-087's description half.
- Commit `d058501` (results). No account value in this file; the commit
  hook (`account values in the index`, gitleaks) passed on `d058501`.
  `make quality` exit 0 on `d058501`'s tree: Vitest "Tests 4824 passed
  (4824)", `tools/checks` "Ran 138 tests", OK.

## Dead ends
- The reply on the forward's ticket: `make smoke-send CASE=reply` refused
  it (`ticket: refused (fwd_emails not empty)`, requests 1, nothing
  sent). The forward put its `TO` in the ticket's `fwd_emails`, and
  T-086's A6 guard refuses any non-empty CC field, as designed. The reply
  ran on a fresh ticket instead. That guard is the smoke script's only:
  no send entry of the core reads `fwd_emails` (RFC A6), so in
  production the same reply would have been dispatched.

## Open doubts
- **`fwd_emails`, for the owner before T-098.** A forward leaves its
  recipients in the ticket's `fwd_emails`. Whether a later reply copies
  `fwd_emails` is not checked. If it does: (a) the server's own
  `forward_ticket` creates CC state that a later `reply_to_ticket` does
  not check, so a forward to an internal mailbox then a reply to the
  customer shows that mailbox to the customer, unseen in the approval
  prompt; the reply tool's wording "the ticket's existing CC addresses"
  does not suggest the forward's recipients; (b) an agent forwarding from
  the UI to any address adds it to the same set; (c) only the smoke
  script reads `fwd_emails`, the core does not. The owner's 2026-11-27
  answer on A4 (below) covered ticket CCs as Freshdesk standard
  behaviour; whether it covers this too is the owner's call. Checking it
  needs a smoke-script opt-in for a non-empty `fwd_emails`, a change to
  T-086's guard, so through `/rfc`.
- **A4 decided (owner, 2026-11-27, in the T-100 session):** ship with
  ticket CCs copied on a reply accepted, as standard Freshdesk behaviour
  operators know; the owner also wants the CC warning text dropped. The
  warning is in RFC `2026-11-26-send-safety-core` OD-21 and T-083/T-084's
  acceptance, so dropping it is an RFC amendment: proposed T-101.
- The results hold for the account's configuration on 2026-11-27
  (forward and reply templates, status on reply are admin settings). The
  tool descriptions and OD-29 keep their conservative wording
  (`forward-ticket.ts` "possibly its conversation").
- The send RFC's A5 lines and its "If A5's private-note question answers
  yes" sentence are now answered and stale; a dated pointer is left to a
  `/rfc` amendment (T-101 could carry it), not written here.
- On the second ticket the status was read at 09:53, before the restore
  from spam at 09:54; the log has no status-change entry, so it was
  Aperto at the reply.

## Context pressure
low

## Next action
none
