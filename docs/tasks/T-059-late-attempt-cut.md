# T-059 — A late request with no time left to retry is a cut, not a failure

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-25)
- **Depends on:** T-057
- **Created:** 2026-11-25

## Goal
A later request of `count_tickets` or `export_tickets` that fails with no
answer when no retry can start before the call's 30 s deadline cuts the
read (`truncated: true`, the rows read kept) instead of failing the call.
Found 2026-11-25 while fixing CI in `1d51e20` (`docs/journal.md`, T-057): a
page started between about 19.5 s and 20 s times out (10 s an attempt) as a
plain `network` at 29.5–30 s, before the deadline, no backoff fits, and
`isCut` (`network` only at or past the deadline) fails the call. The same
when a first attempt at 8.5–9.5 s fails and its retry hangs. It fails safe
(no wrong data), but loses the rows read.

## In scope
- The HTTP client (`requestWithRetry`) marks a GET's `network` failure
  that no retry can follow before the deadline as the deadline's expiry,
  a mark the client alone sets, beside the expiry errors it already
  returns; `isCut` takes a `network` error as a cut only with that mark.
- Tests: a page started at 19.6 s that hangs is a cut in `count_tickets`
  and `export_tickets`; a first attempt at 9 s that fails and a retry that
  hangs is a cut; a `network` error at 5 s with time left still fails the
  call; the mark at the client level.
- `docs/architecture/overview.md` and the tools' descriptions or headers
  where they state the cut's causes.

## Out of scope
- A `server` (5xx) answer with no time left to retry: an answer, still a
  failure.
- What counts as a cut otherwise (the limiter's refusal, the budget, the
  caps, SCAN_START_MS): unchanged.
- The error's shape in tool output: unchanged (the mark is not a field).

## Spec sections to read
- SPEC.md §7.1
- SPEC.md §7.2

## Files expected to change
- `src/client/http.ts`
- `src/tools/toolsets/core/count-tickets.ts`
- `src/tools/toolsets/core/export-tickets.ts` (header, if it states the causes)
- `test/client/http-retry.test.ts`
- `test/tools/core/count-tickets.test.ts`
- `test/tools/core/export-tickets.test.ts`
- `docs/architecture/overview.md`

## Wireframes
`none`

## Acceptance
`test/tools/core/count-tickets.test.ts` and `test/tools/core/export-tickets.test.ts` (MockAgent, `test/support/slow-replies.ts`): a later page started at 19.6 s that hangs gives the rows read and `truncated: true`, not an error; a later page whose first attempt at 9 s fails and whose retry hangs is a cut too; a later page failing `network` at 5 s on every attempt, with time left, still fails the call as `network`; `test/client/http-retry.test.ts`: a GET `network` failure that no retry can follow before the deadline carries the client's expiry mark, and one that exhausts its retries with time left does not; the existing deadline tests still pass; `make quality` green.

---
*Filled at `/handoff`:*

## Done
- `b599dd2` task and status doing; `68453a8` the fix; `c4d8548` full review
  fix (only a GET's expiry is marked); this commit (lists B parked, done).
- Acceptance, line by line:
  - 19.6 s page that hangs is a cut: `test/tools/core/count-tickets.test.ts`
    "a later page started at 19.6 s that hangs is a cut…",
    `test/tools/core/export-tickets.test.ts` "a later search page started
    at 19.6 s that hangs is a cut…".
  - Attempt at 9 s fails, retry hangs, is a cut: "…whose attempt at 9 s
    fails and whose retry hangs is a cut…" in both files.
  - `network` at 5 s with time left fails the call: "a later page failing
    network at 5 s with time left fails the call" (count),
    "a later search page failing network at 5 s with time left fails the
    call, no file" (export).
  - Client mark: `test/client/http-retry.test.ts` "marks a GET's network
    failure that no retry can follow before the deadline…", "marks a
    network failure with no time left before a caller's deadline too",
    "marks the expiry of a GET in flight at the deadline…"; not marked:
    "does not mark a network failure that used its retries with time
    left", "does not mark a 5xx that no retry can follow…", "does not mark
    a write aborted in flight at a caller's deadline…", "does not mark a
    write refused because its deadline had already passed".
  - Existing deadline tests pass; `make quality` green (2604 tests).
- Red first: the four tool cut tests (`expected true to be falsy`) before
  `68453a8`; the two write tests (`expected true to be false`) before
  `c4d8548`.
- Option (a): the client marks the error (`http.reachedDeadline`, a
  private `WeakSet` in `src/client/http.ts`) and `isCut` asks it, so the
  client stays the one source of "deadline reached"; (b) would have copied
  the backoff arithmetic into the tools. An instance method, like
  `reserveRefusal`, because the tool import allow-list refuses
  `client/http.js`. The error's shape in tool output is unchanged.
- Reviews: full round on `9f7c032..68453a8` (R1 = `68453a8`): compliance
  `none` (no wireframes); security 1 Low + 1 info; code 2 Low (the
  code-reviewer made one Bash call, recorded). The Low both reported
  (`expired()` marked a write's expiry) fixed in `c4d8548`; the info and
  the code note parked in `docs/improvements.md` (stamped `68453a8`).
  Scoped round on `68453a8..c4d8548`: list A empty for all three; lists B
  parked in `docs/improvements.md` (stamped `c4d8548`).

## Dead ends
- A module-level `reachedDeadline` export from `src/client/http.ts`: the
  tool import allow-list (`eslint.tool-imports.json`) refuses
  `client/http.js`, by design; moved to an instance method.
- A client test first gave its first attempt a 19.1 s reply: the 10 s
  attempt timeout cut it, so the attempts shifted; rebuilt as replies at
  9.5 s and 18.6 s, then the hanging attempt at 19.6 s.

## Open doubts
- The write guard in `requestWithRetry` lost its test in `c4d8548`, and
  writes other than POST are not asserted unmarked: parked
  (`docs/improvements.md`, `c4d8548`), not done under rule 9.

## Context pressure
ok

## Next action
none: done.
