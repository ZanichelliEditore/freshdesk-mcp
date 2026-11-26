# T-082 — Send entry points, built only when `send` is enabled

- **Type:** build
- **Phase:** M3
- **Status:** todo (2026-11-26)
- **Depends on:** T-080, T-081, T-083
- **Created:** 2026-11-26

Sized on T-079's likely answer (PLAN, M3: the OD proposals, and the owner's answers of 2026-11-26 to OD-20, OD-21 and OD-26); its acceptance is re-checked when T-079's RFC is accepted.

## Goal
The write path builds `send` entry points (reply, forward, public note) only when `send` is enabled, each holding the confirm and `send_id` check, the recipient checks and its closed payload key set.

## In scope
- Invariant 3 extended: send entries only with `send` in `toolsets`, independent of `write` (OD-25).
- Without `confirm`: the entry mints a `send_id` with `src/core/send-id.ts` and returns it, nothing sent (OD-32).
- Confirm: a literal `confirm === true` and a `send_id` the core checks against the same tool, ticket, body as sent and recipients; anything else refused, nothing sent (OD-19; OD-20 answered 2026-11-26, owner via the orchestrator); a second confirm per OD-33; no key, verifier or verdict taken from the caller.
- Reply: no `to`, bcc refused, cc via T-081; the ticket's existing CCs are not read or checked (OD-21 answered 2026-11-26, owner via the orchestrator).
- Forward: `to` and `cc` via T-081, bcc refused, cap, `include_original_attachments: false` (OD-22, OD-29).
- Closed payload keys and body escaping (OD-24); an entry never rejects; results per OD-27.
- The public-note entry, `{body, private: false}` (OD-26 answered 2026-11-26: built in M3).

## Out of scope
- The tools (T-084, T-085, T-088); the `send_id` module and the "Not sent" text (T-083).
- Changing any `write` entry.

## Spec sections to read
- T-079's RFC (all invariants)
- SPEC.md §9
- SPEC.md §8.2 (`send`)

## Files expected to change
- `src/core/write-path.ts`
- `src/core/allow-sets.ts` (send key sets, if kept there)
- `test/core/send-entries.test.ts` (new)
- `docs/architecture/overview.md`

## Wireframes
`none`

## Acceptance
`test/core/send-entries.test.ts` (MockAgent): with `write` alone no send entries, with `send` alone send entries and no write entries (OD-25); an entry called without `confirm` mints a `send_id` with `src/core/send-id.ts` over the tool, ticket, body as sent and recipients and returns it with 0 dispatches (OD-32); a send needs `confirm === true` and a `send_id` the core minted for the same tool, ticket, body and recipients (OD-20): a `confirm` not literally `true`, no `send_id`, or a `send_id` minted for another tool, ticket, body or recipient list, edited, under another process's key or past its 15 minutes each give `validation` with 0 dispatches; a second confirm of one `send_id` per OD-33, pinned by a test, with two confirms of one `send_id` started together giving at most one POST; an entry takes no key, verifier or verdict from its caller (asserted on source); a cast-injected `to_emails` on a reply, `bcc_emails`, `from_email`, `user_id`, `attachments`, `incoming`, or `private: false` on a reply or forward never reaches MockAgent's body; a forward always sends `include_original_attachments: false` (OD-29); a `to` or `cc` address off the list refused per field, an empty list refuses everything, over the cap refused, each with 0 dispatches; a reply's cc off the list refused, the ticket's existing CCs not read (OD-21: no GET for them); the public-note entry sends exactly `{body, private: false}` (OD-26, OD-24); an empty body refused, the body escaped per OD-24; an entry never rejects; `make quality` green.

Split point: the reply entry first, the forward and public-note entries second.

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
