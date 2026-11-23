# PLAN

Ordered task list. One task = one session (SPEC.md
§14.1). Statuses: `proposed | todo | doing | done | dropped`.

- **Every status change carries its date:** `doing (YYYY-MM-DD)`, never a
  bare `doing`. A session can't tell how much time has passed unless the
  documents say.
- A **`proposed`** row has been raised but not yet sized, whoever raised
  it: a `/handoff`, the owner, or an RFC accepted in session. It has no
  task file, and no session may take it until `/decompose` or the owner
  confirms it as `todo`.
- A **`dropped`** row is kept, with one line saying where its work went.
- Only `/decompose` reorders, re-scopes, merges or drops rows, or changes their
  dependencies or acceptance. `/handoff` may change only its own row's
  status and add `proposed` rows, except at the end of a `plan` task,
  where `/decompose`'s authority carries through the handoff.
- The owner reviews every plan before its first task.
- The `## Wireframes` section at the end is what `compliance-reviewer`
  reads when PLAN.md is the task file (plan sessions change documents only).

**Sizing calibration:** tasks that overflowed: 0 · tasks split after the
fact: 0 · sessions that ran two tasks: 0 · split points set at planning and
taken: 0 · split points set at planning and not needed: 1 (T-007) · split
points set at planning, pending: 2 (T-001, T-013).

## M0 — repo, CI, client core, rate limiter, schema service, config

Done when: tests green in CI (SPEC §13). T-001 moved here from Setup
(2026-11-20, `/decompose M0`): M0's CI acceptance needs the remote. Re-planned
the same day after the plan review: the first draft's T-008 (three
resource families) split into T-008 and T-009, so the schema service
became T-010 and T-011; acceptance lines tightened per the review.

