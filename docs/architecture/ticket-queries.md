# Ticket queries: which endpoint serves which filter

T-022's decision note (spike). For every filter of `list_tickets`,
`triage_queue`, `count_tickets`, `find_similar_tickets` and
`export_tickets`, and for `get_ticket`'s recent tickets: the endpoint that
serves it, its cap, and what 100 tickets cost. T-023, T-024, T-043 and the
tools T-026 to T-030, T-036 and T-037 are built on it.

A row is `documented` when Freshdesk's API v2 documentation settles it (the
link names the section), `measured` with the date of the owner's run of
`make smoke-probes`, or `pending` with the probe that will settle it; every
pending row is listed under [Open](#open). This file names no account value:
field names are written as placeholders (`<nested last level>`).

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
- **View a Ticket** (`#view_a_ticket`): `include=stats` returns
  `closed_at`, `resolved_at` and `first_responded_at` (no other key is
  documented); `include=conversations` returns the first ten only.
- **Pagination** (`#pagination`): `per_page` up to 100, `Link` header to
  the next page, absent on the last.
- **Rate limit** (`#ratelimit`): every request counts, invalid ones too.

The two endpoints, in short:

| Endpoint | Page | Cap | Calls per 100 tickets |
|---|---|---|---|
| `GET /tickets` (list) | 100 | 300 pages = 30,000 tickets | 1 (3 credits with one `include`) |
| `GET /search/tickets` (search) | 30 | 10 pages = 300 results | 4 (`ceil(100 / 30)`) |
| local filter on list pages | — | the list's 30,000 | 1 per 100 tickets **scanned**, not matched |

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
| `uncategorized` | search `<nested last level>:null` (see [below](#uncategorized)) | 300 | 4 | pending: probes `search_null_nested_last`, `search_null_nested_last_30d` |
| `updated_since` | list `updated_since=<ISO instant>` | 30,000 | 1 | documented, [List All Tickets](https://developers.freshdesk.com/api/#list_all_tickets) |
| `created_between` | search `created_at:>'<from>' AND created_at:<'<to>'` (days, UTC) | 300 | 4 | documented, [Filter Tickets](https://developers.freshdesk.com/api/#filter_tickets) |

Several filters at once: one search query, the conditions joined by `AND`.
`updated_since` with any search filter becomes `updated_at:>'<day>'` in the
query (day granularity); alone, it is the list endpoint. `GET /tickets`
documents no status, priority, group, agent, type or tag parameter (probe
`list_status_param` shows whether one is refused, ignored or applied).

### `triage_queue`

| Filter | Endpoint and parameter | Cap | Calls / 100 | Source |
|---|---|---|---|---|
| open and pending | search `status:2 OR status:3` | 300 | 4 | documented, [Filter Tickets](https://developers.freshdesk.com/api/#filter_tickets) |

Its signals (T-029): priority, `fr_due_by`, `due_by` and the escalation
flags are keys of the ticket object; whether a **search result** carries
them is pending (probe `search_ticket_keys`). The last customer message and
unanswered replies need `stats.requester_responded_at` and
`stats.agent_responded_at`, which the documentation does not list: pending
(probes `list_include_stats`, `search_include_stats`). If `stats` lacks them,
the time of the last customer message costs one conversations call per
ticket (100 calls per 100 tickets), and T-029 must bound it.

### `count_tickets`

| Filter | Endpoint and parameter | Cap | Calls / 100 | Source |
|---|---|---|---|---|
| period | list `updated_since=<period start>`, `created_at` checked locally | 30,000 | 1 per 100 scanned | documented, [List All Tickets](https://developers.freshdesk.com/api/#list_all_tickets) |
| status, priority, group, agent, type, tag | local, on the list pages; or search when its `total` ≤ 300 | 30,000 / 300 | 1 per 100 scanned / 4 | documented, [List All Tickets](https://developers.freshdesk.com/api/#list_all_tickets), [Filter Tickets](https://developers.freshdesk.com/api/#filter_tickets) |
| `uncategorized` | local (`custom_fields` of the list pages) | 30,000 | 1 per 100 scanned | documented, [List All Tickets](https://developers.freshdesk.com/api/#list_all_tickets) |

A count needs every matching ticket (it groups them in code), so the
300-result search cap would cut it. It asks search page 1 first (1 call,
gives `total`); with `total` ≤ 300 it pages search (≤ 10 calls), else it
scans the list from the period's start. A ticket is updated no earlier than
it was created, so `updated_since=<period start>` returns every ticket
created in the period, plus some to drop.

### `find_similar_tickets`

| Filter | Endpoint and parameter | Cap | Calls / 100 | Source |
|---|---|---|---|---|
| same category fields | search `<field>:'<value>'` (dropdown); a nested level pending as for `uncategorized` | 300 | 4 | documented for dropdowns, [Filter Tickets](https://developers.freshdesk.com/api/#filter_tickets); nested pending |
| same requester | list `requester_id=<id>` | 30,000 | 1 | parameter documented, [List All Tickets](https://developers.freshdesk.com/api/#list_all_tickets); 30-day window pending (probes `list_requester`, `list_requester_updated_since_2000`) |
| same company | list `company_id=<id>` | 30,000 | 1 | parameter documented, [List All Tickets](https://developers.freshdesk.com/api/#list_all_tickets); window as for the requester (assumed the same, not probed) |
| resolved or closed in the last N days | search `(status:4 OR status:5) AND updated_at:>'<day>'` | 300 | 4 | documented, [Filter Tickets](https://developers.freshdesk.com/api/#filter_tickets) |
| subject keyword overlap | local, on the candidates | — | 0 | no API (no full text, [Filter Tickets](https://developers.freshdesk.com/api/#filter_tickets)) |

### `export_tickets`

| Filter | Endpoint and parameter | Cap | Calls / 100 | Source |
|---|---|---|---|---|
| period | list `updated_since=<period start>`, `created_at` checked locally | 30,000 | 1 per 100 scanned | documented, [List All Tickets](https://developers.freshdesk.com/api/#list_all_tickets) |
| filter (as `count_tickets`) | local on the list pages, or search when `total` ≤ 300 | 30,000 / 300 | 1 per 100 scanned / 4 | documented, as `count_tickets` |
| conversations | `GET /tickets/{id}/conversations?per_page=100`, one per ticket | per ticket, paged | +100 (+1 per 100 more entries in a thread) | documented, [Pagination](https://developers.freshdesk.com/api/#pagination); per_page on this endpoint confirmed by probe `conversations_per_page_100` |

### `get_ticket`'s recent tickets

| Filter | Endpoint and parameter | Cap | Calls / 100 | Source |
|---|---|---|---|---|
| requester | list `requester_id=<id>&order_by=created_at&order_type=desc&per_page=<n>` | one page | 1 | parameter documented, [List All Tickets](https://developers.freshdesk.com/api/#list_all_tickets); whether the 30-day window applies, pending (probes `list_requester`, `list_requester_updated_since_2000`) |

## `uncategorized`

The default rule (SPEC §10): the last level of the first nested field is
empty. Asked as the search query `"<nested last level>:null"`, ANDed with
the call's other filters; with `uncategorised_fields` set in the team file,
one `<field>:null` per field joined by `OR` (a ticket missing any of them is
not categorised). `null` is documented (`tag:null`), but the documented
custom field types do not include a nested field's levels: pending (probes
`search_null_nested_top`, `search_null_nested_last`,
`search_null_nested_last_30d`, which also say whether every result really
has the field empty). If search refuses it, the fallback is the list
endpoint with `updated_since` and a local check of `custom_fields` (30,000
cap, 1 call per 100 scanned).

## Past 300 results

Search refuses a page above 10 (documented). A tool that lists
(`list_tickets`, `search_tickets`, `triage_queue`, `find_similar_tickets`)
returns what the 10 pages hold with `truncated: true`, and says the total
and how to narrow the query (a shorter `created_between`, one more filter).
A tool that needs every ticket (`count_tickets`, `export_tickets`) does not
use search past 300: it scans the list endpoint from the period's start, up
to its own cap of 30,000 tickets, within the call budget (T-035), and says
`truncated: true` if that cap cuts it. Whether `total` reports the real
count above 300 is pending (probe `search_cap_page_1`).

## Cost class for the limiter

`expensive` (SPEC §7.2): every call of `count_tickets`, `export_tickets`
and `find_similar_tickets`. `cheap`: `list_tickets`, `search_tickets`,
`triage_queue` and `get_ticket` (its recent tickets included), each a
bounded number of pages. A request with `include=stats` costs 3 credits
(documented for the list; the View a Ticket section says 1 more per
include, so the probes print the credits header).

## Parameters

`listTickets` (T-023), on `GET /tickets`, sends:

| Parameter | Values | For |
|---|---|---|
| `per_page` | 1–100 | every list |
| `page` | 1–300 | when not following `Link` |
| `updated_since` | ISO 8601 instant, UTC | `list_tickets`, period scans, recent tickets (if the window applies) |
| `order_by` | `created_at`, `due_by`, `updated_at`, `status` | ordering |
| `order_type` | `asc`, `desc` | ordering |
| `include` | `stats` (and `requester`, `description` if a tool needs them) | `triage_queue` signals |
| `requester_id` | a contact id | `get_ticket`'s recent tickets, `find_similar_tickets` |
| `company_id` | a company id | `find_similar_tickets` |

Not sent: `filter` (per-agent predefined views, no tool uses one), `email`,
`unique_external_id`.

`searchTickets` (T-024), on `GET /search/tickets`: `query` (the conditions
in double quotes, ≤ 512 characters, percent-encoded) and `page` (1–10).
The client encodes the query with `URLSearchParams`, a space as `+`; the
probes send it so.

## Open

Rows neither documented nor measured, and the tasks each one blocks:

| Question | Probe(s) | Blocks |
|---|---|---|
| Does search accept `<nested level>:null`, and are the results really empty there? | `search_null_nested_top`, `search_null_nested_last`, `search_null_nested_last_30d` | T-043, T-027 (`uncategorized`), T-030 (nested category) |
| Does `requester_id` (and `company_id`) on the list lift the 30-day window? | `list_requester`, `list_requester_updated_since_2000` | T-023, T-026, T-030 |
| Which `stats` keys exist; does search take `include=stats`; what does it cost? | `list_include_stats`, `search_include_stats` | T-029, T-035 |
| Does a search result carry `fr_due_by`, `due_by`, the escalation flags, `custom_fields`? | `search_ticket_keys` | T-029, T-027 |
| Does `total` report the real count above 300; what does page 11 answer? | `search_cap_page_1`, `search_cap_page_10`, `search_cap_page_11` | T-024, T-028, T-036, T-037 |
