# T-007 — HTTP retries + pagination iterator

- **Type:** build
- **Phase:** M0
- **Status:** done (2026-11-23)
- **Depends on:** T-006
- **Created:** 2026-11-20

## Goal
Reads retry safely, writes never repeat, and lists page through `Link` with a hard cap.

## In scope
- Read/write decided **by method**: only GET and HEAD are reads; everything else is a write. No caller flag.
- Reads: retry on 429/5xx/network, max 3 retries (4 attempts), backoff and waits from the limiter (T-005).
- Writes: retry on 429 only, waiting as the limiter says (a bounded default when `Retry-After` is absent); never on 5xx, network error or timeout.
- Async iterator following `Link`; every page URL goes through the T-006 send function (host check); caller sets max pages/items.

## Out of scope
- Resource modules (T-008).

## Spec sections to read
- SPEC.md §7.1

## Files expected to change
- `src/client/http.ts`
- `test/client/http-retry.test.ts`, `test/client/paginate.test.ts`

## Wireframes
`none`

## Split point
(a) retries, (b) pagination — take (a) alone if (b) does not fit.

## Acceptance
MockAgent call counts: a read on 503 is attempted 4 times then fails `server`; a read on a network error is retried; a POST/PUT on 503 and on a network error or timeout is sent exactly once; a write on 429 is retried after the limiter's wait; the iterator follows `Link` across 3 pages, stops at the cap, and refuses a `Link` to a foreign host with no request sent; `make quality` green.

---
*Filled at `/handoff`:*

## Done
- `f8f5d80`: `src/client/http.ts`: a 10 s timeout on every attempt in
  `request`, `HttpClient.requestWithRetry`, `HttpClient.paginate`;
  `docs/architecture/overview.md`. `6d4013a`: review fixes.
- Acceptance, in `test/client/http-retry.test.ts`:
  - read on 503: `attempts a GET on 503 four times, then fails with server`;
  - read on a network error: `retries a GET on a network error`, `attempts
    a GET on a network error four times, then fails with network`, `retries
    a GET that timed out`;
  - write sent once: `sends a %s on 503 exactly once`, `sends a %s on a
    network error exactly once`, `sends a %s that timed out exactly once`
    (POST, PUT, DELETE each), `stops a %s that gets a 503 after a 429`,
    `stops a POST that times out after a 429`;
  - write on 429: `retries a %s on 429 after the limiter's wait`.
- Acceptance, in `test/client/paginate.test.ts`: `follows Link across three
  pages and ends when there is none`; `stops at the page cap with a Link
  still to follow`, `stops at the item cap and cuts the last page to it`;
  `refuses a Link to %s with no request sent` (4 rows).
- Parked at planning (`docs/improvements.md`, entry `6850f30`) and done
  here: DELETE in every write test, the attempt count for a read on a
  network error.
- Hand mutations, each caught by a test (2026-11-23): writes treated as
  reads, no abort signal, no backoff, a fifth attempt, a limiter refusal
  asked again, item cap off, page cap off, a write's failure left
  retryable, the method not pinned in `paginate`, caps unchecked, anything
  retried once a 429 was seen.
- `make quality` exit 0: vitest 331 passed in 8 files. `make build` exit 0.
- Split point not needed: (a) and (b) both fit.
- Not done from "In scope": no "bounded default" wait on a 429 without
  `Retry-After` (see "Open doubts"); HEAD is not a method `HttpRequest`
  has, so only GET is a read.

## Dead ends
none

## Open doubts
- **Owner to decide, both raised as Medium by `code-reviewer`:**
  - **No total deadline.** One `requestWithRetry` can take about 103 s
    (4 attempts of up to 15 s limiter wait and 10 s timeout, 3.5 s of
    backoff); a GET against a server that never answers takes 43.5 s. That
    may be longer than an MCP client waits, and a write still waiting on a
    429 could land after the client gave up. Parked, not built.
  - **A 429 without `Retry-After`, or with one above 15 s, is not retried**,
    read or write: the limiter holds 60 s by default, above its 15 s bound,
    so its refusal is returned (`rate_limited`, `http_status: null`,
    `retry_after_s`). "In scope" asked for a bounded default wait instead.
    Pinned by `test/client/http-retry.test.ts::without a Retry-After the
    limiter holds for its 60 s default: nothing more is sent`.
- Builder's choices, not yet the owner's:
  - The timeout is in `request` (`REQUEST_TIMEOUT_MS`, 10 s, headers and
    body together), not on the Agent; this closes T-006's doubt on where.
    The response body still has no size cap.
  - `request` stays one attempt and public; retries are the separate
    `requestWithRetry`. **T-008 onwards call `requestWithRetry` or
    `paginate`, never `request`**: `request` still reports a write's 5xx,
    network error or timeout as `retryable: true`.
  - Through `requestWithRetry` a write that failed on a 5xx, a network
    error or a timeout is `retryable: false`, which SPEC §7.1's error shape
    does not say.
  - The backoff (0.5 s, 1 s, 2 s, no jitter) sleeps in `http.ts`; the
    limiter owns only the rate-limit waits.
  - `paginate` yields one `HttpResult` per page and gives **no sign that it
    stopped at a cap with more to fetch**: a caller cannot tell a cut list
    from a whole one. T-009 and the tools will need that.
  - The item cap counts only array bodies; a list wrapped in an object is
    bounded by pages alone.
  - A bad cap throws a `TypeError` at the first `next()`.
- SPEC §7.1 names no timeout and no HEAD: out of sync with what was built.
- `code-reviewer` made one Bash call in the scoped round (a read-only `git
  grep`, which it reported itself), against rule 8 and its dispatch.
- Parked from both rounds: `docs/improvements.md`, the two entries stamped
  `6d4013a`.

## Context pressure
ok
