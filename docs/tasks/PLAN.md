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

**Sizing calibration:** tasks that overflowed: 0 · tasks split after the
fact: 0 · sessions that ran two tasks: 0 · split points set at planning and
taken: 0 · split points set at planning and not needed: 0 · split points
set at planning, pending: 3 (T-001, T-007, T-008).

## M0 — repo, CI, client core, rate limiter, schema service, config

Done when: tests green in CI (SPEC §13). T-001 moved here from Setup
(2026-11-20, `/decompose M0`): M0's CI acceptance needs the remote.

| Id | Title | Type | Depends | Acceptance | Status |
|---|---|---|---|---|---|
| T-001 | Connect the remote (GitHub) | build | none | `git ls-remote origin main` equals local `HEAD`; first `quality.yml` run on `main` observed green, run URL in HANDOFF; Dependabot security updates on; if public, SPEC.md holds no real account values (owner-checked grep, recorded in HANDOFF). | todo (2026-11-20) |
| T-002 | RFC: adopt the runtime and test stack | plan | none | RFC file is in `docs/rfc/active/` after `make rfc-sync`, status Active, `rfc-reviewer` findings resolved or dismissed in the RFC; `make quality` green. | todo (2026-11-20) |
| T-003 | TypeScript toolchain + client error model | build | T-001, T-002 | `test/client/errors.test.ts` maps 401/403/404/400(with `errors[]`)/429(with `Retry-After`)/5xx/network to the seven codes; `make quality` green with vitest running; CI run on that commit observed green. | todo (2026-11-20) |
| T-004 | Config: env + team config (zod) | build | T-003 | `test/config.test.ts`: missing key rejected; malformed domain rejected; bad JSON and unknown key each give an error naming the file and the path; defaults applied; example file parses; `make quality` green. | todo (2026-11-20) |
| T-005 | Rate limiter (standalone) | build | T-003 | `test/client/rate-limit.test.ts` (fake clock): parses headers; defaults with no headers; `expensive` refused below reserve, `cheap` allowed; floor waits or fails fast per the documented bound; pacing ≤ 2 req/s; `Retry-After` respected; `make quality` green. | todo (2026-11-20) |
| T-006 | HTTP core: request, auth, host check, errors, limiter, safe logs | build | T-004, T-005 | `test/client/http.test.ts` (MockAgent): Basic auth and UA headers sent; foreign host refused unless override; each status maps to its T-003 code; limiter state updated from headers; no stderr line contains the API key or a body string; `make quality` green. | todo (2026-11-20) |
| T-007 | HTTP retries + pagination iterator | build | T-006 | MockAgent call counts: a read on 503 is tried 4 times then fails `server`; a write on 503 is sent exactly once; a write on 429 is retried after `Retry-After`; the iterator follows `Link` across 3 pages and stops at the cap; `make quality` green. | todo (2026-11-20) |
| T-008 | Client resources: ticket fields, agents, groups (read) | build | T-007 | MockAgent tests parse synthetic payloads into the typed shapes (3-level nested field included) and list agents/groups across pages; `make quality` green. | todo (2026-11-20) |
| T-009 | Schema service: load, TTL cache, output mapping | build | T-008 | `test/schema/output.test.ts`: one fetch per TTL (MockAgent count), refetch after TTL (fake clock); raw ticket → labelled output with names; hidden fields absent; `make quality` green. | todo (2026-11-20) |
| T-010 | Schema service: input mapping + nested-choice validation | build | T-009 | `test/schema/input.test.ts` covers label and API-name inputs, a 3-level nested path, an invalid choice at each level; `make quality` green; **M0 done:** CI run on this commit observed green, URL in HANDOFF. | todo (2026-11-20) |
