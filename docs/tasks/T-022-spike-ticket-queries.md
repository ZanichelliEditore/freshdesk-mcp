# T-022 — Spike: which endpoint serves which ticket filter

- **Type:** spike
- **Phase:** M1
- **Status:** doing (2026-11-24)
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

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
