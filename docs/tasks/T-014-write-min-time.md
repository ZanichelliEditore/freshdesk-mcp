# T-014 — A write is not started without time to finish

- **Type:** build
- **Phase:** M2
- **Status:** done (2026-11-25)
- **Depends on:** T-047
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
- After T-047: both change `requestWithRetry`, the caller deadline first.

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
- `6e7674f`: `src/client/http.ts` `request` refuses a non-GET with less
  than `REQUEST_TIMEOUT_MS` left as `rate_limited`, `http_status: null`,
  `retryable: true` (`tooLate`): before `acquire`, in the bound `acquire`
  is given (`deadline - REQUEST_TIMEOUT_MS + 1`, the limiter's bound being
  exclusive) and after it. The in-flight expiry is GET-only (`read &&`);
  `expired()` lost its method argument. Header and
  `docs/architecture/overview.md` line updated.
- Tests, `test/client/http-retry.test.ts`, describe "requestWithRetry: a
  write is not started without time to finish": "a %s with 1 ms less than
  10 s left is not sent, nor the limiter asked", "the limiter's count is
  unchanged by a write refused before it is asked" (`reserveRefusal` at 20
  of 100), "a %s with exactly 10 s left is sent", "a POST with exactly 10 s
  left is cut by its own timeout, not by the deadline", "a POST held by a
  429 whose wait leaves under 10 s is not sent again, with no sleep" (and
  "exactly 10 s is sent again"), "a POST the limiter lets go with 1 ms
  less than 10 s left is not sent" (after-check), "a GET with 1 s left is
  still sent".
- T-013's write-expiry tests replaced (GET ones kept): "does not start a %s
  again after a 429 whose hold leaves under 10 s", "does not mark a write
  refused %d ms before its deadline", "one attempt of a %s with 2 s left is
  not sent", "sends no write for a deadline of %d", "a write refused at
  entry was not sent"; two POST cases moved to GET ("a wait that ends one
  millisecond before it is served", "sends nothing when the limiter lets
  the call go with no time left").
- Mutation check: each of six mutations of the new guards (no pre-check,
  plain bound, bound without the 1 ms, old after-check, catch without
  `read`, strict 10 s) fails 1 to 7 tests.
- `5a5274d`: review fixes (message built from `REQUEST_TIMEOUT_MS`, a test
  name, a bait interceptor's comment).
- `make quality`: vitest 2661 passed, `tools/checks` 134 OK.

## Dead ends
none

## Open doubts
- The limiter bound for a write (`deadline - REQUEST_TIMEOUT_MS + 1`) goes
  beyond the task's "checked before and after `acquire`": it refuses a hold
  that would leave under 10 s at once, with `retry_after_s`, instead of
  sleeping through it and spending a token. Owner may judge it.
  **Closed (2026-11-25):** accepted by the orchestrator under the owner's
  delegation; the bound stays.

## Context pressure
ok

## Next action
`/pickup` takes T-040.
