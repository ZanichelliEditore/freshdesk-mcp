# T-014 — A write is not started without time to finish

- **Type:** build
- **Phase:** M2
- **Status:** todo (2026-11-23)
- **Depends on:** T-013
- **Created:** 2026-11-23

## Goal
`requestWithRetry` (and `request` with a deadline) does not start a non-GET
attempt that the deadline could cut: it is refused as not sent, safe to
retry. Sized from the `proposed` row of 2026-11-23 (T-013 review,
`docs/improvements.md` `cf4dd28`). Kept as its own row: it is an HTTP-core
mechanism with its own tests, and no tool task should carry it.

## In scope
- The minimum is `REQUEST_TIMEOUT_MS` (10 s), and the refusal is
  `rate_limited` with `retryable: true`: confirmed (owner, 2026-11-23). With
  one full attempt timeout left, only the attempt's own timeout can cut a
  write, never the deadline.
- Checked before `acquire` (no token or pacing slot spent) and again after
  it (`acquire` may have slept).
- T-013's tests of a write aborted at the deadline become unreachable:
  replace them, do not delete the GET ones.
- `docs/architecture/overview.md` line for `http.ts`.
- Must be `done` before the first write resource. May be taken during M1,
  preferably while M1 waits on an owner's run (owner, 2026-11-23).

## Out of scope
- Any change for GET; `paginate`'s total budget.

## Spec sections to read
- SPEC.md §7.1
- SPEC.md §7.2

## Files expected to change
- `src/client/http.ts`
- `test/client/http-retry.test.ts`
- `docs/architecture/overview.md`

## Wireframes
`none`

## Acceptance
`test/client/http-retry.test.ts` (MockAgent, fake clock): a POST with less
than 10 s left before its deadline is not sent (MockAgent count), comes back
`rate_limited` with `http_status: null` and `retryable: true`, and when the
shortfall is known before the limiter is asked the limiter's count is
unchanged; with exactly 10 s left it is sent, with 1 ms less it is not; a
POST held by a 429 whose wait leaves under 10 s is not sent again; no test
can make the deadline abort a non-GET in flight; a GET with 1 s left is
still sent; `make quality` green.

---
*Filled at `/handoff`:*

## Done

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
