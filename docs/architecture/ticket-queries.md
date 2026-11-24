# Ticket queries: which endpoint serves which filter

T-022's decision note (spike). For every filter of `list_tickets`,
`triage_queue`, `count_tickets`, `find_similar_tickets` and
`export_tickets`, and for `get_ticket`'s recent tickets: the endpoint that
serves it, its cap, and what 100 tickets cost. T-023, T-024, T-043 and the
tools T-026 to T-030, T-036 and T-037 are built on it.

A row is `documented` when Freshdesk's API v2 documentation settles it (the
link names the section), or `measured 2026-11-24`: the orchestrator's run
of `make smoke-probes` (`scripts/smoke/smoke.ts`, `runProbes`) against the
real account on 2026-11-24, on the owner's authorisation. The run's output
is kept in the gitignored `docs/private/`; only shapes (counts of a page,
bands, yes/no, credits) are quoted here. A conclusion that waits for the
control probes added after the review of 2026-11-24 says `pending control`.
Anything still open is listed under [Open](#open). This file names no
account value: field names are written as placeholders
(`<nested last level>`).

Sources (read 2026-11-24), all on <https://developers.freshdesk.com/api/>:

- **List All Tickets** (`#list_all_tickets`): parameters `filter`
  (predefined views), `requester_id`, `email`, `unique_external_id`,
  `company_id`, `updated_since`, `order_by` (`created_at`, `due_by`,
  `updated_at`, `status`), `order_type`, `include` (`stats`, `requester`,
  `description`). "By default, only tickets that have been created within
  the past 30 days will be returned"; older ones through `updated_since`. "A
  maximum of 300 pages (30000 tickets) will be returned." "Each include will
  consume an additional 2 credits."
- **Filter Tickets** (`#filter_tickets`, `GET /search/tickets?query="…"`):
  fields `agent_id`, `group_id`, `priority`, `status`, `tag`, `type`,
  `due_by`, `fr_due_by`, `created_at`, `updated_at`; custom fields of type
  single-line text, number, checkbox, dropdown and date. `null` for a field
  with no value (`tag:null`). `AND`, `OR`, parentheses; `:>` and `:<` on
  dates (`YYYY-MM-DD`, UTC) and numbers. 30 results per page, page "should
  not exceed 10"; the query up to 512 characters, in double quotes, URL
  encoded; the body is `{total, results}`. No `requester_id` or
  `company_id`, no full text. Archived tickets are excluded; a change takes
  a few minutes to become searchable.
- **View a Ticket** (`#view_a_ticket`): `include=stats` documented as
  `closed_at`, `resolved_at` and `first_responded_at`; "each include will
  consume an additional credit"; `include=conversations` returns the first
  ten only.
- **Pagination** (`#pagination`): `per_page` up to 100, `Link` header to
  the next page, absent on the last.
- **Rate limit** (`#ratelimit`): every request counts, invalid ones too.

What the first run measured (2026-11-24, 16 GETs, 10 answered 200, 6
answered 400):

| Probe | Result (shape) | Means |
|---|---|---|
| `list_default` | 100 items, next page, none created over 31 days ago, 1 credit | the 30-day window holds |
| `list_updated_since_365d` (`order_by=created_at&order_type=asc`) | 100 items, next page, all 100 created over 31 days ago, 1 credit; that one GET took about 8 s | `updated_since` lifts the window; that page is slow (depth or order: pending control) |
| `list_status_param` | 400 `validation` | `GET /tickets` refuses a `status` parameter: no list-side field filter |
| `list_include_stats` | all 8 `stats` keys present, **2 credits** | `stats` carries `agent_responded_at`, `requester_responded_at`, `status_updated_at`, `pending_since`, `reopened_at` beyond the documented three; one include costs +1 credit, not +2 |
| `list_ticket_keys`, `search_ticket_keys` | `fr_due_by`, `due_by`, `nr_due_by`, `fr_escalated`, `is_escalated`, `nr_escalated`, `tags`, `custom_fields`, `requester_id`, `company_id` present on both; `stats` on neither | a search result carries the same ticket keys as a list item |
| `list_requester`, `list_requester_updated_since_2000` | 1 item each, none older than 31 days | **inconclusive** on the window: that requester has one ticket |
| `conversations_per_page_100` | 200, 0 items, 1 credit | `per_page=100` accepted; not shown honoured (the ticket had no conversation) |
| `search_status_open` (`"status:2"`) | total in 1–300, a full page of 30, 1 credit | search answers; that query has no space, so `+` for a space is not yet shown (pending control) |
| `search_include_stats` | 400 `validation` | search refuses `include=stats` |
| `search_cap_page_1`, `_page_10`, `_page_11` | total over 300 on pages 1 and 10, 30 items each; page 11 400 `validation` | page 11 is refused; `total` goes above 300 |
| `search_null_nested_top`, `_last`, `_last_30d` | 400 `validation` each | search refused `<nested level>:null` at every level; pending control (a nested value query and a plain dropdown `:null`), since `_last_30d` also has spaces |

The two endpoints, in short:

| Endpoint | Page | Cap | Calls per 100 tickets |
|---|---|---|---|
| `GET /tickets` (list) | 100 | 300 pages = 30,000 tickets | 1 (2 credits with `include=stats`, measured 2026-11-24) |
| `GET /search/tickets` (search) | 30 | 10 pages = 300 results | 4 (`ceil(100 / 30)`) |
| local filter on list pages | — | the list's 30,000, and the [scan bounds](#scan-bounds) | 1 per 100 tickets **scanned**, not matched |

## Filters

"Calls / 100" is the number of requests to return 100 matching tickets.

### `list_tickets`

| Filter | Endpoint and parameter | Cap | Calls / 100 | Source |
|---|---|---|---|---|
| status | search `status:<id>` | 300 | 4 | documented, [Filter Tickets](https://developers.freshdesk.com/api/#filter_tickets) |
| priority | search `priority:<id>` | 300 | 4 | documented, [Filter Tickets](https://developers.freshdesk.com/api/#filter_tickets) |
| group | search `group_id:<id>` | 300 | 4 | documented, [Filter Tickets](https://developers.freshdesk.com/api/#filter_tickets) |
| agent | search `agent_id:<id>` | 300 | 4 | documented, [Filter Tickets](https://developers.freshdesk.com/api/#filter_tickets) |
| type | search `type:'<name>'` | 300 | 4 | documented, [Filter Tickets](https://developers.freshdesk.com/api/#filter_tickets) |
| tag | search `tag:'<tag>'` | 300 | 4 | documented, [Filter Tickets](https://developers.freshdesk.com/api/#filter_tickets) |
| `uncategorized` | local check of `custom_fields`: on the list pages alone, on the search results with other filters (see [below](#uncategorized)) | 30,000 / 300 | 1 per 100 scanned / 4 per 100 scanned | measured 2026-11-24 (both carry `custom_fields`); why not search: pending control |
| `updated_since` | list `updated_since=<ISO instant>` | 30,000 | 1 | documented, [List All Tickets](https://developers.freshdesk.com/api/#list_all_tickets); measured 2026-11-24 (lifts the 30-day window) |
| `created_between` | search `created_at:>'<from>' AND created_at:<'<to>'` (days, UTC) | 300 | 4 | documented, [Filter Tickets](https://developers.freshdesk.com/api/#filter_tickets); boundary semantics open |

Several filters at once: one search query, the conditions joined by `AND`.
`updated_since` with any search filter becomes `updated_at:>'<day>'` in the
query (day granularity); alone, it is the list endpoint. `GET /tickets`
refuses a `status` parameter (measured 2026-11-24) and documents none for
priority, group, agent, type or tag: a field filter is search, or local.

### `triage_queue`

| Filter | Endpoint and parameter | Cap | Calls / 100 | Source |
|---|---|---|---|---|
| open and pending | search `status:2 OR status:3` | 300 | 4 | documented, [Filter Tickets](https://developers.freshdesk.com/api/#filter_tickets); spaced query pending control |

Its signals (T-029): priority, `fr_due_by`, `due_by`, `nr_due_by` and the
three escalation flags are on every search result (measured 2026-11-24): no
per-ticket call for them. The last customer message and unanswered replies
need `stats.requester_responded_at` and `stats.agent_responded_at`: `stats`
carries both on the list (measured 2026-11-24), but search refuses
`include=stats` and the list cannot filter by status. So those two signals
cost one `GET /tickets/{id}?include=stats` per returned row: a page of 30
rows is 31 requests, about 61 credits (1 for the search, 2 per view). With
them `triage_queue` is **`expensive`**; T-029 may leave them out of the
default and fetch them only on request, and states the bound either way.

Rejected: the list with `include=stats` and a local status filter. The list
cannot be asked for open tickets, so it would have to scan every ticket
updated since the oldest open one's last update; an open ticket can sit
untouched for months, so the scan has no useful bound (one deep page took
about 8 s, measured 2026-11-24), while the per-row views are bounded by
the page.

### `count_tickets`

| Filter | Endpoint and parameter | Cap | Calls / 100 | Source |
|---|---|---|---|---|
| period | list `updated_since=<period start>&order_by=created_at&order_type=asc`, `created_at` checked locally, stop past the period's end | 30,000 and the [scan bounds](#scan-bounds) | 1 per 100 scanned | documented, [List All Tickets](https://developers.freshdesk.com/api/#list_all_tickets) |
| status, priority, group, agent, type, tag | search when its `total` ≤ 300; else local, on the list pages | 300 / 30,000 | 4 / 1 per 100 scanned | documented, [Filter Tickets](https://developers.freshdesk.com/api/#filter_tickets), [List All Tickets](https://developers.freshdesk.com/api/#list_all_tickets) |
| `uncategorized` | local (`custom_fields` of the pages) | 30,000 | 1 per 100 scanned | measured 2026-11-24 |

A count needs every matching ticket (it groups them in code), so the
300-result search cap would cut it. It asks search page 1 first (1 call):
a `total` of 300 or less pages search (≤ 10 calls); above 300 (the run
showed `total` goes above it, measured 2026-11-24) it scans the list.

**Past 300, the list scan, ordered.** `updated_since=<period start>` with
`order_by=created_at&order_type=asc`: a ticket is updated no earlier than it
was created, so every ticket created in the period is in it; those created
before the period (updated in it) come first and are dropped, and the scan
stops at the first page whose last ticket was created after the period's
end. Weighed and rejected: splitting the period into `created_at` windows
of ≤ 300 search results each. It costs 4 calls per 100 tickets against 1,
needs a call per window to learn its `total`, and cannot split below a day
(search dates are `YYYY-MM-DD`), so a day with over 300 tickets has no
answer. Its one gain, no deep list pages, is the slow part measured above;
the [scan bounds](#scan-bounds) decide how far the scan goes.

### `find_similar_tickets`

| Filter | Endpoint and parameter | Cap | Calls / 100 | Source |
|---|---|---|---|---|
| same category fields | local, on the candidates' `custom_fields` | — | 0 | measured 2026-11-24 (candidates carry `custom_fields`) |
| same requester | list `requester_id=<id>&updated_since=<N days ago>` | 30,000 | 1 | documented, [List All Tickets](https://developers.freshdesk.com/api/#list_all_tickets) (trade-off below) |
| same company | list `company_id=<id>&updated_since=<N days ago>` | 30,000 | 1 | documented, [List All Tickets](https://developers.freshdesk.com/api/#list_all_tickets) |
| resolved or closed in the last N days | search `(status:4 OR status:5) AND updated_at:>'<day>'` | 300 | 4 | documented, [Filter Tickets](https://developers.freshdesk.com/api/#filter_tickets) |
| subject keyword overlap | local, on the candidates | — | 0 | no API (no full text, [Filter Tickets](https://developers.freshdesk.com/api/#filter_tickets)) |

Candidates come from the last three sources (one page of each by default);
category and keyword matching are local. With `updated_since=<N days ago>`
the requester and company candidates are the tickets touched in the last N
days: a similar ticket resolved long ago and not updated since is missed.
That matches the tool's "resolved or closed in the last N days".

### `export_tickets`

| Filter | Endpoint and parameter | Cap | Calls / 100 | Source |
|---|---|---|---|---|
| period | as `count_tickets`: list scan `updated_since=<period start>`, `created_at asc`, stop past the end | 30,000 and the [scan bounds](#scan-bounds) | 1 per 100 scanned | documented, [List All Tickets](https://developers.freshdesk.com/api/#list_all_tickets) |
| filter (as `count_tickets`) | search when `total` ≤ 300, else local on the list pages | 300 / 30,000 | 4 / 1 per 100 scanned | as `count_tickets` |
| conversations | `GET /tickets/{id}/conversations?per_page=100`, one per ticket | per ticket, paged | +100 (+1 per 100 more entries in a thread) | documented, [Pagination](https://developers.freshdesk.com/api/#pagination); `per_page=100` accepted (measured 2026-11-24), not shown honoured |

### `get_ticket`'s recent tickets

| Filter | Endpoint and parameter | Cap | Calls / 100 | Source |
|---|---|---|---|---|
| requester | list `requester_id=<id>&updated_since=<instant>&order_by=created_at&order_type=desc&per_page=<n>` | one page | 1 | documented, [List All Tickets](https://developers.freshdesk.com/api/#list_all_tickets) |

The probe could not tell whether `requester_id` alone lifts the 30-day
window (the requester it took has one ticket). The docs apply the window to
the list and lift it with `updated_since` (measured 2026-11-24), so the
recent-tickets call always sends `updated_since` (default: one year back,
T-026 to fix). A trade-off, not a free fix: a ticket of that requester not
updated within the year is left out, which suits "recent tickets"; for
`find_similar_tickets` see its note above.

## `uncategorized`

The default rule (SPEC §10): the last level of the first nested field is
empty; with `uncategorised_fields` set in the team file, a ticket with any
listed field empty. The first run's search for `<field>:null` on the
nested field's top and last level was a 400 `validation` (measured
2026-11-24); whether that is the nested field or the query is pending
control (`search_nested_top_value`, `search_null_dropdown`). Meanwhile, and
whatever the control says for `:null`, it is checked locally on
`custom_fields` (`null`, absent or `""` is empty), which list items and
search results both carry (measured 2026-11-24). One mechanism for both
rules, nested or not:

- **Alone** (or with `updated_since` / `created_between` only): the list
  endpoint, by default its 30-day window (C1's "recent"), with
  `updated_since` for an explicit period; 1 call per 100 tickets
  **scanned**. A `list_tickets` call scans at most a bounded number of list
  pages (the [scan bounds](#scan-bounds)) and continues through
  `next_cursor`, so one page of results can hold fewer rows than asked.
- **With a search filter**: the search query for the other filters, then the
  local check on its results: at most 300 scanned, 10 calls.

## Past 300 results

Search refuses page 11 (400 `validation`, measured 2026-11-24), and `total`
goes above 300 (measured 2026-11-24). A tool that lists (`list_tickets`,
`search_tickets`, `triage_queue`, `find_similar_tickets`) returns what the
10 pages hold with `truncated: true`, says the total is over 300 and how to
narrow the query (a shorter `created_between`, one more filter). A tool
that needs every ticket (`count_tickets`, `export_tickets`) does not use
search past 300: it scans the list endpoint, ordered (see `count_tickets`),
within the [scan bounds](#scan-bounds), and says `truncated: true` if they
cut it.

## Scan bounds

A list scan is bounded by three things, the smallest wins: the endpoint's
300 pages (30,000 tickets); T-035's per-call budget (default 250 calls,
`confirm: true` beyond it); and the 30 s deadline when a tool runs the
whole scan under one deadline. At about 8 s for one deep page (measured
2026-11-24, one sample), 30 s holds about 3 deep pages, far below the
budget. Which deadline a scan runs under (one for the call, as `list_agents`
does, or one per page, as `paginate` allows), and so how many pages a call
can scan, is open for T-027, T-036 and T-037.

## Cost class for the limiter

`expensive` (SPEC §7.2): every call of `count_tickets`, `export_tickets`
and `find_similar_tickets`; a `list_tickets` call that scans for
`uncategorized` alone; and `triage_queue` when it fetches the stats
signals (31 requests, about 61 credits a page). `cheap`: other
`list_tickets` calls, `search_tickets`, `triage_queue` without the stats
signals and `get_ticket` (its recent tickets included), each a bounded
number of pages. A request with `include=stats` costs 2 credits (measured
2026-11-24, on the list); a plain one 1.

## Parameters

`listTickets` (T-023), on `GET /tickets`, sends:

| Parameter | Values | For |
|---|---|---|
| `per_page` | 1–100 | every list |
| `page` | 1–300 | when not following `Link` |
| `updated_since` | ISO 8601 instant, UTC (`2026-01-02T03:04:05Z`) | `list_tickets`, period scans, and **always** with `requester_id` or `company_id` |
| `order_by` | `created_at`, `due_by`, `updated_at`, `status` | ordering; `created_at` for period scans |
| `order_type` | `asc`, `desc` | ordering; `asc` for period scans |
| `include` | `stats` (+1 credit) | a caller that needs `stats` |
| `requester_id` | a contact id | the requester filter: `get_ticket`'s recent tickets, `find_similar_tickets` |
| `company_id` | a company id | `find_similar_tickets` |

Not sent: `filter` (per-agent predefined views, no tool uses one), `email`,
`unique_external_id`, and any field filter (`status` is refused, measured
2026-11-24).

`searchTickets` (T-024), on `GET /search/tickets`: `query` (the conditions
in double quotes, ≤ 512 characters, percent-encoded) and `page` (1–10). No
`include` (refused, measured 2026-11-24). The client encodes the query with
`URLSearchParams`, a space as `+`; whether search reads `+` as a space is
pending control (`search_spaced_or`, `search_spaced_and`).

`viewTicket` (`GET /tickets/{id}`, T-023's `getTicket`) with
`include=stats` serves `triage_queue`'s two stats signals.

## Open

Every filter row is documented or measured. Still open, with the tasks it
bears on:

| Question | Why open | Bears on |
|---|---|---|
| Does search read `+` as a space? | the first run's passing queries had no space | T-024, T-028, T-043 (pending control `search_spaced_*`) |
| Is the nested `:null` refusal the field or the query? | no positive control in the first run | T-043, T-027 (pending control `search_nested_top_value`, `search_null_dropdown`); the local check stands either way |
| Is the deep page slow for its depth or its order? | one sample, `created_at asc` only | T-027, T-036, T-037 (pending control `list_updated_since_365d_default_order`, elapsed bands) |
| Which deadline does a list scan run under, so how many pages can a call scan? | ≈ 3 deep pages in 30 s against a 250-call budget | T-027, T-036, T-037 |
| `created_at:>'<day>'`: inclusive or exclusive of the day, and which time zone's day? | the docs give examples only | T-043, T-036, T-037 |
| Does `GET /tickets/{id}?include=stats` carry the same 8 `stats` keys as the list? | measured on the list only; the docs list three | T-029 |
| Does `requester_id` alone lift the 30-day window? | the probe's requester had one ticket | none while `updated_since` is sent with it (trade-off above; T-023, T-026, T-030) |
