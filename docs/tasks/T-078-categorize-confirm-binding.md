# T-078 — `categorize_tickets`: confirm bound to the API field name the preview resolved; `may_have_been_applied` as its own result state and count

- **Type:** build
- **Phase:** M2
- **Status:** done (2026-11-26)
- **Depends on:** T-073
- **Created:** 2026-11-26

## Goal
A `categorize_tickets` confirm writes only the fields the approved preview
resolved, by API name: a field relabelled or added inside the 15 minutes
refuses the confirm instead of writing another custom field. A write sent
without a clear answer is its own result state and count,
`may_have_been_applied`, no longer counted in `refused`.

## In scope
- Source: `docs/improvements.md` `3a2ba75` and `3b3bec6` (owner-approved
  2026-11-26).
- Preview: after `findField`, rewrite each read item's keys to the resolved
  `field.name` (values kept, each read once into a plain object, so the
  `70be151`/`f64d743` guarantee holds) and mint the `preview_id` over those
  items. The `tickets` table is unchanged.
- Confirm: `itemsRefusal`, the `preview_id` presence check, then the schema
  load; resolve each confirm key with `findField` against that schema. An
  unknown, ambiguous or not-writable field, or two keys on one API name,
  refuses the whole confirm ("Not applied … preview again"), 0 PUTs. Then
  `checkPreviewId` on the rewritten items; the writes use `checked.items`
  (API-name keys). A label now on another field resolves to another API
  name, so no tag matches and the confirm is refused.
- The caller's contract stays "confirm with the previewed items": a field
  named by label or by API name is the same field.
- Result state `may_have_been_applied` (a PUT sent, `attempts > 0`, answered
  `network` or `server`: a timeout, a 5xx, a 3xx, a 2xx of another shape),
  with its error; the count `may_have_been_applied` beside `written`,
  `refused` and `not_attempted`; the note and the description updated.
- Tests from `3b3bec6`: a sent PUT answered 2xx with a body of another
  shape, and a 3xx, each land in `may_have_been_applied`.
- The header comment (lines 34-35 say "checked first, no request before":
  the schema load now precedes the id check), the tool description,
  `docs/tool-catalogue.md`, `CHANGELOG.md`.

## Out of scope
- Refusing a second confirm of a `may_have_been_applied` ticket within the
  15 minutes: needs server state (OD-15), owner call; stays parked in
  `3b3bec6`.
- The shared field-key helper for `findField` and `hand-off-draft.ts`
  `fieldProblems` (`ae54d0a`): still two callers.
- `hand_off_draft`'s assignment check before the note: owner decision
  2026-11-26, a documented limit (T-074's task file).
- Any change to `src/core/**` (the write path) or `src/tools/preview.ts`. If
  the binding seems to need one, stop and raise it (AGENTS.md rule 1).

## Spec sections to read
- SPEC.md §8.2 (`categorize_tickets` row)
- SPEC.md §9 (bulk changes row)

## Files expected to change
- `src/tools/toolsets/write/categorize-tickets.ts` (`preview`, `apply`,
  header, description)
- `test/tools/write/categorize-tickets.test.ts`
- `docs/tool-catalogue.md`
- `CHANGELOG.md`
- `docs/architecture/overview.md` and `test/server.test.ts` only if they
  state the confirm order, the result states or the description text

## Wireframes
`none`

## Acceptance
`test/tools/write/categorize-tickets.test.ts` (MockAgent; regression tests
written first and shown failing on `34188f2`'s `src/`): the preview mints
its `preview_id` over each field's API name, and the confirm resolves its
keys against the schema loaded at confirm and checks those API names; with
the schema changed between preview and confirm (the stub-context pattern
the test file already uses), a label now on another custom field, a label
now naming two fields, and a field removed each refuse the whole confirm as
`validation` with 0 PUTs; a confirm naming a field by API name where the
preview used its label writes, and the entry receives API-name keys; a PUT
sent and answered 5xx, network, a 2xx of another shape or a 3xx gives
`result: "may_have_been_applied"` with its error, counted in
`may_have_been_applied` and not in `refused`, and `written + refused +
may_have_been_applied + not_attempted` equals the confirmed items; the
header, description and `docs/tool-catalogue.md` say both; `src/core/**`
and `src/tools/preview.ts` unchanged; `make quality` green.

Split point: the result state and count first (output only, its own
commit), the confirm binding second. If the session runs long, stop after
the first commit and propose the binding as its own row.

---
*Filled at `/handoff`:*

## Done
- `edca65b`: result state and count `may_have_been_applied` (split point,
  its own commit). Tests in `test/tools/write/categorize-tickets.test.ts`:
  "a PUT sent and answered 5xx, or cut by a network failure, is
  may_have_been_applied, not refused", "a PUT answered 2xx with a body of
  another shape, or 3xx, is may_have_been_applied"; `countsAddUp` (sum and
  rows per state) in the write, 404 and deadline-cut tests.
- `072dd91`: confirm bound to the API name. Tests in the same file, describe
  "the confirm is bound to the API names the preview resolved": API-name
  confirm after a label preview writes; the entry receives API-name keys;
  relabel to another field, label on two fields, field removed each refuse
  as `validation` with nothing written; two keys on one field and a
  not-writable field refuse. "the confirm writes only the checked values"
  now mints over `ticket_type`.
- Regression tests shown failing before each change (5, then 7 failing;
  binding code as at `34188f2`, `src/core/**` and `src/tools/preview.ts`
  unchanged since `34188f2`).
- Review fixes (handoff commit): relabel test pins the tag check
  (`errors` undefined), CHANGELOG wording on an added field, the note's
  wording.
- Owner decision (2026-11-26): a second confirm of a `may_have_been_applied`
  ticket is not refused (OD-15); improvements `3b3bec6` marked DECIDED.

## Dead ends
none

## Open doubts
- A bogus `preview_id` with a cold schema cache now costs the schema load
  (about 3 read-only GETs) before it is refused, and the refusal reports no
  `api_calls_used`: the id cannot be checked before the keys are resolved.
  A form check first would need a `src/tools/preview.ts` export (parked,
  improvements `072dd91`).

## Context pressure
ok

## Next action
none (done).
