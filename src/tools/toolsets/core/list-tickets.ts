// `list_tickets` (SPEC §8.2, §8.4, C1): the filtered, paged ticket list, as
// compact rows (rows.ts's `ticketRow`) or, with `detail: true`, each ticket in
// full (`ticketDetail`), in the list envelope.
//
//   - The nine filters become one request through `buildTicketQuery`
//     (ticket-query.ts; docs/architecture/ticket-queries.md): status,
//     priority, group, agent, type, tag and `created_between` are one search
//     query; with none of them the list endpoint serves the call.
//     `matchesLocal` is applied to every ticket either endpoint returns: the
//     widened dates of a search and `uncategorized` are checked here.
//   - The cursor is read first, before any request. A position is a page of
//     the source: of search (30 results) with a search filter, of the list
//     endpoint without. Which source a call uses is known from its arguments
//     alone (`SEARCH_FILTERS`, the filters `buildTicketQuery` turns into
//     search conditions), so the bound is MAX_SEARCH_POSITION or
//     MAX_LIST_POSITION and a cursor past it sends nothing. Should the query
//     built ever name the other source, the handler throws (the registry
//     answers with its fixed internal error) and no ticket request is sent.
//   - Search: one page a call. More exists while the page is not the last of
//     the 10 and `total` reaches past it. `total` over the 300 results the 10
//     pages hold is `truncated: true`, on every page of that search.
//   - The list endpoint: one page of LIST_ROWS a call, more while Freshdesk
//     links a next page. With `uncategorized` (alone or with `updated_since`)
//     the call is a scan: pages of SCAN_PER_PAGE (DETAIL_SCAN_PER_PAGE with
//     `detail: true`), each sent as `expensive`, read until the list ends,
//     the rows kept reach LIST_ROWS, SCAN_PAGES pages are read, or
//     SCAN_START_MS have passed since the call started (a slow page took
//     about 8 s once: no page is started that the deadline would likely
//     cut). The next call resumes at the next list page. The page at
//     MAX_LIST_PAGE is the last Freshdesk returns: when it links a next one,
//     or comes back full (whether it carries a `Link` is documented, not
//     measured), the list is `truncated: true`.
//   - A short page is never passed off as the end: `has_more` and
//     `next_cursor` come from the source (search's `total`, the list's
//     `Link`), never from the number of rows left after the local checks. A
//     call can so return fewer rows than a page, or none, with `has_more:
//     true`; a scan can return up to SCAN_MAX_ROWS rows (DETAIL_SCAN_MAX_ROWS
//     tickets with `detail: true`): one short of LIST_ROWS, then a whole page.
//     `truncated` is the source's too: with a date filter the search counts
//     the widened set, so it can be cut at 300 when fewer tickets match.
//   - `detail: true` is bounded: each wrapped value, the description
//     included, is cut at DETAIL_VALUE_CAP code points with the marker
//     (`get_ticket` returns more of the text), and a scan reads the smaller page.
//   - A failed request fails the call: no partial list. One exception: a
//     scan that has read at least one page and whose next page the limiter
//     refuses (`rate_limited` with no HTTP status) returns the rows kept so
//     far, with `next_cursor` at the refused page, so a retry resumes there
//     instead of reading the pages again. That page's own requests, if a
//     retry of it was what the limiter refused (after a 5xx, or after a 429
//     whose hold outlasts the limiter's wait), are counted. A limiter wait
//     that would reach the call's deadline is refused the same way
//     (`rate_limited`, no status), so near the 30 s mark a later page takes
//     this branch too. Any other failure of a later page fails the call: a
//     403, or an attempt the deadline cuts in flight (`network`).
//   - One deadline for the whole call, CALL_DEADLINE_MS from its start, shared
//     by every request.
//   - `api_calls_used` is every request this call sent, retries included, and
//     the schema's load when this call started it (the service's `attempts`).

import { z } from "zod";
import {
  MAX_SEARCH_PAGE,
  SEARCH_PER_PAGE,
  searchTickets,
} from "../../../client/resources/search.js";
import { listTickets, MAX_LIST_PAGE, type Ticket } from "../../../client/resources/tickets.js";
import { listEnvelope, readCursor } from "../../list.js";
import { ticketDetail, ticketRow } from "../../rows.js";
import { buildTicketQuery, matchesLocal } from "../../ticket-query.js";
import type { Tool } from "../index.js";

