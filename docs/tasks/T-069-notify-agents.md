# T-069 — Notify recipients by agent id

- **Type:** build
- **Phase:** M2
- **Status:** done (2026-11-26)
- **Depends on:** T-068
- **Created:** 2026-11-25

## Goal
The note entries take agent ids to notify; the core fetches each agent's work email at write time, one GET per distinct id, and refuses the whole write, nothing sent, when any recipient cannot be resolved (RFC invariant 4).

## In scope
- De-duplicate ids, then cap (OD-14, owner 2026-11-25: cap 10); calls counted in `api_calls_used`.
- Refused with the whole write: an unknown id (404), a 5xx, a timeout, `rate_limited`, a null or empty email (`docs/improvements.md` `c928102`), an agent not clearly active, fail closed (`a9b7aa9`; OD-14, owner 2026-11-25), more ids than the cap, an id not a positive safe integer.
- No email kept by the core after the write.

## Out of scope
- Mail to people outside Freshdesk (`forward_ticket`, M3).

## Spec sections to read
- RFC `2026-11-25-write-safety-core`, Decision, invariant 4
- SPEC.md §3 (C4, C6)

## Files expected to change
- `src/core/write-path.ts`
- `test/core/notify.test.ts` (new)

## Wireframes
`none`

## Acceptance
`test/core/notify.test.ts` (MockAgent): ids `[3, 3, 5]` give two GETs and a note whose `notify_emails` holds the two fixture emails, `api_calls_used` counting them; exactly 10 distinct ids are accepted, and 11 ids that de-duplicate to 10 are accepted; no ids sends the note with no `notify_emails` key and no GET; each of unknown id, 5xx, timeout, `rate_limited`, null email, empty email, deactivated agent, an agent record with the active flag missing or not a boolean, 11 distinct ids, id 0 or non-integer refuses the whole write with no POST sent; `make quality` green.

No split point.

---
*Filled at `/handoff`:*

## Done
- `a57ef9b`: note entries take `notify` (agent ids): copied once, each a positive safe integer, de-duplicated, capped at `NOTIFY_CAP` 10; one `getAgent` GET per distinct id; whole note refused, no POST, on a failed lookup, an agent not clearly active or an email not one plain address (`EMAIL`, the `85f48fd` shape item); lookups counted in `attempts`; an invalid ticket id spends no lookup. `src/core/write-path.ts`, `docs/architecture/overview.md`.
- `762d34a`: full-round fixes: lookups through the GET-only view; `EMAIL` refuses `\p{Cc}`, `\p{Cf}` and `:[]\`; a non-number `deadline` refused in `noteWrite`; header and overview no longer claim the addresses never reach the caller.
- Tests: `test/core/notify.test.ts` (43 cases): "notify: resolved recipients" (`[3, 3, 5]`, 10 ids, 11 that de-duplicate to 10, no ids, POST failure counted), "notify: a recipient that cannot be resolved refuses the whole write" (404, 5xx, timeout, `rate_limited`, null/empty/malformed email, deactivated, active flag missing or not a boolean), "notify: ids refused before any request" (11 ids, 0, non-integer, string, NaN, 2^53, not a list, hole, throwing Proxy, invalid ticket id, copy-once Proxy, bad deadline).

## Dead ends
none

## Open doubts
- The note answer may echo the resolved recipients to the caller (`docs/improvements.md` `a57ef9b`): T-072 and T-074 must not return them; unchecked against a documented or mocked answer.
- A note to a ticket that does not exist spends its agent lookups before the POST 404s (bounded by the limiter); whether to probe the ticket first is the owner's call (`a57ef9b`).

## Context pressure
ok

## Next action
none (done).
