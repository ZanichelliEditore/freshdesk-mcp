# T-022 — Spike: which endpoint serves which ticket filter

- **Type:** spike
- **Phase:** M1
- **Status:** done (2026-11-24)
- **Depends on:** T-016
- **Created:** 2026-11-23
- **Gates:** The owner's run of T-016's schema report, before the start
  (also answers OD-4); the owner's run of this task's probes, at the split
  point.

## Goal
A decision note: for every filter of `list_tickets`, `triage_queue`,
`count_tickets`, `find_similar_tickets` and `export_tickets`, whether `GET
/tickets`, `/search/tickets` or a local filter serves it, with caps and call
costs. Four tools and two client resources are built on it.

## In scope
- From the Freshdesk API v2 documentation, plus GET probes added to the
  smoke script and run by the owner where the documentation is silent
  (`updated_since` window, `field:null` in search, the 300-result cap,
  `include=stats`).
- How `uncategorized` is asked; what a tool does past 300 results; which
  calls are `expensive` for the limiter.
- The parameters `listTickets` must take (T-023), the requester filter for
  `get_ticket`'s recent tickets included, and whether `stats` carries
  `triage_queue`'s signals without a call per ticket (T-029).
- Probes print shapes, counts and status codes only, as T-016's report does.

## Out of scope
- Any `src/` code beyond smoke probes.

## Spec sections to read
- SPEC.md §5
- SPEC.md §8.2
- SPEC.md §7.2

## Files expected to change
- `docs/architecture/ticket-queries.md`
- `docs/architecture/overview.md` (index line)
- `scripts/smoke.ts` (probes, GET only)
- `test/smoke.test.ts` (probes)

## Wireframes
`none`

## Split point
The rows the documentation settles, the probes and their test first. Then
the owner runs the probes; the measured rows and the "Open" list second. If
the owner's run cannot happen in the session, the first half is handed off
with the status still `doing`.

## Acceptance
`docs/architecture/ticket-queries.md` has one row per filter of the five
tools the goal names, and one for `get_ticket`'s recent tickets: endpoint,
cap, calls per 100 tickets, and either `documented` with its URL or
`measured` with the date of the owner's smoke run; it says how
`uncategorized` is asked and what happens past 300 results; it names no
account value (the commit hook passes); it lists the parameters of the list
endpoint T-023 must send, the requester filter among them;
`test/smoke.test.ts` (MockAgent): every probe sends GET only; no label,
name, subject or id of the fixture, and neither the `FRESHDESK_DOMAIN` value
nor the API key, appears in its output; a failed probe prints its error code
only; a row that is neither documented nor measured is listed under "Open"
and the tasks it blocks are named; `make quality` green.

---
*Filled at `/handoff`:*

## Done
- Commits: `e408ca8` (status), `0ab246f` (draft from the docs, probes,
  tests), `e3fcdb1` (first run's measured rows), `86b788a` (review fixes:
  control probes, note conclusions), the close commit
  `T-022: control-run conclusions, close` (control-run conclusions, this
  file).
- `docs/architecture/ticket-queries.md`: one row per filter of the five
  tools and `get_ticket`'s recent tickets, each `documented` with its URL
  or `measured 2026-11-24`; `uncategorized` (a local check of
  `custom_fields`, a nested field not being searchable), past 300 results
  (an ordered list scan; search windows rejected), scan bounds, cost
  classes, the parameters of `listTickets` (the requester filter
  `requester_id`, alone for recent tickets) and `searchTickets`; "Open"
  lists what remains and the tasks it bears on.
- Probes: `runProbes` in `scripts/smoke/smoke.ts`, `make smoke-probes`
  (`cli.ts --probes`). Two runs against the real account by the
  orchestrator on 2026-11-24 (owner's authorisation), output kept in
  `docs/private/`, only shapes copied:
  - first run: exit 0, 16 GETs, 10 answered 200, 6 answered 400;
  - control run after the review: exit 0, 21 GETs, 14 answered 200, 7
    answered 400. It showed `+` read as a space (`OR`, `AND`), a plain
    dropdown `:null` honoured, a nested field not searchable even for a
    top-level value, `requester_id` alone lifting the 30-day window (96 of
    100 older than 31 days, the same with `updated_since=2000`), and the
    deep page under 2 s in both orders.
- Tests: `test/smoke.test.ts` `runProbes: what they ask and print`,
  `runProbes: failures`, `runProbes: control probes (review of
  2026-11-24)`, `main: the probes mode`: GET only; the queries asked; no
  fixture value, domain or key in stdout or stderr; a failure prints its
  code; totals and durations as bands; key lines `skipped` without a
  source. The leak test was seen failing with a probe line made to print a
  ticket (reverted).
- Review: one full round on `c24efd9..e3fcdb1` (security: nothing
  blocking; code: 2 High, 4 Medium, Lows, all on the note's conclusions),
  applied in `86b788a`; the control run settled what they left pending.
- Acceptance: every line met.

## Dead ends
- Asking `uncategorized` by search on the nested field: `:null` at the top
  and last level, and a top-level value, are each a 400 `validation`
  (2026-11-24).
- `include=stats` on search (400) and a `status` parameter on the list
  (400): no single call gives open tickets with their stats.
- Always sending `updated_since` with `requester_id` (first-run decision):
  withdrawn, `requester_id` alone lifts the window and a window drops
  tickets.

## Open doubts
- `GET /tickets/{id}?include=stats` is assumed to carry the 8 `stats` keys
  measured on the list (T-029).
- Deep-page latency varies (about 8 s once, under 2 s twice): which
  deadline a scan runs under is open (T-027, T-036, T-037).
- `created_at:>'<day>'` boundary semantics are undocumented (T-043, T-036,
  T-037).
- `company_id` alone was not probed for the 30-day window; moot while
  `find_similar_tickets` sends its N-day `updated_since` (T-030).
- Choices to confirm: with `uncategorised_fields` set, a ticket with
  **any** listed field empty is uncategorised; `uncategorized` is always
  checked locally, though search `:null` works on plain fields.
- The doc pages disagree on an include's cost (+2 on List All Tickets, +1
  on View a Ticket); measured +1 on the list.

## Context pressure
Low: one builder session over three phases; no file dumped whole.

## Next action
none: done. T-023 and T-024 are unblocked.
