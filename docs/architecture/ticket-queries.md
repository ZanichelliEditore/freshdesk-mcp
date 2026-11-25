# Ticket queries: which endpoint serves which filter

T-022's decision note (spike). For every filter of `list_tickets`,
`triage_queue`, `count_tickets`, `find_similar_tickets` and
`export_tickets`, and for `get_ticket`'s recent tickets: the endpoint that
serves it, its cap, and what 100 tickets cost. T-023, T-024, T-043 and the
tools T-026 to T-030, T-036 and T-037 are built on it.

A row is `documented` when Freshdesk's API v2 documentation settles it (the
link names the section), or `measured 2026-11-24`: the orchestrator's three
runs of `make smoke-probes` (`scripts/smoke/smoke.ts`, `runProbes`) against
the real account on 2026-11-24, on the owner's authorisation: the first
run, the control run after the review of 2026-11-24, and T-029's run,
which added `view_include_stats`. The output is kept
in the gitignored `docs/private/`; only shapes (counts of a page, bands,
yes/no, credits) are quoted here. Anything still open is listed under
[Open](#open). This file names no account value: field names are written as
placeholders (`<nested last level>`).

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

What the three runs measured (2026-11-24; first run 16 GETs, 10 answered 200
and 6 answered 400; control run 21 GETs, 14 answered 200 and 7 answered
400; T-029's run 22 GETs, 15 answered 200 and 7 answered 400):

| Probe | Result (shape) | Means |
|---|---|---|
| `list_default` | 100 items, next page, none created over 31 days ago, 1 credit (both runs) | the 30-day window holds |
| `list_updated_since_365d` (`created_at asc`) | 100 items, all created over 31 days ago; about 8 s in the first run, `<2s` in the control run | `updated_since` lifts the window; latency varies |
| `list_updated_since_365d_default_order` (control) | 100 items, none older than 31 days (newest first), `<2s` | the order is not what made a page slow; the 8 s was variance |
| `list_status_param` | 400 `validation` | `GET /tickets` refuses a `status` parameter: no list-side field filter |
| `list_include_stats` | all 8 `stats` keys present, **2 credits** | `stats` carries `agent_responded_at`, `requester_responded_at`, `status_updated_at`, `pending_since`, `reopened_at` beyond the documented three; one include costs +1 credit, not +2 |
| `view_include_stats` (T-029's run) | all 8 `stats` keys present, **2 credits** | `GET /tickets/{id}?include=stats` carries the same 8 keys as the list, `requester_responded_at` and `agent_responded_at` among them; a view with the include costs 2 credits |
| `list_ticket_keys`, `search_ticket_keys` | `fr_due_by`, `due_by`, `nr_due_by`, `fr_escalated`, `is_escalated`, `nr_escalated`, `tags`, `custom_fields`, `requester_id`, `company_id` present on both; `stats` on neither | a search result carries the same ticket keys as a list item |
| `list_requester` (control run's requester) | 100 items, next page, 96 created over 31 days ago | **`requester_id` alone lifts the 30-day window** (the first run's requester had one ticket: inconclusive) |
| `list_requester_updated_since_2000` | the same counts | `updated_since` adds nothing to `requester_id` |
| `conversations_per_page_100` | 200, 0 items, 1 credit | `per_page=100` accepted; not shown honoured (the ticket had no conversation) |
| `search_status_open` | total 1–300, a full page of 30 | search answers |
| `search_spaced_or`, `search_spaced_and` (control) | total 1–300, 30 items each | **`+` for a space works**, with `OR` and with `AND` |
| `search_include_stats` | 400 `validation` | search refuses `include=stats` |
| `search_cap_page_1`, `_page_10`, `_page_11` | total over 300 on pages 1 and 10, 30 items each; page 11 400 `validation` | page 11 is refused; `total` goes above 300 |
| `search_null_dropdown` (control) | total over 300, 30 items, all empty | **`<plain custom dropdown>:null` works and is honoured** |
| `search_nested_top_value` (control) | 400 `validation` | **a nested field is not searchable at all**, not even its top level for one of its own values |
| `search_null_nested_top`, `_last`, `_last_30d` | 400 `validation` each (both runs) | consistent with the above |

The two endpoints, in short:

| Endpoint | Page | Cap | Calls per 100 tickets |
|---|---|---|---|
| `GET /tickets` (list) | 100 | 300 pages = 30,000 tickets (`list_tickets` without a scan asks 30 a page: 9,000) | 1 (2 credits with `include=stats`, measured 2026-11-24; `list_tickets` at 30 a page: 4) |
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
| `uncategorized` | local check of `custom_fields`: on the list pages alone, on the search results with other filters (see [below](#uncategorized)) | 30,000 (9,000 with `detail: true`, pages of 30) / 300 | 1 per 100 scanned (per 30 with `detail: true`) / 4 per 100 scanned | measured 2026-11-24 (a nested field is not searchable; both carry `custom_fields`) |
| `updated_since` | list `updated_since=<ISO instant>`, 30 a page | 9,000 (300 pages of 30; T-027) | 4 | documented, [List All Tickets](https://developers.freshdesk.com/api/#list_all_tickets); measured 2026-11-24 (lifts the 30-day window) |
| `created_between` | search `created_at:>'<from>' AND created_at:<'<to>'` (days, UTC, both kept), `created_at`'s UTC day also checked locally within from–to as a guard (T-043, T-055) | 300 | 4 | documented, [Filter Tickets](https://developers.freshdesk.com/api/#filter_tickets); exact: search's `>` and `<` keep the day given and compare UTC days (measured 2026-11-24, T-055), see [Date boundary](#date-boundary) |

Several filters at once: one search query, the conditions joined by `AND`
(spaces sent as `+`, measured 2026-11-24). `updated_since` with any search
filter becomes `updated_at:>'<its UTC day − 1>'` in the query (day
granularity, widened a day: `updated_at` was not measured, see
[Date boundary](#date-boundary)) and
`updated_at` ≥ the instant checked locally on the results (T-043, T-055); alone, it is the list endpoint, exact. `GET /tickets` refuses a `status` parameter
(measured 2026-11-24) and documents none for priority, group, agent, type
or tag: a field filter is search, or local.

### `triage_queue`

| Filter | Endpoint and parameter | Cap | Calls / 100 | Source |
|---|---|---|---|---|
| open and pending | search `status:2 OR status:3` | 300 | 4 | documented, [Filter Tickets](https://developers.freshdesk.com/api/#filter_tickets); spaced `OR` measured 2026-11-24 |

Its signals (T-029): priority, `fr_due_by`, `due_by`, `nr_due_by` and the
three escalation flags are on every search result (measured 2026-11-24): no
per-ticket call for them. The last customer message and unanswered replies
need `stats.requester_responded_at` and `stats.agent_responded_at`: `stats`
carries both on the list and on a one-ticket view (measured 2026-11-24),
but search refuses `include=stats` and the list cannot filter by status. So
those two signals cost one `GET /tickets/{id}?include=stats` per returned
row: a page of 30 rows is 31 requests, 61 credits (1 for the search, 2 per
view, measured 2026-11-24). With
them `triage_queue` is **`expensive`**; T-029 may leave them out of the
default and fetch them only on request, and states the bound either way.

T-029's choice (2026-11-24): on request only. Without `reply_signals: true`
a call is the search page alone (1 request, `cheap`) and its rows carry no
reply key. With it, one view per returned row, one after another, each sent
as `expensive` (`getTicket`'s cost argument): at most 1 + 30 = 31 requests a
call, 61 credits, retries apart; at the default pacing of 2 a second a full
page takes about 15 s of the call's one 30 s deadline. The search request
itself stays `cheap` (T-029 gives `searchTickets` no cost argument), so below
the reserve such a call spends 1 request before the first view is refused.
A result whose status is neither 2 nor 3 is dropped locally. A ticket in a
custom status is not in the queue.

What the view's `stats` gives a row (full review, 2026-11-24):

- `last_customer_reply`: `requester_responded_at`; when that is `null` the
  customer's last message is the opening one, so the ticket's `created_at`.
  `unanswered_customer_reply`: true when `agent_responded_at` is `null` or
  earlier than the customer's reply. A limit: a ticket an agent opened (an
  outbound email, a logged phone call) with no agent reply since also reads
  as unanswered, its opening counted as the customer's message; `stats`
  does not say who wrote the opening.
- `first_response_overdue`, with the flag: true only when `fr_due_by` has
  passed and `first_responded_at` is `null`. Without the flag it says only
  that the due time has passed.
- A key that is absent or not in its expected form makes the signals that
  need it `null`, a due time that has passed included; a view answered 404
  leaves that row unviewed, its reply signals `null`.
- Once a view was answered, a later view the limiter refuses unsent
  (`rate_limited`, no HTTP status: the reserve, a pacing wait that would
  reach the deadline, the hold after a 429) ends the views: every row of
  the page is returned, the rest unviewed, with
  `reply_signals_incomplete: true` and `api_calls_used` the requests sent.
  Any other failed view (a 403, an attempt cut in flight), and a refusal of
  the first view, fails the call.

Rejected: the list with `include=stats` and a local status filter. The list
cannot be asked for open tickets, so it would have to scan every ticket
updated since the oldest open one's last update; an open ticket can sit
untouched for months, so the scan has no useful bound, while the per-row
views are bounded by the page.

### `count_tickets`

| Filter | Endpoint and parameter | Cap | Calls / 100 | Source |
|---|---|---|---|---|
| period | list `updated_since=<period start>&order_by=created_at&order_type=asc`, `created_at` checked locally, stop past the period's end | 30,000 and the [scan bounds](#scan-bounds) | 1 per 100 scanned | documented, [List All Tickets](https://developers.freshdesk.com/api/#list_all_tickets); measured 2026-11-24 (`created_at asc` with `updated_since` answers) |
| status, priority, group, agent, type, tag | search when its `total` ≤ 300; else local, on the list pages | 300 / 30,000 | 4 / 1 per 100 scanned | documented, [Filter Tickets](https://developers.freshdesk.com/api/#filter_tickets), [List All Tickets](https://developers.freshdesk.com/api/#list_all_tickets) |
| `uncategorized` | local (`custom_fields` of the pages) | 30,000 | 1 per 100 scanned | measured 2026-11-24 |

A count needs every matching ticket (it groups them in code), so the
300-result search cap would cut it. It asks search page 1 first (1 call):
a `total` of 300 or less pages search (≤ 10 calls); above 300 (`total`
goes above it, measured 2026-11-24) it scans the list.

**Past 300, the list scan, ordered.** `updated_since=<period start>` with
`order_by=created_at&order_type=asc`: a ticket is updated no earlier than it
was created, so every ticket created in the period is in it; those created
before the period (updated in it) come first and are dropped, and the scan
stops at the first page whose last ticket was created after the period's
end. Weighed and rejected: splitting the period into `created_at` windows
of ≤ 300 search results each. It costs 4 calls per 100 tickets against 1,
needs a call per window to learn its `total`, and cannot split below a day
(search dates are `YYYY-MM-DD`), so a day with over 300 tickets has no
answer. A deep list page answered in under 2 s in either order in the
control run, so latency gives the windows no edge.

T-036's choices (2026-11-24, `src/tools/toolsets/core/count-tickets.ts`):

- The period is `created_between` (required): with it the query is always
  a search, so search page 1 is the probe. Every request is `expensive`.
- `total` ≤ 300: the estimate is the search pages (`estimateCalls` with
  `probe: 1` and the tickets after page 1, so page 1 is not counted twice),
  `checkBudget` before page 2. Above 300: the estimate is a floor, the probe
  plus one list page per 100 of `total`; refused up front when even that is
  over the budget, and without `confirm: true` the scan stops at the
  budget while it runs (`truncated: true`). A refusal after the probe says
  the calls already used.
- On the list pages the search filters are checked here: status, priority,
  group and agent by id (`responder_id` for the agent), type by the name
  `resolveFilter` gives, tag by exact membership in `tags` (search's own
  tag matching, case included, is not measured).
- Deadline: the scan runs under the call's one 30 s deadline and starts no
  page after 20 s (`SCAN_START_MS`), so an attempt (10 s) is not cut in
  flight; at pacing 2 a second that is about 40 list pages, 4,000 tickets
  read, so a larger period comes back `truncated: true` before the default
  budget of 250 is reached.
- `truncated: true` also for page 300 linking a next page or full, and for
  a later page the limiter refuses unsent. Any other failure fails the call.
- Full review fixes (2026-11-24): each ticket id is counted once (a
  ticket a later page repeats is skipped; one that moved the other way can
  be missing); at most 200 groups, largest first, the rest as
  `groups_not_shown` with `truncated: true`; a date-time field is refused
  (`unsupported_field`, one group per ticket); agents and groups are
  grouped by id, a name several ids share in the result shown as
  `Name (id)`; the scan stops before a page once the ticket requests,
  retries included, reach the budget.

### `find_similar_tickets`

| Filter | Endpoint and parameter | Cap | Calls / 100 | Source |
|---|---|---|---|---|
| same category fields | local, on the candidates' `custom_fields` | — | 0 | measured 2026-11-24 (a nested field is not searchable; candidates carry `custom_fields`) |
| same requester | list `requester_id=<id>&updated_since=<N days ago>` | 30,000 | 1 | documented, [List All Tickets](https://developers.freshdesk.com/api/#list_all_tickets) |
| same company | list `company_id=<id>&updated_since=<N days ago>` | 30,000 | 1 | documented, [List All Tickets](https://developers.freshdesk.com/api/#list_all_tickets) |
| resolved or closed in the last N days | search `(status:4 OR status:5) AND updated_at:>'<day>'` | 300 | 4 | documented, [Filter Tickets](https://developers.freshdesk.com/api/#filter_tickets) |
| subject keyword overlap | local, on the candidates | — | 0 | no API (no full text, [Filter Tickets](https://developers.freshdesk.com/api/#filter_tickets)) |

Candidates come from the last three sources (one page of each);
category and keyword matching are local. Here `updated_since=<N days ago>`
is the tool's own window, not a fix for the 30-day one: a ticket resolved
or closed in the last N days was updated in them, so it drops only what the
tool would drop anyway, and it keeps one page of a busy requester or
company to the tickets that can match.

T-030's choices (2026-11-24, `src/tools/toolsets/core/find-similar-tickets.ts`):

- Similar means: resolved or closed (status 4 or 5) with `updated_at` in the
  last N days (1–365, 90 by default; the last update stands in for the
  resolution time, which neither source gives), and sharing at least one of
  the category, the requester, the company. The search source exists for
  the category: it finds other customers' tickets, kept only when every
  category field (`categoryFields`, each level of a nested one) equals the
  ticket's.
- One page of each source: the requester's list and the company's list
  (100 each, `updated_since=<N days ago>`), the search (30, its day widened
  by one and `updated_at` checked locally with `matchesLocal`). A source
  with more than that page makes the result `truncated: true`. The search
  is not sent when there is no category to match (no category field, or
  one empty on the ticket): it could add no candidate (full review,
  2026-11-24).
- Hidden fields, as `get_ticket` decides them (its `shows`, failing
  closed): a team that hides the requester gets no requester list and no
  `same: "requester"`; one that hides the company, no company list and no
  `same: "company"`. A hidden category field is exempt (SPEC §7.3:
  `hidden` is not guaranteed in rows or queries): the category is still
  compared and `same: "category"` still reported.
- Ranked by subject keywords shared (lower case, NFC, runs of letters,
  marks and digits of 3 code points or more, a short English and Italian
  stop-word list left out), then the last update, then the id; the top 5
  returned. The excerpt is one `GET /tickets/{id}/conversations?per_page=100`
  per result (its first page, the oldest 100): the last public reply an
  agent wrote (`incoming: false`, `private: false`), never a private note,
  since a result can be another customer's ticket.
- **Bound: 9 requests a call** (the view, two lists, one search page, five
  thread pages), retries apart, plus the schema's load when not cached;
  every one `expensive`, the view first, so below the reserve nothing is
  sent. After the view, a limiter refusal unsent ends the reads and the
  call returns what it read with `incomplete: true`.

### `export_tickets`

| Filter | Endpoint and parameter | Cap | Calls / 100 | Source |
|---|---|---|---|---|
| period | as `count_tickets`: list scan `updated_since=<period start>`, `created_at asc`, stop past the end | 30,000 and the [scan bounds](#scan-bounds) | 1 per 100 scanned | documented, [List All Tickets](https://developers.freshdesk.com/api/#list_all_tickets) |
| filter (as `count_tickets`) | search when `total` ≤ 300, else local on the list pages | 300 / 30,000 | 4 / 1 per 100 scanned | as `count_tickets` |
| conversations | `GET /tickets/{id}/conversations?per_page=100`, one per ticket | per ticket, paged | +100 (+1 per 100 more entries in a thread) | documented, [Pagination](https://developers.freshdesk.com/api/#pagination); `per_page=100` accepted (measured 2026-11-24), not shown honoured |

T-037's choices (2026-11-24, `src/tools/toolsets/core/export-tickets.ts`):

- The read is `count_tickets`' own (`readPeriod` in
  `count-tickets.ts`, shared, not copied): the period is `created_between`
  (required), search page 1 is the probe, search when `total` ≤ 300 and the
  ordered list scan above, each ticket id once, every request `expensive`,
  the estimate and `checkBudget` before the pages, and without `confirm`
  the scan stops at the budget while it runs.
- The scan bound (the question [Scan bounds](#scan-bounds) left open): the
  one 30 s deadline of the call, no page started after 20 s
  (`SCAN_START_MS`), as `count_tickets`. Weighed and rejected: a longer
  deadline for an export. The MCP SDK gives up on a request after 60 s by
  default (`DEFAULT_REQUEST_TIMEOUT_MSEC`, read 2026-11-24 in the installed
  `@modelcontextprotocol/server`; a client may set its own), and this
  server sends no progress notification, so a
  longer export would run on with the caller already gone, its file
  written and its path never seen. So one call exports about 4,000 tickets
  at the default pacing; a larger period is exported in several calls,
  each its own file: with shorter periods, or (T-057, 2026-11-25) the same
  period paged with `next_cursor`. Background export stays out of scope.

T-057's choices (2026-11-25): a page's position on search is the index of
the next result in Freshdesk's order (the search order between two calls is
not measured); on the list scan it is the UTC second of the latest ticket
written and how many created in that second were written, and the next call
reads the list from `updated_since` one second before that second (every
ticket created then or later was updated then or later), page 1 again, so
the 300-page cap counts anew for each call, and skips what it already wrote.
A ticket updated between calls that was created before that second does not
shift the position, as a page or offset would.
- A read cut by the budget, the time limit, page 300, a later request the
  limiter refuses or a later request aborted at the call's deadline
  (`network` once it is reached: `isCut`, which `count_tickets` shares since
  the T-037 review, 2026-11-24) writes the rows read so far, with
  `truncated: true`, as `count_tickets` counts them; any other failed
  request fails the call and leaves no file.
- Conversations (`conversations: true`): `listConversations`, every page
  of the thread (at most 10 of 100), `expensive`. The estimate counts one
  call per ticket more (`estimateCalls`' `conversations`; on the search path
  one per result of `total`, on the scan one per ticket of `total`, both
  floors). A thread over one page costs more than estimated, so the budget
  (without `confirm`) and `SCAN_START_MS` are checked before each thread as
  before each page: a cut, `truncated: true`, and a ticket is written with
  its whole thread or not at all. A thread the limiter refuses, or one
  aborted at the deadline, is a cut too; any other failure fails the call.
  A thread past 10 pages (1,000 entries) is kept as read, its row marked
  `conversations_truncated: true`. At the default pacing that is about 40
  tickets with their threads a call.

### `get_ticket`'s recent tickets

| Filter | Endpoint and parameter | Cap | Calls / 100 | Source |
|---|---|---|---|---|
| requester | list `requester_id=<id>&order_by=created_at&order_type=desc&per_page=<n>` | one page | 1 | documented, [List All Tickets](https://developers.freshdesk.com/api/#list_all_tickets); window measured 2026-11-24 |

No `updated_since`: `requester_id` alone returned tickets far older than
30 days, and the same counts as with `updated_since=2000-01-01` (control
run, 2026-11-24). Sending it would add nothing and, with any later instant,
drop the requester's tickets not updated since, which "recent tickets"
should still show. The first run's decision to always send it is
withdrawn.

## `uncategorized`

The default rule (SPEC §10): the last level of the first nested field is
empty; with `uncategorised_fields` set in the team file, a ticket with any
listed field empty. A nested field is not searchable at all (a top-level
value and `:null` at every level were each a 400 `validation`, measured
2026-11-24), so the default rule is checked locally on `custom_fields`
(`null`, absent or `""` is empty), which list items and search results both
carry (measured 2026-11-24):

- **Alone** (or with `updated_since` only): the list
  endpoint, by default its 30-day window (C1's "recent"), with
  `updated_since` for an explicit period; 1 call per 100 tickets
  **scanned**. A `list_tickets` call scans at most a bounded number of list
  pages (the [scan bounds](#scan-bounds)) and continues through
  `next_cursor`, so one page of results can hold fewer rows than asked.
- **With a search filter**: the search query for the other filters, then the
  local check on its results: at most 300 scanned, 10 calls.
  `created_between` is a search filter here like any other (T-043, 2026-11-24):
  a list scan of a created-at window, as `count_tickets` does, is not built
  for `list_tickets`.

Which fields are checked (T-043, `src/tools/ticket-query.ts`, through
`categoryFields` of `src/tools/rows.ts`, so a row's `category` and the
filter read the setting the same way): the fields `uncategorised_fields`
names, each name matched to a field's label or API name (trimmed, NFC, any
case), and **a nested level's label or API name selects its parent nested
field**; with the setting absent, the first nested field. A nested field is
checked at its last level (`custom_fields[<last level>]`), whichever of its
names was listed; any other field where the ticket holds it (a custom field
in `custom_fields`, a default one at the top level under its ticket key,
`group` as `group_id`). A ticket is uncategorised when any checked field is
empty. With no field to check (no nested field and no setting, or a setting
that names no field), `uncategorized` is a `validation` error.

A plain custom dropdown does work with search `:null`, and the results are
really empty (measured 2026-11-24). Chosen anyway: the local check for
every field, nested or plain. The default rule is a nested field, so search
could serve only a team override that lists plain fields alone; for that
case a second mechanism would bring its 300-result cap and a query to
build, against a saving only when few tickets are uncategorised. If such an
override appears, `<field>:null` per plain field joined by `OR` is the
measured way to ask it (T-043 may add it then).

## Past 300 results

Search refuses page 11 (400 `validation`, measured 2026-11-24), and `total`
goes above 300 (measured 2026-11-24). A tool that lists (`list_tickets`,
`search_tickets`, `triage_queue`, `find_similar_tickets`) returns what the
10 pages hold with `truncated: true` in its envelope; that the total is
over 300 and how to narrow the query (a shorter `created_between`, one more
filter) is said in the tool's description, not in the result (T-027). A tool
that needs every ticket (`count_tickets`, `export_tickets`) does not use
search past 300: it scans the list endpoint, ordered (see `count_tickets`),
within the [scan bounds](#scan-bounds), and says `truncated: true` if they
cut it.

## Scan bounds

A list scan is bounded by three things, the smallest wins: the endpoint's
300 pages (30,000 tickets); T-035's per-call budget (default 250 calls,
`confirm: true` beyond it); and the deadline the scan runs under. A deep
page took about 8 s once and under 2 s twice (measured 2026-11-24): the
latency varies, so the bound is the deadline, not a page count assumed from
one sample. Under one 30 s deadline for the whole call, a scan may get as
few as 3 slow pages; with `paginate`'s 30 s per page, the budget is the
bound. Every scan runs under the one 30 s deadline of its call (settled by
T-037, 2026-11-24, for the last tool that scanned without one).
`count_tickets` (T-036, 2026-11-24) runs under it and starts no page after
20 s: about 40 list pages (4,000 tickets) at the default pacing, below the
default budget; `confirm: true` lifts the budget only. `export_tickets`
(T-037, 2026-11-24) reads through the same code, so the same bound: see
[`export_tickets`](#export_tickets).

`list_tickets` (T-027, 2026-11-24) runs its `uncategorized` scan under the
one 30 s deadline of the call, and so that the deadline does not cut a page
it starts none once 15 s of it are spent; it also stops at 10 list pages a
call (1,000 tickets read) or once it holds 30 rows, and gives `next_cursor`
for the next list page: at most 129 rows a call. With `detail: true` its
pages are 30 tickets, so at most 59 tickets a call, each text value cut at
1,000 code points. A failed page fails the call, with one exception: when
at least one page was read and the limiter refuses a later one
(`rate_limited` with no HTTP status), the call returns the rows kept so far
with `next_cursor` at the refused page, so a retry resumes there. A limiter
wait that would reach the call's deadline is refused that way too, so near
the 30 s mark a later page takes the partial-return branch; only an attempt
cut in flight (`network`), or Freshdesk's own refusal such as a 403, fails
the call. The list's
page 300 is the last: when it links a next page or comes back full,
`list_tickets` says `truncated: true`.

## Cost class for the limiter

`expensive` (SPEC §7.2): every call of `count_tickets`, `export_tickets`
and `find_similar_tickets`; a `list_tickets` call that scans for
`uncategorized` alone; and `triage_queue` when it fetches the stats
signals (31 requests, 61 credits a page). `cheap`: other
`list_tickets` calls, `search_tickets`, `triage_queue` without the stats
signals and `get_ticket` (its recent tickets included), each a bounded
number of pages. A request with `include=stats` costs 2 credits (measured
2026-11-24, on the list and on a one-ticket view); a plain one 1.

`searchTickets` sends every request as `cheap` (T-024) unless its caller
gives the optional cost argument (T-030, 2026-11-24: `find_similar_tickets`
gives `expensive`, as it does for its view, lists and conversation pages).
`listTickets`
(T-023) does too unless its caller gives the optional cost argument (T-027,
2026-11-24: `list_tickets` gives `expensive` for its `uncategorized` scan),
and so does `getTicket` (T-029, 2026-11-24: `triage_queue` gives `expensive`
for its view per row).
T-036 and T-037 must give it for their scans and to `searchTickets`, so
the pages of `count_tickets` and `export_tickets` go to the limiter as
`expensive` (`count_tickets` does, T-036, 2026-11-24; `export_tickets` does,
through the same read, T-037, 2026-11-24).

## Parameters

`listTickets` (T-023), on `GET /tickets`, sends:

| Parameter | Values | For |
|---|---|---|
| `per_page` | 1–100 | every list |
| `page` | 1–300 | when not following `Link` |
| `updated_since` | ISO 8601 instant, UTC (`2026-01-02T03:04:05Z`) | `list_tickets`, period scans, `find_similar_tickets`' N-day window; optional, never required by `requester_id` |
| `order_by` | `created_at`, `due_by`, `updated_at`, `status` | ordering; `created_at` for period scans and recent tickets |
| `order_type` | `asc`, `desc` | ordering; `asc` for period scans, `desc` for recent tickets |
| `include` | `stats` (+1 credit) | a caller that needs `stats` |
| `requester_id` | a contact id | the requester filter: `get_ticket`'s recent tickets (alone, no window), `find_similar_tickets` |
| `company_id` | a company id | `find_similar_tickets` |

Not sent: `filter` (per-agent predefined views, no tool uses one), `email`,
`unique_external_id`, and any field filter (`status` is refused, measured
2026-11-24).

`searchTickets` (T-024), on `GET /search/tickets`: `query` (the conditions
in double quotes, ≤ 512 characters, percent-encoded) and `page` (1–10). No
`include` (refused, measured 2026-11-24). The client encodes the query with
`URLSearchParams`, a space as `+`; search reads it as a space with `OR` and
with `AND` (measured 2026-11-24). A nested field cannot be queried
(measured 2026-11-24): T-043 must not build a search condition on one. `searchTickets` refuses a query
containing `"` or `\` before sending (`validation`, nothing sent; T-024),
so T-043 must quote values with single quotes and refuse or drop `"` and
`\` in values itself. T-043 refuses (2026-11-24): a tag or ticket type
containing `'`, `"`, `\` or a control or format character (`\p{Cc}`,
`\p{Cf}`) is a `validation` error and no query is built. Freshdesk
documents no escape inside single quotes, so a quote could end the value
and add a clause; ` OR ` inside the quotes stays one value. The two date
filters of a search (T-055, 2026-11-24): `created_between` asks exactly its
days, measured; `updated_since` asks `updated_at:>'<its UTC day − 1>'`,
widened a day because `updated_at`'s boundary was not measured. Both are
also checked locally (`matchesLocal` in `src/tools/ticket-query.ts`):
`updated_since` needs it for the widened day and the time before the
instant; for `created_between` it is a guard that drops nothing the
measured search returns.

What the local check costs. With `updated_since` beside a search filter,
the search returns the day before and the whole UTC day of the instant, so
its 300-result cap and its `total` count tickets updated before the
instant too: a page can yield fewer rows than it fetched, and `total` is
not the filter's count. This bears on T-027's `truncated` and on T-036's
counts (never `total` for a search with `updated_since`). For
`created_between` without `updated_since`, `total` is the filter's count
when its `total` ≤ 300. Every caller of `buildTicketQuery` must apply
`matchesLocal` to each returned ticket.

### Date boundary

Measured 2026-11-24 on the real account (T-055, `make smoke-date-probes`;
probed days 2026-11-17, 2026-11-18 and 2026-11-19, each against a local
count from the list endpoint by UTC day and by the account's time-zone day,
with tickets on a different day in each). Verdict, 1 of 8 readings
predicting all 15 totals: `> inclusive, < inclusive, UTC day`. So:

- `created_at:>'D'` keeps day D and after, `created_at:<'D'` keeps day D
  and before; `created_at:'D'` and `created_at:>'D' AND created_at:<'D'`
  are both exactly day D.
- The day is the UTC day, not the account's time-zone day.
- `count_tickets` and `export_tickets` (T-036, T-037) count exactly from
  `created_at:>'<from>' AND created_at:<'<to>'` when its `total` ≤ 300.
- `updated_at` probably follows the same rule (the same date operators),
  but it was not measured: `updated_since` keeps its one-day widening and
  the local instant check until it is.

`viewTicket` (`GET /tickets/{id}`, T-023's `getTicket`) with
`include=stats` serves `triage_queue`'s stats signals; the view carries
all 8 `stats` keys (measured 2026-11-24).

## Open

Every filter row is documented or measured. Still open, with the tasks it
bears on:

| Question | Why open | Bears on |
|---|---|---|
| Does page 300 of `GET /tickets` carry a `Link` to a page 301 when more tickets exist? | the 300-page limit is documented, not measured | T-027 (`list_tickets` also takes a full page 300 as cut), T-036, T-037 |
| Does `company_id` alone lift the 30-day window, as `requester_id` does? | not probed | none while `find_similar_tickets` sends its N-day `updated_since` (T-030) |
