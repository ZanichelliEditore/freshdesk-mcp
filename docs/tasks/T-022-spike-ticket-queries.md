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
  tests), the close commit `T-022: measured rows, open items, task file`
  (measured rows, this file).
- `docs/architecture/ticket-queries.md`: one row per filter of the five
  tools and `get_ticket`'s recent tickets, each `documented` with its URL
  or `measured 2026-11-24`; `uncategorized` (local check of
  `custom_fields`: search refuses `<nested level>:null`), past 300 results,
  cost classes, the parameters of `listTickets` (requester filter
  `requester_id`, always with `updated_since`) and `searchTickets`; "Open"
  lists what remains and the tasks it bears on.
- Probes: `runProbes` in `scripts/smoke/smoke.ts`, `make smoke-probes`
  (`cli.ts --probes`). Run against the real account by the orchestrator on
  2026-11-24 (owner's authorisation): exit 0, 16 GETs, 10 answered 200, 6
  answered 400; output kept in `docs/private/`, only shapes copied.
- Tests: `test/smoke.test.ts` `runProbes: what they ask and print` (one
  line per probe, GET only, the queries asked, no fixture value / domain /
  key in stdout or stderr), `runProbes: failures` (error code only, 401,
  not JSON, not a list, skipped probes, an unfit field name not sent),
  `main: the probes mode`. The leak test was seen failing with a probe
  line made to print a ticket (reverted).
- Acceptance: every line met; the requester row is `documented` (the probe
  was inconclusive, so `updated_since` is always sent with it).

## Dead ends
- Asking `uncategorized` by search: `<nested top>:null`,
  `<nested last level>:null` and the same within 30 days are each a 400
  `validation` (2026-11-24).
- `include=stats` on search (400) and a `status` parameter on the list
  (400): no single call gives open tickets with their stats.

## Open doubts
- `GET /tickets/{id}?include=stats` is assumed to carry the 8 `stats` keys
  measured on the list (T-029).
- Whether `requester_id` alone lifts the 30-day window is unknown (the
  probe's requester had one ticket); moot while `updated_since` is sent.
- One deep `updated_since` page took about 8 s, near the 10 s per-attempt
  cut-off (T-027, T-036, T-037).
- Choice to confirm: with `uncategorised_fields` set, a ticket with **any**
  listed field empty is uncategorised.
- The doc pages disagree on an include's cost (+2 on List All Tickets, +1
  on View a Ticket); measured +1 on the list.

## Context pressure
Low: one builder session over two phases; no file dumped whole.

## Next action
none: done. T-023 and T-024 are unblocked.
