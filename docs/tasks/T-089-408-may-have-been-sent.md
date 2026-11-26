# T-089 — A 408 after a send's dispatch is `may_have_been_sent`

- **Type:** build
- **Phase:** M3
- **Status:** done (2026-11-26)
- **Depends on:** T-084
- **Created:** 2026-11-26

Created by the owner's decision of 2026-11-26 (via the orchestrator), which answers T-084's open doubt: a 408 after a send's POST was dispatched counts as `may_have_been_sent`; a 409 stays as today (the `send_id` spent, not `may_have_been_sent`). Applies to every send entry (reply, forward, public note). Runs before T-085 and T-088, so both reuse the rule.

## Goal
A send that Freshdesk answers 408 (request timeout) after the POST left is reported `may_have_been_sent: true`, as a 5xx or a network error is; a 409 is not.

## In scope
- An amendment to RFC `2026-11-26-send-safety-core` (OD-27's list extended to 408 only), recorded in its "Amendments" section as OD-33's was (`a6ee82e`), with `rfc-reviewer` run on it, before any code.
- `sendFailed` in `src/tools/toolsets/send/reply-to-ticket.ts`, the one failure rule the send tools share (T-085 and T-088 reuse it).
- The docs that state the rule: `docs/architecture/overview.md`, PLAN's OD-27 row.

## Out of scope
- `src/core/**`: the core already keeps a `send_id` spent on any dispatched attempt, a 408 and a 409 included (OD-33); no core change.
- `src/client/errors.ts`'s mapping (a 408 stays `validation`).
- `forward_ticket` (T-085), `add_public_note` (T-088).

## Spec sections to read
- RFC `2026-11-26-send-safety-core`, OD-27 and OD-33

## Files expected to change
- `docs/rfc/active/2026-11-26-send-safety-core.md`
- `src/tools/toolsets/send/reply-to-ticket.ts`
- `test/tools/send/reply-to-ticket.test.ts`
- `docs/architecture/overview.md`, `docs/tasks/PLAN.md`

## Wireframes
`none`

## Acceptance
The RFC amendment is recorded in `2026-11-26-send-safety-core`'s "Amendments" (owner, 2026-11-26), with `rfc-reviewer`'s findings resolved; tests written first and shown failing: in `test/tools/send/reply-to-ticket.test.ts` (MockAgent, the one send entry the code has today, `reply_to_ticket`), a 408 after the POST was dispatched gives `may_have_been_sent: true`, `retryable: false`, one POST; a 409 gives no `may_have_been_sent`, the `send_id` spent, one POST; `make quality` green.

---
*Filled at `/handoff`:*

## Done
- `2cada3c` RFC `2026-11-26-send-safety-core`: "Amendments" bullet "OD-27 extended to 408 only" (owner, 2026-11-26), OD-27's bullet and OD-33's spent-id sentence aligned; `rfc-reviewer` run on the draft: 2 medium (OD-33 still called a 409 "no proof", the 409 rejection then contradicting it: OD-33 reworded to "one rule, no release by status"; "every send tool through `sendFailed`" untrue today: reworded to `reply_to_ticket` today, T-085 and T-088 must use the same rule), 4 low (429 never on the list; the 408 reason grounded and why it is not an A-assumption; "no change" added to Rejected; T-084 doubt cited by file and `82c8242`), all resolved before any code. Same commit: this task file, PLAN row (before T-085; T-085 and T-088 depend on it), OD-27 row's answer, `docs/architecture/overview.md`.
- `775053d` `sendFailed` (`src/tools/toolsets/send/reply-to-ticket.ts`): a 408 after dispatch is `may_have_been_sent: true`; a 409 unchanged. Tests written first and shown failing on `2cada3c`'s `src/` (2 failed, 33 passed): `test/tools/send/reply-to-ticket.test.ts` "a 408 is may_have_been_sent: a request timeout is no proof nothing was sent", "a 409 is Freshdesk's refusal: not may_have_been_sent, the send_id spent", "a 408 with no attempt dispatched is passed on; after a dispatch it is may_have_been_sent".
- Handoff commit: the 409 test's second confirm asserts the "already used" refusal (code-reviewer low); T-084's open doubt marked resolved; one finding parked in `docs/improvements.md` (`775053d`).
- `make quality` exit 0: Vitest 55 files, 4647 tests passed; `tools/checks` 138 tests OK.

## Dead ends
none

## Open doubts
- Whether Freshdesk (or anything in front of it) ever answers 408 after taking a POST is unchecked; the rule errs on the safe side either way (RFC amendment).
- `sendFailed`'s text says "The reply may have been sent": T-085 must generalise it for a forward (and T-088 for a public note) while keeping the 408 rule.

## Context pressure
low

## Next action
none (done).
