// Tickets (SPEC §7.1, §5): typed reads of tickets and their conversations,
// with the parameters docs/architecture/ticket-queries.md ("Parameters")
// chose. Search is T-024's.
//
//   - `listTickets`: one page of `GET /tickets`, and whether another exists
//     (a `Link` to it). It sends `per_page` (100 unless given) and only the
//     other parameters given, field by field: no `updated_since` unless asked,
//     since `requester_id` alone lifts the 30-day window (measured 2026-11-24).
//   - `getTicket`: `GET /tickets/{id}`, with the includes asked for.
//   - `listConversations`: every page of `GET /tickets/{id}/conversations`,
//     through `list-all.ts`: 100 per page, at most 10 pages, `truncated`.
//
// A ticket needs a whole-number `id`, `requester_id`, `status` and
// `priority`, a string `subject` and a `custom_fields` object; a conversation
// a whole-number `id` and `user_id`, a string `body`, booleans `incoming` and
// `private`. Keys this module does not know are passed through. A body in any
// other shape is `server` with the response's real status, not retryable,
// and a message of fixed text that quotes nothing from the body. An HTTP
// failure is returned unchanged.
//
// `attempts` is the requests sent, retries included: what a tool reports as
// API calls. `deadline` (epoch ms, optional) is the caller's: see
// `requestWithRetry` and `paginate`.

import { z } from "zod";
import type { FreshdeskError } from "../errors.js";
import type { HttpClient } from "../http.js";
import { listAll, type ListResult, PER_PAGE } from "./list-all.js";

const ticket = z.looseObject({
  id: z.number().int(),
  subject: z.string(),
  status: z.number().int(),
  priority: z.number().int(),
  requester_id: z.number().int(),
  custom_fields: z.record(z.string(), z.unknown()),
});

const conversation = z.looseObject({
  id: z.number().int(),
  user_id: z.number().int(),
  body: z.string(),
  incoming: z.boolean(),
  private: z.boolean(),
});

export type Ticket = z.infer<typeof ticket>;
export type Conversation = z.infer<typeof conversation>;

export interface ListTicketsOptions {
  /** 1–100; 100 when not given. */
  per_page?: number;
  /** 1–300. */
  page?: number;
  /** An ISO 8601 instant, UTC: `2026-01-02T03:04:05Z`. */
  updated_since?: string;
  order_by?: "created_at" | "due_by" | "updated_at" | "status";
  order_type?: "asc" | "desc";
  /** +1 credit per request (measured 2026-11-24). */
  include?: "stats";
  /** The requester filter. */
  requester_id?: number;
  company_id?: number;
}

export type ListTicketsResult =
  | { ok: true; tickets: Ticket[]; has_more: boolean; attempts: number }
  | { ok: false; error: FreshdeskError };

/** The includes `GET /tickets/{id}` takes besides `conversations` (first ten only). */
export type TicketInclude = "stats" | "requester" | "company";

export type TicketResult =
  { ok: true; ticket: Ticket; attempts: number } | { ok: false; error: FreshdeskError };

export type ConversationsResult = ListResult<Conversation>;

const OPTIONAL = [
  "page",
  "updated_since",
  "order_by",
  "order_type",
  "include",
  "requester_id",
  "company_id",
] as const;

export async function listTickets(
  http: HttpClient,
  options: ListTicketsOptions = {},
  deadline?: number,
): Promise<ListTicketsResult> {
  const query: Record<string, string | number> = { per_page: options.per_page ?? PER_PAGE };
  for (const name of OPTIONAL) {
    const value = options[name];
    if (value !== undefined) query[name] = value;
  }
  const pages = http.paginate({ path: "/tickets", query }, { pages: 1 }, deadline);
  let tickets: Ticket[] = [];
  for (;;) {
    // By hand, not `for await`: the return value is where `truncated` is.
    const step = await pages.next();
    if (step.done) {
      // One page asked for: `truncated` is a `Link` to the next one.
      const { truncated, attempts } = step.value;
      return { ok: true, tickets, has_more: truncated, attempts };
    }
    const result = step.value;
    if (!result.ok) return result;
    const parsed = ticket.array().safeParse(result.body);
    if (!parsed.success) return malformed("tickets", result.status);
    tickets = parsed.data;
  }
}

export async function getTicket(
  http: HttpClient,
  id: number,
  include: readonly TicketInclude[] = [],
  deadline?: number,
): Promise<TicketResult> {
  const result = await http.requestWithRetry(
    {
      path: "/tickets/{id}",
      params: { id },
      ...(include.length === 0 ? {} : { query: { include: include.join(",") } }),
    },
    deadline,
  );
  if (!result.ok) return { ok: false, error: result.error };
  const parsed = ticket.safeParse(result.body);
  if (!parsed.success) return malformed("a ticket", result.status);
  return { ok: true, ticket: parsed.data, attempts: result.attempts };
}

export function listConversations(
  http: HttpClient,
  ticketId: number,
  deadline?: number,
): Promise<ConversationsResult> {
  return listAll(http, "/tickets/{id}/conversations", conversation, "conversations", deadline, {
    id: ticketId,
  });
}

function malformed(noun: string, status: number): { ok: false; error: FreshdeskError } {
  return {
    ok: false,
    error: {
      code: "server",
      http_status: status,
      message: `Freshdesk sent ${noun} in an unexpected shape (HTTP ${status}).`,
      retryable: false,
    },
  };
}
