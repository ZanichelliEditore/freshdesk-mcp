// `search_tickets` (SPEC §8.2, §5): Freshdesk's ticket query language, passed
// through, with its limits said in the description. Rows are rows.ts's
// `ticketRow`, in the list envelope.
//
//   - The query goes to `searchTickets` as written: nothing is parsed,
//     trimmed or rewritten, and no rule looks for a field the team hides
//     (owner, 2026-11-23). The rows still leave a hidden field out
//     (`ticketRow`). `searchTickets` adds the double quotes and refuses,
//     with nothing sent to search, a blank query, one containing `"` or `\`,
//     and one over its length limit: `validation` naming `query`, never its
//     text. Freshdesk's own refusal (a 400 for a field that is not
//     searchable, or a query it cannot parse) is returned as is, with its
//     `errors[]`. A nested (dependent) field, at any level, is not
//     searchable (Freshdesk answers 400).
//   - The cursor is read first, before any request. A position is a search
//     page, so the bound is search.ts's MAX_SEARCH_POSITION, search's
//     last page: a cursor past it sends nothing.
//   - One page of SEARCH_PER_PAGE a call. `has_more` and `next_cursor` come
//     from search's `total` alone, never from the number of rows: more exists
//     while the page is not the last of the 10 and `total` reaches past it.
//     `total` over the 300 results the 10 pages hold is `truncated: true`, on
//     every page.
//   - One deadline for the whole call, CALL_DEADLINE_MS from its start.
//   - `api_calls_used` is every request this call sent, retries included, and
//     the schema's load when this call started it (the service's `attempts`).
//     The schema is taken before the query is checked: a refused query on a
//     schema not yet cached has loaded it.

import { z } from "zod";
import {
  MAX_QUERY_LENGTH,
  MAX_SEARCH_PAGE,
  MAX_SEARCH_POSITION,
  SEARCH_PER_PAGE,
  searchTickets,
} from "../../../client/resources/search.js";
import { listEnvelope, readCursor } from "../../list.js";
import { ticketRow } from "../../rows.js";
import type { Tool } from "../index.js";

/** One call's requests end within this, all of them together. */
const CALL_DEADLINE_MS = 30_000;

const input = z.object({
  query: z.string(),
  cursor: z.string().optional(),
});

export const searchTicketsTool: Tool<typeof input> = {
  name: "search_tickets",
  description: [
    "Tickets matching a query in Freshdesk's ticket query language, as compact rows: id, subject, status, priority, category, last update, agent and group, by name. For the common filters (status, priority, group, agent, type, tag, dates) list_tickets is simpler and takes names; use this for a custom field or for OR.",
    "query is conditions field:value joined by AND or OR, with parentheses: status:2 AND (priority:3 OR priority:4) AND cf_model:'Blue sprocket'. A number or true/false is written bare; text and a date (YYYY-MM-DD, UTC) go in single quotes. :> and :< compare dates and numbers (created_at:>'2026-01-01'; on created_at, :> and :< keep the day given (inclusive) and the day is the UTC day (measured 2026-11-24); for any other date field (updated_at, due_by, fr_due_by, custom dates) the rule is not measured, so widen the range by a day), and field:null finds a field with no value. Searchable fields: status, priority, agent_id and group_id by id, type, tag, due_by, fr_due_by, created_at, updated_at, and custom fields of type single-line text, number, checkbox, plain dropdown and date, each by its API name; get_ticket_schema gives the names, ids and choices.",
    `Write the query without the double quotes around it: this tool adds them. It must contain no double quote (") and no backslash (\\) and be at most ${MAX_QUERY_LENGTH - 2} characters; otherwise it is refused and no search is sent. It is passed to Freshdesk unchanged, and Freshdesk refuses a field that is not searchable with a validation error naming it: a nested (dependent) field, at any level, is not searchable (Freshdesk answers 400).`,
    "There is no full text: search matches field values only, never words in the subject, the description or the conversations.",
    `Results come ${SEARCH_PER_PAGE} a call, and Freshdesk returns the first ${MAX_SEARCH_PAGE * SEARCH_PER_PAGE} matches only: past them the list is cut and says truncated: true (narrow the query with one more condition or a shorter date range). A ticket changed in the last few minutes can be missing. While has_more is true, call again with the same arguments and next_cursor.`,
    "api_calls_used counts every request sent for this call, retries included, and the ticket-field schema's load when this call starts it.",
  ].join(" "),
  input,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  cost: "1 API call, within 30 s, plus one per retry after an error, plus at least 3 when the ticket-field schema is not cached",
  customerText: true,
  async handler(args, context) {
    const call = { tool: "search_tickets", args };
    const cursor = readCursor(call, MAX_SEARCH_POSITION);
    if (!cursor.ok) return cursor;
    const deadline = Date.now() + CALL_DEADLINE_MS;
    const loaded = await context.schema.get();
    if (!loaded.ok) return loaded;
    const { schema } = loaded;

    const page = cursor.position + 1;
    const found = await searchTickets(context.http, args.query, page, deadline);
    if (!found.ok) return found;
    const more = page < MAX_SEARCH_PAGE && page * SEARCH_PER_PAGE < found.total;

    return {
      ok: true,
      value: listEnvelope(call, {
        items: found.results.map((ticket) => ticketRow(context, schema, ticket)),
        ...(more ? { next: page } : {}),
        truncated: found.total > MAX_SEARCH_PAGE * SEARCH_PER_PAGE,
        api_calls_used: loaded.attempts + found.attempts,
      }),
    };
  },
};
