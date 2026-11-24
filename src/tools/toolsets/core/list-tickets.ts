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
//     MAX_LIST_POSITION and a cursor past it sends nothing.
//   - Search: one page a call. More exists while the page is not the last of
//     the 10 and `total` reaches past it. `total` over the 300 results the 10
//     pages hold is `truncated: true`, on every page of that search.
//   - The list endpoint: one page of LIST_ROWS a call, more while Freshdesk
//     links a next page. With `uncategorized` (alone or with `updated_since`)
//     the call is a scan: pages of SCAN_PER_PAGE, each sent as `expensive`,
//     read until the list ends, the rows kept reach LIST_ROWS, SCAN_PAGES
//     pages are read, or SCAN_START_MS have passed since the call started (a
//     slow page took about 8 s once: no page is started that the deadline
//     would likely cut). The next call resumes at the next list page. A page
//     at MAX_LIST_PAGE that still links a next one is `truncated: true`.
//   - A short page is never passed off as the end: `has_more` and
//     `next_cursor` come from the source (search's `total`, the list's
//     `Link`), never from the number of rows left after the local checks. A
//     call can so return fewer rows than a page, or none, with `has_more:
//     true`; a scan can return up to LIST_ROWS - 1 + SCAN_PER_PAGE rows.
//     `truncated` is the source's too: with a date filter the search counts
//     the widened set, so it can be cut at 300 when fewer tickets match.
//   - A failed request fails the call, a scan's later page included: no
//     partial list.
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
    "Tickets matching every filter given, as compact rows: id, subject, status, priority, category, last update, agent and group, by name. detail: true returns every field of each ticket by label instead (much larger).",
    "Filters: status, priority, group and agent by name or id; type by name; tag (one tag, exact); uncategorized: true (a category field is empty); updated_since (an ISO 8601 date-time with a zone, such as 2026-01-02T03:04:05Z); created_between {from, to} (days as YYYY-MM-DD, UTC, both included). A filter that is not valid is refused with the valid names, and nothing is sent. For a custom field use search_tickets.",
    `With status, priority, group, agent, type, tag or created_between the list comes ${SEARCH_PER_PAGE} tickets a call from Freshdesk's search, which returns the first ${MAX_SEARCH_PAGE * SEARCH_PER_PAGE} matches only: past them the list is cut and says truncated: true (narrow it with one more filter or a shorter created_between), and a ticket changed in the last few minutes can be missing.`,
    `Without any of those the list is the tickets created in the last 30 days, newest first, ${LIST_ROWS} a call; updated_since replaces that window with the tickets updated since then.`,
    `uncategorized and the dates are checked on each ticket after Freshdesk answers, so a call can return fewer rows than a page, or none, and still not be the end: has_more says whether there is more, never the number of rows. While has_more is true, call again with the same arguments and next_cursor.`,
    `uncategorized without status, priority, group, agent, type, tag or created_between reads the list ${SCAN_PER_PAGE} tickets a request, up to ${SCAN_PAGES} requests a call, until it has ${LIST_ROWS} rows; it counts as an expensive operation and is refused when the API budget is low.`,
    "api_calls_used counts every request sent for this call, retries included, and the ticket-field schema's load when this call starts it.",
  ].join(" "),
  input,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  cost: `1 API call; with uncategorized and none of status, priority, group, agent, type, tag or created_between, up to ${SCAN_PAGES} (1 per ${SCAN_PER_PAGE} tickets read); all within 30 s, plus one per retry after an error, plus at least 3 when the ticket-field schema is not cached`,
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
      const last = scan ? page + SCAN_PAGES - 1 : page;
      for (;;) {
        const listed = await listTickets(
          context.http,
          { per_page: scan ? SCAN_PER_PAGE : LIST_ROWS, page, ...query.list },
          deadline,
          scan ? "expensive" : "cheap",
        );
        if (!listed.ok) return listed;
        calls += listed.attempts;
        kept.push(...listed.tickets.filter((ticket) => matchesLocal(query, ticket)));
        if (!listed.has_more) break;
        if (page === MAX_LIST_PAGE) {
          truncated = true;
          break;
        }
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
          args.detail === true
            ? ticketDetail(context, schema, ticket)
            : ticketRow(context, schema, ticket),
        ),
        ...(next === undefined ? {} : { next }),
        truncated,
        api_calls_used: calls,
      }),
    };
  },
};
