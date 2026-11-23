# T-006 — HTTP core: request, auth, host check, errors, limiter, safe logs

- **Type:** build
- **Phase:** M0
- **Status:** done (2026-11-23)
- **Depends on:** T-005
- **Created:** 2026-11-20

## Goal
`src/client/http.ts` sends one request correctly through a single send function: undici agent with keep-alive, Basic auth, UA, host check on every URL, no redirects, status → error mapping, limiter fed by response headers, metadata-only logs.

## In scope
- Install `undici` (per T-002); `fetch` source as the T-002 RFC decided.
- One send function every request goes through; it requires `https:` and the default port, and checks the host of **every** URL (built or absolute) against `^[a-z0-9-]+\.freshdesk\.com$`, or equal to the exact override hostname; checked at construction too.
- `redirect: 'manual'`, set by the send function itself, not by callers (RFC 2026-11-23, rules 1, 5): a 3xx is returned unfollowed and mapped to a code with `retryable: false`, so it is never followed with the auth header and never retried.
- `test/support/mock-dispatcher.ts` (a `MockAgent` with `disableNetConnect()`) and, in the vitest setup file, the global block-only `MockAgent` (RFC 2026-11-23, rule 4).
- stderr logs method, path template, status, duration only.
- Synthetic fixtures under `test/fixtures/`.

## Out of scope
- Retries and pagination (T-007).

## Spec sections to read
- SPEC.md §7.1
- SPEC.md §7.2
- SPEC.md §9

## Files expected to change
- `src/client/http.ts`, `test/client/http.test.ts`
- `test/fixtures/`
- `package.json`, `package-lock.json`

## Wireframes
`none`

## Acceptance
`test/client/http.test.ts` (MockAgent): Basic auth and UA headers sent; an absolute URL to a foreign host, an `http://` URL or a non-default port to an allowed host are each refused with no request sent; a configured domain outside the rule (e.g. `x@evil.example`, `evil.example`) fails at construction; the override allows exactly its hostname and still refuses others; a 302 is not followed; each status maps to its T-003 code; limiter state updated from headers; no stderr line contains the API key or a body string; `make quality` green.

---
*Filled at `/handoff`:*

## Done
- `ab43199`: `src/client/http.ts` (`HttpClient.request`), `undici ^8`,
  `test/support/mock-dispatcher.ts`, the global block-only `MockAgent` in
  `test/setup.ts`. `2a0e56c`: overview listing. `1201868`: review fixes.
- Acceptance, all in `test/client/http.test.ts`:
  - auth and UA: `sends Basic auth, the UA and Accept to the configured
    host over https`;
  - foreign host, `http://`, port: `refuses %s with no request sent`
    (9 rows);
  - construction: `fails at construction for the domain %j` (12 rows);
  - override: `with an override, sends to exactly that hostname`, `with an
    override, still refuses every other host`, `an override does not admit
    the domain %j`, `an override the domain does not use admits no second
    host`;
  - 302: `does not follow a 302 to %s`;
  - statuses: `maps HTTP %i to %s`, `maps a 429 to rate_limited with its
    Retry-After`, `maps a connection failure to network`, `maps HTTP %i by
    its status when the body is not JSON`;
  - limiter: the four tests under `HttpClient: rate limiter`;
  - stderr: the four tests under `HttpClient: stderr`.
- Backstop: `test/setup.test.ts::refuses a call that names no dispatcher,
  before any connection`.
- Hand mutations, each caught by a test (2026-11-23): no `redirect:
  'manual'`, no `observe`, no `acquire`, host by regex instead of equality,
  no scheme, port, user name or password check, no encoding, the URL in
  the log, no construction check, any override admitted, no template check,
  a token taken before the body is serialised.
- `make quality` exit 0: vitest 276 passed in 6 files. `make build` exit 0.
- Not done from "In scope": `test/fixtures/` was not created, the payloads
  are a few inline lines; the keep-alive `Agent` is not built here, the RFC
  (rule 2) gives it to `cli.ts`.

## Dead ends
- Throwing a `TypeError` for a `.` or `..` path parameter (`ab43199`):
  replaced in `1201868` by a `validation` result. The value comes from a
  tool argument, not from the calling code, and every other refusal is a
  result.

## Open doubts
- Builder's choices, not yet the owner's:
  - **Stricter than the task's "In scope":** a URL must be on exactly the
    configured host, not on any `*.freshdesk.com`, because anyone can open
    a Freshdesk account. So an override the domain does not equal is
    unused; the override only widens what `FRESHDESK_DOMAIN` may be.
  - A refusal before sending (URL off the host, unusable path parameter)
    is a `validation` error with `http_status: null`. SPEC §7.1 has no code
    for "not sent"; `src/client/errors.ts:29` still says `null` means
    `network`.
  - A 2xx whose body is not JSON is `server`, not retryable.
  - `User-Agent` is `freshdesk-mcp`, with no version.
  - `request` throws a `TypeError` for a `path` that is not a template, a
    parameter missing from `params`, or a body JSON cannot carry: T-008
    onwards must not build `path` from values.
- **No request timeout and no cap on the response body** (parked,
  `docs/improvements.md`, entry stamped `2a0e56c`). T-007's acceptance
  names a timeout: decide there whether `request` sets an `AbortSignal` or
  `cli.ts` sets the Agent's timeouts.
- For T-007: a `Link` URL goes in `url`, with the first request's template
  as `path`; a foreign one comes back as `validation`, nothing sent. The
  3xx and the non-JSON 2xx are `retryable: false`.
- `TEMPLATE` (`src/client/http.ts:30`) still passes a literal id in the
  path and malformed braces; parked with the rest of the scoped round
  (`docs/improvements.md`, entry stamped `1201868`).
- `test/setup.test.ts:34` carries the first `eslint-disable` of an RFC
  rule 3 lint: the one call to the global `fetch`, which proves the
  backstop. Owner to accept or ask for another proof.

## Context pressure
ok