/** One call's requests end within this, all of them together. */
const CALL_DEADLINE_MS = 30_000;

/** Rows of one list-endpoint page, and where a scan stops reading: search's page size. */
export const LIST_ROWS = SEARCH_PER_PAGE;
/** Tickets of one list page of a scan: the endpoint's largest page. */
export const SCAN_PER_PAGE = 100;
/** The same with `detail: true`, where each ticket is far larger. */
export const DETAIL_SCAN_PER_PAGE = LIST_ROWS;
/** The most rows a scan returns: one short of LIST_ROWS, then a whole page. */
export const SCAN_MAX_ROWS = LIST_ROWS - 1 + SCAN_PER_PAGE;
export const DETAIL_SCAN_MAX_ROWS = LIST_ROWS - 1 + DETAIL_SCAN_PER_PAGE;
/** Code points of one text value of a ticket with `detail: true`. */
export const DETAIL_VALUE_CAP = 1000;
/** The most list pages one call scans. */
export const SCAN_PAGES = 10;
/** A scan starts no further page once this much of the call's deadline is spent. */
export const SCAN_START_MS = CALL_DEADLINE_MS / 2;
/** The last cursor position of a call search serves: search's last page. */
export const MAX_SEARCH_POSITION = MAX_SEARCH_PAGE - 1;
/** The last cursor position of a call the list endpoint serves: its last page. */
export const MAX_LIST_POSITION = MAX_LIST_PAGE - 1;

/** The filters `buildTicketQuery` makes search conditions: any of them given, search serves the call. */
const SEARCH_FILTERS = [
  "status",
  "priority",
  "group",
  "agent",
  "type",
  "tag",
  "created_between",
] as const;

const nameOrId = z.union([z.string(), z.number()]);

const input = z.object({
  status: nameOrId.optional(),
  priority: nameOrId.optional(),
  group: nameOrId.optional(),
  agent: nameOrId.optional(),
  type: z.string().optional(),
  tag: z.string().optional(),
  uncategorized: z.boolean().optional(),
  updated_since: z.string().optional(),
  created_between: z.object({ from: z.string(), to: z.string() }).optional(),
  detail: z.boolean().optional(),
  cursor: z.string().optional(),
});

