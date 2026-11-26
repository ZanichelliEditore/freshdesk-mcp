# T-068 — Write entry points, built only when `write` is enabled

- **Type:** build
- **Phase:** M2
- **Status:** done (2026-11-26)
- **Depends on:** T-065, T-067
- **Created:** 2026-11-25

## Goal
The core builds one entry point per write tool (`update_ticket`, `categorize_tickets`, `hand_off_draft`'s two writes, `add_note`) only when `write` is in `team.toolsets`; each builds its ticket body through `ticketInput` with its own set, and the note entries build the note payload themselves, private always (RFC invariants 2, 3, 5, 6).

## In scope
- Entries keyed by entry point; registration hands each tool its own entry only (a tool cannot name another's set).
- With `write` absent the core returns no entries object at all.
- Note entries: no `private` input; the core sets `private: true`; the payload is built from a closed key set (body, `private`; `notify_emails` added by T-069); `user_id`, `incoming`, attachments never sent.
- Each refusal `validation`, `http_status: null`, per-field entries where a field is the cause.
- An entry never rejects: a body `write()` cannot snapshot (`JSON.stringify` throws) comes back `validation`, nothing sent; `write()` refuses a snapshot that is not a plain object (top-level `toJSON` returning `null` or a non-object), nothing sent (`docs/improvements.md` `deceac6`, taken 2026-11-26).

## Out of scope
- Notify recipients (T-069).
- Tools and registration in `server.ts` (T-071).
- The lint fence on `HttpClient`, `RateLimiter`, `ticketInput` and re-exports from `src/core/**` (T-077, split from this row 2026-11-26).

## Spec sections to read
- RFC `2026-11-25-write-safety-core`, Decision, invariants 2, 3, 5, 6
- SPEC.md §9
- SPEC.md §8.2 (`write` table)

## Files expected to change
- `src/core/write-path.ts`
- `src/core/resources.ts`
- `test/core/entries.test.ts` (new)
- `test/core/resources.test.ts`
- `docs/architecture/overview.md`

## Wireframes
`none`

## Acceptance
`test/core/entries.test.ts` (MockAgent): without `write` in toolsets the core gives no entries object (and `send` gives none either); each ticket entry sends only fields of its own set, a field outside it `field_not_writable` with 0 dispatches; the note entries have no `private` input and send `private: true`; a cast-injected `private: false`, `user_id`, `incoming` or `attachments` never reaches MockAgent's body; a note entry given a `BigInt` body by a cast (so `write()`'s snapshot throws) resolves to `validation`, `http_status: null`, with 0 dispatches, not a rejected promise; `test/core/resources.test.ts`: a body whose top-level `toJSON` returns `null` or a string is `validation` with 0 dispatches; `make quality` green.

Split point: ticket entries first, note entries second.

Amended 2026-11-26 (`/decompose M2` amendment, owner's decision of 2026-11-25 recorded by the orchestrator): the items parked for T-068 are taken here and in T-077. Here: `deceac6` (the rejected promise and the non-object snapshot). In T-077: `4b2a159`, `087d6ba`, `75ca50f`, `85f48fd` (the re-export).

---
*Filled at `/handoff`:*

## Done
- `0a98b15`: `createWritePath` takes `toolsets` and gives `entries` only with
  `write` (`src/core/write-path.ts`); `write()` in `src/core/resources.ts`
  refuses a body JSON cannot carry and a non-object snapshot as
  `validation`, nothing sent; `src/tools/context.ts` passes the team
  `toolsets` (entries not on the context: T-071).
- `254bcae`: review fixes (note body a string, tags copied once then
  checked, an empty change refused).
- Tests, `test/core/entries.test.ts`: "the entries exist only when write is
  enabled" (`["core"]`, `["core","send"]`, `["send"]` give no `entries`
  key); per ticket entry "sends the fields of its own set…", "refuses the
  default field $name as field_not_writable, sending nothing" (every default
  field outside the set), "refuses a body key outside its set that a forged
  schema builds…", "resolves a value JSON cannot carry…" (cf_hobby `10n`:
  the snapshot throw caught), "refuses a change that sets no field…",
  "does not send tags given by a cast"; "a note entry has no private input
  (make typecheck fails on one)" (`@ts-expect-error`); per note entry
  "sends the body with private: true, and nothing else…", "never sends
  private: false, user_id, incoming, attachments or notify_emails given by a
  cast", "resolves a body that is a BigInt, given by a cast, to validation
  on body, sending nothing" (refused by the string check before the
  snapshot: see Open doubts); `test/core/resources.test.ts` "refuses a body
  whose top-level toJSON returns null / a string / a list / undefined…" and
  "resolves a body holding a BigInt / a cycle / a toJSON that throws…".
  New tests shown failing on the code before each fix (mutation runs in
  session).
- No split was needed.

## Dead ends
none

## Open doubts
- The acceptance's BigInt note case says "so `write()`'s snapshot throws";
  since `254bcae` the note entry's string check refuses it first. The
  outcome the line asks for holds; the snapshot-throw path is proven by the
  `cf_hobby: 10n` ticket case and `test/core/resources.test.ts`. Parked
  (`docs/improvements.md`, `254bcae` entry).
- `createWritePath` trusts the `toolsets` its caller passes (security,
  medium, latent): only `context.ts` calls it, by inspection. Parked for
  T-077 / T-071 (`docs/improvements.md`, `0a98b15` entry).

## Context pressure
ok

## Next action
none (done)
