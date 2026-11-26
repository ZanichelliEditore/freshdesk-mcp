# T-067 — Write resources: PUT ticket, POST note, GET agent by id

- **Type:** build
- **Phase:** M2
- **Status:** done (2026-11-26)
- **Depends on:** T-064
- **Created:** 2026-11-25

## Goal
The client calls the M2 writes need exist: `putTicket` and `postNote` in the core (typed on the full `HttpClient`, importable by the core only) and `getAgent` (a read, on `GetHttp`) in the agents resource.

## In scope
- `src/core/resources.ts`: `putTicket(http, id, body)`, `postNote(http, id, body)`, both through `requestWithRetry` (`docs/improvements.md` `6e7674f`: a direct `request` would keep `retryable: true` after a 5xx).
- `src/client/resources/agents.ts`: `getAgent(http, id)` returning id, work email and the field of the agent record that shows it active (OD-14, owner 2026-11-25: an agent not clearly active is refused; the field confirmed from Freshdesk's documented agent object, or by a GET-only smoke probe if unclear).
- Lint: only `src/core/**` may import `src/core/resources`; the rule covers `scripts/**` too (`src/tools/**` is already refused by the allow-list).

## Out of scope
- Who may call them and with what body (T-068).

## Spec sections to read
- SPEC.md §7.1
- RFC `2026-11-25-write-safety-core`, Decision, invariants 4 and 6

## Files expected to change
- `src/core/resources.ts` (new)
- `src/client/resources/agents.ts`
- `test/core/resources.test.ts` (new)
- `test/client/resources/agents.test.ts`
- `test/lint-rules.test.ts`

## Wireframes
`none`

## Acceptance
`test/core/resources.test.ts` (MockAgent): `putTicket` and `postNote` send the body exactly as given to the right path; a 5xx is not retried and comes back with `retryable: false`; a 429 is retried per T-014; an id not a positive safe integer is `validation` with nothing sent; a malformed answer is `server`; `getAgent` parses id, email and the active flag, a record with the flag missing or not a boolean parses as not active, a 404 is `not_found`; `test/lint-rules.test.ts`: a file outside `src/core/**`, in `src/` or in `scripts/`, importing `src/core/resources` is refused; `make quality` green.

No split point.

---
*Filled at `/handoff`:*

## Done
- `85f48fd` (implementation), `deceac6` (review fixes).
- `test/core/resources.test.ts` (MockAgent), per `putTicket` and `postNote`:
  "sends the body exactly as given to the right path, and parses the
  answer"; "does not retry a %i and returns it with retryable: false"
  (500, 502, 503) and the timeout case; "retries a 429 after the limiter's
  wait, and counts both attempts"; "gives up after four 429s, as
  rate_limited with every attempt counted"; "sends the body as it read at
  the call on every attempt, whatever it answers later" (security fix);
  "refuses id %s as validation, with nothing sent"; "refuses %s as server,
  saying the write may be applied".
- `getAgent`'s tests are in `test/client/resources/agents.test.ts`
  ("getAgent"), not in `test/core/resources.test.ts` as the acceptance line
  says: `getAgent` is a read in the agents resource (In scope, Files
  expected to change). They cover id, email and active parsed; the flag
  missing, null, `"true"`, `1`, `deactivated` true, `"false"` or null as not
  active; a 404 as `not_found`; malformed records and another agent's id as
  `server`; bad ids as `validation`, nothing sent.
- Active flag (OD-14): from Freshdesk's documented agent object
  (developers.freshdesk.com/api, read 2026-11-26): `contact.active` "Set to
  true if the agent is verified" on View an Agent; `deactivated` "True if
  the agent is deactivated" only on service accounts and the availability
  list. `active` = `contact.active === true` and `deactivated` absent or
  `false`. Not measured on the account.
- `test/lint-rules.test.ts` "eslint: only src/core/** imports
  src/core/resources": refused in `src/` (server, cli, client, schema,
  context.ts) and `scripts/`, in 8 spellings, as import, type import,
  side-effect import, re-export and dynamic `import()`; allowed in
  `src/core/**` and `test/`.
- `make quality` exit 0 on `deceac6`'s tree: Vitest 2993 passed, checks
  138 OK.

## Dead ends
- Reading Freshdesk's API page through WebFetch: the page is cut off before
  the Agents section. The raw HTML (curl, then grep) had it.

## Open doubts
- The active rule is from the documentation, not measured on the account;
  T-076's first real run, or a GET-only probe, should confirm
  `contact.active` is `true` for working agents.
- `make quality` timed out on real-time tests under machine load
  (2026-11-26); they pass alone and on rerun (`docs/improvements.md`,
  `deceac6` entry).

## Context pressure
ok

## Next action
none (done).