Re-planned 2026-11-23 (`/decompose`, owner's choice): the `proposed` rows
T-012 and T-013 are sized and become `todo`, placed before T-008 (rows are
in execution order, not id order); T-008 now depends on T-013, so no
resource is built on a `requestWithRetry` without a total deadline, and on
T-012, so the guard exists before the first field-label fixtures. Both
acceptance lines were tightened by the planner's review, then again by the
handoff's full review round (same day): T-012 names its matcher and its
exits and forbids a pattern in any output; T-013 names which error wins at
the deadline.

T-012's acceptance amended by the owner on 2026-11-23, in its build session:
the matcher runs in the caller's locale and in the C locale, and an exit 1
that came with an error on stderr is not a pass.

| Id | Title | Type | Depends | Acceptance | Status |
|---|---|---|---|---|---|
| T-001 | Connect the remote (GitHub) | build | none | `main` pushed; a `quality.yml` run observed green on the last pushed commit before the handoff stamp, run URL and the SHA it ran on in HANDOFF (if an earlier run was red, why; gitleaks step unweakened); Dependabot security updates on; public: the patterns file is non-empty, `git grep -iEf <patterns file> $(git rev-list --all)` matched before the rewrite (positive control) and exits 1 after it (0 or 2 fails); private: HANDOFF says the history scrub is due and PLAN has its `proposed` row with this same check. | done (2026-11-20) |
| T-002 | RFC: adopt the runtime and test stack | plan | none | RFC file is in `docs/rfc/active/` after `make rfc-sync`, status Active, names the five packages and what it excludes, records the MockAgent/global-`fetch` evidence, `rfc-reviewer` findings resolved or dismissed in the RFC; `make quality` green. | done (2026-11-23) |
| T-003 | TypeScript toolchain + client error model | build | T-001, T-002 | `test/client/errors.test.ts` maps 401/403/404/400 with `errors[]`/400 without/429 with `Retry-After`/5xx/network to the seven codes, and 405/409/415 to the documented fallback; `make quality` green with vitest running; CI run on that commit observed green. | done (2026-11-23) |
| T-004 | Config: env + team config (zod) | build | T-003 | `test/config.test.ts`: missing domain or key rejected; bad JSON and unknown key each give an error naming the file and the path; no error message contains the API key value; defaults applied; override accepts one hostname, not a boolean; example file parses; `make quality` green. | done (2026-11-23) |
| T-005 | Rate limiter (standalone) | build | T-003 | `test/client/rate-limit.test.ts` (fake clock): parses headers; defaults with no headers; `expensive` refused below reserve, `cheap` allowed; below floor it waits when the window ends inside the bound, fails fast beyond it, and the exact boundary is tested; pacing ≤ 2 req/s; `Retry-After` delay returned; `make quality` green. | done (2026-11-23) |
| T-006 | HTTP core: request, auth, host check, errors, limiter, safe logs | build | T-005 | `test/client/http.test.ts` (MockAgent): Basic auth and UA headers sent; an absolute URL to a foreign host, an `http://` URL or a non-default port to an allowed host are each refused with no request sent; a configured domain outside the rule (e.g. `x@evil.example`, `evil.example`) fails at construction; the override allows exactly its hostname and still refuses others; a 302 is not followed; each status maps to its T-003 code; limiter state updated from headers; no stderr line contains the API key or a body string; `make quality` green. | done (2026-11-23) |
| T-007 | HTTP retries + pagination iterator | build | T-006 | MockAgent call counts: a read on 503 is attempted 4 times then fails `server`; a read on a network error is retried; a POST/PUT on 503 and on a network error or timeout is sent exactly once; a write on 429 is retried after the limiter's wait; the iterator follows `Link` across 3 pages, stops at the cap, and refuses a `Link` to a foreign host with no request sent; `make quality` green. | done (2026-11-23) |
| T-012 | Guard: account-value patterns in the commit hook | build | T-001 | A local commit-stage hook (not in `make quality`, not in CI) runs `git grep --cached -n -iE -f docs/private/account-patterns` over the index: in the caller's locale and in the C locale: exit 0 from either run refuses, 1 with nothing on stderr from both passes, anything else fails; `tools/checks/test_account_patterns.py`, with temporary repositories and pattern files, proves a match is refused naming `file:line`, a match in a binary file is refused naming the file, content staged but absent from the working tree is caught, and a missing file, an empty or blank-only file and an invalid regex each exit non-zero with a message saying how to fix it; no output on any path, the invalid regex included, contains a pattern line or the matched text; a staged synthetic match is refused by the installed hook (positive control, output in HANDOFF); `make quality` green. | done (2026-11-23) |
| T-013 | Total deadline of 30 s on `requestWithRetry` | build | T-007 | `test/client/http-retry.test.ts` (MockAgent, fake clock): a call whose attempts, limiter waits and backoff would pass 30 s returns an error at or before 30 s and sends nothing after it; an attempt in flight at 30 s is aborted; the expiry error is `network` with `http_status: null`, `retryable: true` for a GET and `false` for any other method; a limiter wait that would end at or after the deadline is refused as `rate_limited` with `retry_after_s`, with no sleep, the exact boundary tested, and a write on a 429 so refused is not sent again; a call that ends sooner is unchanged; `test/client/rate-limit.test.ts`: a caller's bound shortens `acquire`'s wait and never lengthens it past 15 s; `make quality` green. | done (2026-11-23) |
| T-014 | A write is not started without time to finish | build | T-013 | Raised by the T-013 review (2026-11-23), owner's choice: `requestWithRetry` does not start a non-GET attempt when less than a minimum time is left before its deadline (the value to be sized); it is refused as not sent, safe to retry, instead of being sent and aborted. Must be done before the first write resource. | proposed (2026-11-23) |
| T-008 | Client resource: ticket fields (read) | build | T-007, T-012, T-013 | `test/client/resources/ticket-fields.test.ts` (MockAgent): the synthetic payload yields the expected field labels and the 3-level choice tree (asserted values, not just types); a malformed payload fails with a defined error; `make quality` green. | done (2026-11-23) |
| T-009 | Client resources: agents and groups (read) | build | T-008 | MockAgent tests list agents and groups across 2+ pages with the expected id → name values; a malformed item fails with a defined error; `make quality` green. | done (2026-11-23) |
| T-010 | Schema service: load, TTL cache, output mapping | build | T-004, T-009 | `test/schema/output.test.ts`: one fetch per TTL (MockAgent count), refetch after TTL (fake clock); raw ticket → labelled output with names; hidden fields absent; `make quality` green. | done (2026-11-23) |
| T-011 | Schema service: input mapping + nested-choice validation | build | T-010 | `test/schema/input.test.ts` covers label and API-name inputs, the label case rule, a 3-level nested path, an invalid choice at each level, an unknown field and an ambiguous label; `make quality` green; **M0 done:** CI run on this commit observed green, URL in HANDOFF. | todo (2026-11-20) |
| T-015 | Build the schema service from config | build | T-011 | Raised by the T-010 review (2026-11-23): whoever first builds a `SchemaService` (M1 tool wiring) passes `limits.schema_ttl_s` as its TTL and the team config's `fields` to `ticketOutput`; a test shows a non-default TTL from a team file is the one used. May fold into the first M1 tool task. | proposed (2026-11-23) |

## Wireframes

`none`