export const listTicketsTool: Tool<typeof input> = {
  name: "list_tickets",
  description: [
    `Tickets matching every filter given, as compact rows: id, subject, status, priority, category, last update, agent and group, by name. detail: true returns every field of each ticket by label instead (much larger), each text cut at ${DETAIL_VALUE_CAP.toLocaleString("en-US")} characters, saying how many are not shown: get_ticket returns more of the text.`,
    "Filters: status, priority, group and agent by name or id; type by name; tag (one tag, exact); uncategorized: true (a category field is empty); updated_since (an ISO 8601 date-time with a zone, such as 2026-01-02T03:04:05Z); created_between {from, to} (days as YYYY-MM-DD, UTC, both included). A filter that is not valid is refused with the valid names, and nothing is sent. For a custom field use search_tickets.",
    `With status, priority, group, agent, type, tag or created_between the list comes ${SEARCH_PER_PAGE} tickets a call from Freshdesk's search, which returns the first ${MAX_SEARCH_PAGE * SEARCH_PER_PAGE} matches only: past them the list is cut and says truncated: true (narrow it with one more filter or a shorter created_between), and a ticket changed in the last few minutes can be missing.`,
    `Without any of those the list is the tickets created in the last 30 days, newest first, ${LIST_ROWS} a call; updated_since replaces that window with the tickets updated since then. That list reaches ${MAX_LIST_PAGE} calls (${(MAX_LIST_PAGE * LIST_ROWS).toLocaleString("en-US")} tickets): past them it is cut and says truncated: true (narrow it with a later updated_since or a filter).`,
    `uncategorized and the dates are checked on each ticket after Freshdesk answers, so a call can return fewer rows than a page, or none, and still not be the end: has_more says whether there is more, never the number of rows. While has_more is true, call again with the same arguments and next_cursor.`,
    `uncategorized without status, priority, group, agent, type, tag or created_between reads the list ${SCAN_PER_PAGE} tickets a request (${DETAIL_SCAN_PER_PAGE} with detail: true), up to ${SCAN_PAGES} requests a call, until it has ${LIST_ROWS} rows: a call returns at most ${SCAN_MAX_ROWS} rows, or ${DETAIL_SCAN_MAX_ROWS} tickets with detail: true. It counts as an expensive operation and is refused when the API budget is low; refused part-way, it returns what it has with next_cursor.`,
    "api_calls_used counts every request sent for this call, retries included, and the ticket-field schema's load when this call starts it.",
  ].join(" "),
  input,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  cost: `1 API call; with uncategorized and none of status, priority, group, agent, type, tag or created_between, up to ${SCAN_PAGES} (1 per ${SCAN_PER_PAGE} tickets read, per ${DETAIL_SCAN_PER_PAGE} with detail: true); all within 30 s, plus one per retry after an error, plus at least 3 when the ticket-field schema is not cached`,
  customerText: true,
  async handler(args, context) {
    const call = { tool: "list_tickets", args };
    const searched = SEARCH_FILTERS.some((name) => args[name] !== undefined);
    const cursor = readCursor(call, searched ? MAX_SEARCH_POSITION : MAX_LIST_POSITION);
    if (!cursor.ok) return cursor;
    const started = Date.now();
    const deadline = started + CALL_DEADLINE_MS;
    const loaded = await context.schema.get();
    if (!loaded.ok) return loaded;
    const { schema } = loaded;
    const query = buildTicketQuery(context, schema, args);
    if (!query.ok) return query;
    if (searched !== (query.endpoint === "search")) {
      // The cursor's bound was chosen for the other source: fail closed.
      throw new Error("list_tickets: SEARCH_FILTERS and buildTicketQuery disagree");
    }
    const detail = args.detail === true;

    let calls = loaded.attempts;
    const kept: Ticket[] = [];
    let next: number | undefined;
    let truncated = false;
    let page = cursor.position + 1;

    if (query.endpoint === "search") {
      const found = await searchTickets(context.http, query.query, page, deadline);
      if (!found.ok) return found;
      calls += found.attempts;
      kept.push(...found.results.filter((ticket) => matchesLocal(query, ticket)));
      truncated = found.total > MAX_SEARCH_PAGE * SEARCH_PER_PAGE;
      if (page < MAX_SEARCH_PAGE && page * SEARCH_PER_PAGE < found.total) next = page;
    } else {
      const scan = query.uncategorized !== undefined;
      const first = page;
      const last = scan ? page + SCAN_PAGES - 1 : page;
      const perPage = !scan ? LIST_ROWS : detail ? DETAIL_SCAN_PER_PAGE : SCAN_PER_PAGE;
      for (;;) {
        const listed = await listTickets(
          context.http,
          { per_page: perPage, page, ...query.list },
          deadline,
          scan ? "expensive" : "cheap",
        );
        if (!listed.ok) {
          const { code, http_status } = listed.error;
          if (page === first || code !== "rate_limited" || http_status !== null) return listed;
          // The limiter refused a later page of a scan: keep what was read.
          calls += listed.attempts ?? 0;
          next = page - 1;
          break;
        }
        calls += listed.attempts;
        kept.push(...listed.tickets.filter((ticket) => matchesLocal(query, ticket)));
        if (page === MAX_LIST_PAGE) {
          truncated = listed.has_more || listed.tickets.length === perPage;
          break;
        }
        if (!listed.has_more) break;
        if (page === last || kept.length >= LIST_ROWS || Date.now() - started >= SCAN_START_MS) {
          // The position of list page `page + 1`.
          next = page;
          break;
        }
        page += 1;
      }
    }

    return {
      ok: true,
      value: listEnvelope(call, {
        items: kept.map((ticket) =>
          detail
            ? ticketDetail(context, schema, ticket, {
                cap: DETAIL_VALUE_CAP,
                rest: "get_ticket returns more of the text",
              })
            : ticketRow(context, schema, ticket),
        ),
        ...(next === undefined ? {} : { next }),
        truncated,
        api_calls_used: calls,
      }),
    };
  },
};
