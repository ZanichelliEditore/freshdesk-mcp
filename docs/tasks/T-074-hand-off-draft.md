# T-074 — Tool: `hand_off_draft`

- **Type:** build
- **Phase:** M2
- **Status:** done (2026-11-26)
- **Depends on:** T-072, T-041
- **Created:** 2026-11-25

## Goal
`hand_off_draft` does C6 in one call: a private note headed `DRAFT REPLY`, then the ticket assigned to an agent and/or group, the agents notified.

## In scope
- Note first, then PUT (an assignment with no note hands off nothing; builder's call, `docs/improvements.md` `c928102`).
- If the PUT fails after the note was written, the result says so with the note's id; no automatic retry, no rollback.
- Its entry's set: group, agent only.
- Nothing to assign: the note only, no PUT (the core refuses an empty ticket change since `254bcae`; added by the `/decompose M2` amendment of 2026-11-26).

## Out of scope
- Freshdesk's UI reply draft (not in the public API, SPEC §3).
- No release with `write` before T-074 is `done` (OD-16, owner 2026-11-25).

## Spec sections to read
- SPEC.md §8.2
- SPEC.md §3 (C6)
- RFC `2026-11-25-write-safety-core`, invariants 4 to 6

## Files expected to change
- `src/tools/toolsets/write/hand-off-draft.ts` (new), `index.ts`
- `test/tools/write/hand-off-draft.test.ts` (new)
- `CHANGELOG.md`

## Wireframes
`none`

## Acceptance
`test/tools/write/hand-off-draft.test.ts` (MockAgent): one POST (private, body starting with the `DRAFT REPLY` header, notify emails) then one PUT (group/agent); a note refused sends no PUT; a PUT failing after the note returns a result naming the written note and the failed assignment, no retry; a field outside group/agent `field_not_writable`; with nothing to assign (no agent and no group) it posts the note only and sends no PUT, because the core refuses an empty ticket change; `make quality` green.

No split point.

---
*Filled at `/handoff`:*

## Done
- `ae54d0a`: `src/tools/toolsets/write/hand-off-draft.ts` (new), wired in
  `write/index.ts` with `entries.hand_off_draft`; `add_note` returns an error
  naming the `note_id` when Freshdesk answers `private: false` (owner,
  2026-11-26), `publicNote` shared. No change to `src/core`.
- `d8f274e`: full-round fixes. After the note, an assignment error is
  `retryable: false`, says whether a sent PUT may have landed and points at
  `update_ticket`; a note POST answered `server`/`network` says the note may
  have been written (`noteFailed`, both tools); more than 10 field problems
  are counted.
- Acceptance, `test/tools/write/hand-off-draft.test.ts` (38 cases, MockAgent):
  "sends one private POST headed DRAFT REPLY with the notify emails, then one
  PUT of group and agent"; "a ticket that does not exist: the POST's
  not_found, no PUT"; "a 5xx: one PUT, no retry, the error names the written
  note and the failed assignment"; "refuses %s as field_not_writable, with
  nothing sent"; "with %s, posts the note only: no schema load, no PUT";
  "returns only the allow-listed fields when the note answer echoes every
  address it can"; "a note answered private: false is an error naming the
  note_id, saying it is public; no PUT".
- `test/tools/write/add-note.test.ts` "add_note: a note Freshdesk answers as
  public"; `test/server.test.ts` "the write wiring" lists `hand_off_draft`.
- `make quality` exit 0 on `d8f274e`: Vitest 3970 passed, `tools/checks` 138
  OK. No version bump or tag (OD-16 allows one now; the release is the
  owner's go).
- Owner decision (2026-11-26, via the orchestrator), closing the open doubt
  below: `hand_off_draft` keeps checking agent and group only at the
  assignment. A mistyped name posts the note and returns an error with the
  `note_id`, saying to finish with `update_ticket`. Accepted as a documented
  limit; may be revisited after T-076 (improvements `ae54d0a`).

## Dead ends
- A MockAgent 429 or 5xx on every attempt for the PUT, or a 5xx for the
  schema load, took 3 s or more per test (the client's retries and pacing),
  close to Vitest's 5 s timeout. Replaced by a fake-entry handler test and a
  401 schema load.

## Open doubts
- A mistyped agent or group value is found only at the PUT, after the note
  is posted and the agents emailed: `ticketInput` is fenced out of
  `src/tools/` (T-077), so the tool checks field names only before the note.
  The error names the `note_id` and says the assignment was not applied.
  Owner question: accept, or let the core's `hand_off_draft` entry check the
  assignment before the note (a change to the core, through `/rfc`)?
  Closed (owner, 2026-11-26): accepted as a documented limit, see "Done".
- `fields: {agent: null}` clears the agent in the hand-off PUT (tested); a
  hand-off that only unassigns is allowed.

## Context pressure
ok

## Next action
none (done)
