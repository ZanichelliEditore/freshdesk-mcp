# T-054 — `api_calls_used` counts every attempt

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-24)
- **Depends on:** T-021
- **Created:** 2026-11-24

## Goal
A list tool's `api_calls_used` equals the requests it sent, retries
included, so the per-call budget (T-035) and the envelope tell the truth.
T-021's scoped review (2026-11-24) showed a page retried after a 503
counting once.

## In scope
- `src/client/http.ts`: `paginate`'s return value (today
  `{ truncated }`) also gives the number of attempts sent for all its
  pages, retries and a deadline-cut attempt included. `requestWithRetry`
  reports its attempts in a way `paginate` can sum; the builder picks the
  smallest form (for example an `attempts` field on the result).
- `src/client/resources/list-all.ts`: `listAll`'s ok result gives
  `attempts` (keep or replace `pages`; say which).
- `src/tools/toolsets/core/list-agents.ts`, `list-groups.ts`:
  `api_calls_used` from the attempts; the cost lines and descriptions stop
  saying retries are not counted; the "recorded limitation" tests become
  plain equality with the MockAgent count.
- `docs/architecture/overview.md` brought to what is then true.

## Out of scope
- Any other caller of `requestWithRetry` (the schema service, the smoke
  script) beyond what a type change forces.
- An error result's count: a failed list returns no envelope.

## Spec sections to read
- SPEC.md §7.1
- SPEC.md §7.2
- SPEC.md §8.4

## Files expected to change
- `src/client/http.ts`
- `src/client/resources/list-all.ts`
- `src/tools/toolsets/core/list-agents.ts`, `list-groups.ts`
- `test/client/paginate.test.ts`, `test/client/http-retry.test.ts` if the
  result type changes there, `test/client/resources/*.test.ts` as forced
- `test/tools/core/list-agents-groups.test.ts`
- `docs/architecture/overview.md`

## Wireframes
`none`

## Acceptance
`test/client/paginate.test.ts` (MockAgent): a page answered 503 then 200 is
reported as 2 attempts by `paginate`'s result and by `listAll`; a page sent
once is 1; a page cut by the deadline counts the attempts sent;
`test/tools/core/list-agents-groups.test.ts`: the "recorded limitation"
tests are replaced by `api_calls_used` equal to the MockAgent count after a
503 then 200, for both tools, and both cost lines no longer say retries are
not counted; T-021's acceptance limitation clause is then met by the plain
rule; `make quality` green.

---
*Filled at `/handoff`:*

## Done
- Commits: `c48aa6b` (status), `ea241c8` (build), the close commit
  `T-054: done; review Lows, task file` (review Lows, this file).
- `requestWithRetry` returns `RetryResult` (`HttpResult & { attempts }`);
  `paginate` returns `PageEnd` (`{ truncated, attempts }`) and yields its
  pages without `attempts`; `listAll`'s ok result gives `attempts` in
  place of `pages`; both tools report it as `api_calls_used`.
- An attempt counts when `request` got its result through `fetch`:
  `request` adds those result objects to a private `WeakSet`, and
  `requestWithRetry` counts a result found there. Chosen over a private
  send helper because `SmokeClient` (`scripts/smoke/smoke.ts`) overrides
  `request` as its GET-only guard: `requestWithRetry` must keep calling
  `this.request`, and the WeakSet makes the override's own refusal
  (`NOT_GET`) count 0.
- Failed first (14):
  - `test/client/paginate.test.ts::paginate: one deadline for all its pages`:
    "cuts the page in flight at the deadline…" (2), "asks for no page once
    the deadline has passed between two pages" (1), "sends nothing when the
    deadline has already passed" (0), "with none, each page keeps its own
    30 s" (6);
  - `test/client/paginate.test.ts::paginate, listAll: the attempts sent,
    retries included`: all six ("paginate: a page answered 503 then 200 is
    2 attempts", "listAll: a page answered 503 then 200 is 2 attempts",
    "paginate: a page sent once is 1 attempt, three pages 3", "listAll: a
    page sent once is 1 attempt", "paginate: a refused Link is not an
    attempt", "paginate: a page cap of zero is 0 attempts");
  - `test/tools/core/list-agents-groups.test.ts::list_agents, list_groups:
    api_calls_used and retries`: "%s: a page answered 503 then 200 makes
    api_calls_used the MockAgent count, 2" and "%s: the description and
    cost say retries are counted", both tools.
- Written with the fix, passing at once (coverage of the new field, not
  regressions): `test/client/http-retry.test.ts::requestWithRetry: attempts
  counts the attempts sent` (1, 503-503-200 → 3, all fail → 4, limiter
  refusal after a 429 → 1, cut in flight → 1, deadline passed → 0, off-host
  URL → 0; from the review: a non-JSON 200 → 1, a POST answered 503 → 1
  with no retry sent).
- Review Low 1, failed first:
  `test/client/resources/ticket-fields.test.ts::listTicketFields: an HTTP
  failure` "returns the error alone, without the client's attempt count";
  `listTicketFields` now returns `{ ok: false, error }`. `listAll` needed
  nothing: `paginate` yields pages without `attempts`.
- Forced by the type change: `pages` → `attempts` in
  `test/client/resources/agents.test.ts`, `groups.test.ts`; `attempts: 0`
  in `SmokeClient.paginate`.
- Full review round: security none, compliance Wireframes `none`, code 3
  Low, all applied in the close commit (Low 3: header and overview wording
  on what an override counts). No scoped round.

## Dead ends
- Extracting the response parsing of `request` into a function so one
  `#mark` call covers it: more churn than marking its three returns;
  reverted before commit.
- A private send helper called by `requestWithRetry` instead of
  `this.request`: would bypass `SmokeClient`'s guard on `request` (see
  Done); not tried in code.

## Open doubts
- A subclass's `request` override that returns a copy of the base result,
  not the object itself, under-counts: that attempt counts 0 (stated in
  `src/client/http.ts`'s header and the overview). `SmokeClient` returns
  the object as is.
- A network error before anything reaches the wire (a DNS failure) counts
  1: the attempt was handed to `fetch`.

## Context pressure
Low: one builder session plus the review Lows; no file dumped whole.

## Next action
none: done.
