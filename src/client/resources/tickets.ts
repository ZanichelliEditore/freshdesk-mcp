// Tickets (SPEC §7.1, §5): typed reads of tickets and their conversations,
// with the parameters docs/architecture/ticket-queries.md ("Parameters")
// chose. Search is T-024's.
//
//   - `listTickets`: one page of `GET /tickets`, and whether another exists
//     (a `Link` to it). It sends `per_page` (100 unless given) and only the
//     other parameters given, field by field: no `updated_since` unless asked,
//     since `requester_id` alone lifts the 30-day window (measured 2026-11-24).
//   - `getTicket`: `GET /tickets/{id}`, with `include=stats` when asked. No
//     other include: a requester's or a company's data comes from T-025's
//     contact and company reads, which drop what no tool should return.
//     `stats` is passed through unchecked: its reader checks it.
//   - `listConversations`: every page of `GET /tickets/{id}/conversations`,
//     through `list-all.ts`: 100 per page, at most 10 pages, `truncated`; a
//     failed request carries `attempts`.
//   - `listConversationPage`: its first page alone (the oldest 100), and
//     whether another exists; for a caller bounded to one request a ticket
//     (`find_similar_tickets`' excerpt, T-030). Its failures, a malformed
//     page included, carry `attempts`.
//
// A ticket needs a whole-number `id`, `requester_id`, `status` and
// `priority`, a string `subject` and a `custom_fields` object; a conversation
// a whole-number `id` and `user_id`, a string `body`, booleans `incoming` and
// `private`; a reply's or a forward's answer (`sentConversation`) a positive
// whole-number `id` alone, its other keys dropped. Otherwise keys this
// module does not know are passed through. A body in any other shape is
// `server` with the response's real status, not retryable, and a message of
// fixed text that quotes nothing from the body. An HTTP failure is returned
// unchanged.
//
// Values are checked before anything is sent, whatever a cast let through:
// an id is a positive safe integer, `per_page` 1–100, `page` a whole number
// from 1, `order_by`, `order_type` and an include in their sets. Any other
// is `validation` with `http_status: null`, naming the parameter, not the
// value, and no request is sent.
//
// `attempts` is the requests sent, retries included: what a tool reports as
// API calls. `deadline` (epoch ms, optional) is the caller's: see
// `requestWithRetry` and `paginate`.
//
// Cost class: `cheap`, except a `listTickets` page, a `getTicket` view, a
// `listConversations` or a `listConversationPage` page whose caller gives
// `expensive` (a scan, `triage_queue`'s view per row, `find_similar_tickets`,
// `export_tickets`' threads:
// docs/architecture/ticket-queries.md, "Cost class for the limiter"). A
// `listTickets` page, a `getTicket` view or a `listConversationPage` page
// that fails after its values were accepted carries `attempts` too: the
// requests sent for it, 0 when the limiter refused it before any.

import { z } from "zod";
import type { FreshdeskError } from "../errors.js";
import type { GetHttp } from "../http.js";
import type { CostClass } from "../rate-limit.js";
import { listAll, type ListResult, PER_PAGE } from "./list-all.js";

/** A ticket as a list, a view and a search result carry it. */
export const ticket = z.looseObject({
  id: z.number().int(),
  subject: z.string(),
  status: z.number().int(),
  priority: z.number().int(),
  requester_id: z.number().int(),
  custom_fields: z.record(z.string(), z.unknown()),
});

export const conversation = z.looseObject({
  id: z.number().int(),
  user_id: z.number().int(),
  body: z.string(),
  incoming: z.boolean(),
  private: z.boolean(),
});

/**
 * The answer to a reply or a forward (T-080): a conversation-like record,
 * checked loosely. Freshdesk documents a reply's answer without `incoming` or
 * `private` (RFC 2026-11-26-send-safety-core, A1 and A2, unverified until
 * T-087), so only a positive whole-number `id` (the `conversation_id` a send
 * returns) is required. Every other key is accepted and dropped, not passed
 * through: the answer echoes addresses and the body, and a send returns no
 * address (OD-27).
 */
export const sentConversation = z.object({
  id: z.number().int().positive(),
});

/** Freshdesk returns no page of `GET /tickets` past this one (30,000 tickets at 100 a page). */
export const MAX_LIST_PAGE = 300;

export type Ticket = z.infer<typeof ticket>;
export type Conversation = z.infer<typeof conversation>;
export type SentConversation = z.infer<typeof sentConversation>;

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
  | { ok: false; error: FreshdeskError; attempts?: number };

/** The one include `getTicket` sends: see the file's header. */
export type TicketInclude = "stats";

export type TicketResult =
  | { ok: true; ticket: Ticket; attempts: number }
  | { ok: false; error: FreshdeskError; attempts?: number };

export type ConversationsResult = ListResult<Conversation>;

export type ConversationPageResult =
  | { ok: true; conversations: Conversation[]; has_more: boolean; attempts: number }
  | { ok: false; error: FreshdeskError; attempts?: number };

const ORDER_BY = new Set(["created_at", "due_by", "updated_at", "status"]);
const ORDER_TYPE = new Set(["asc", "desc"]);

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
  http: GetHttp,
  options: ListTicketsOptions = {},
  deadline?: number,
  cost?: CostClass,
): Promise<ListTicketsResult> {
  const { per_page, page, order_by, order_type, include, requester_id, company_id } = options;
  if (per_page !== undefined && !(isPositiveInt(per_page) && per_page <= PER_PAGE)) {
    return refused("per_page");
  }
  if (page !== undefined && !isPositiveInt(page)) return refused("page");
  if (order_by !== undefined && !ORDER_BY.has(order_by)) return refused("order_by");
  if (order_type !== undefined && !ORDER_TYPE.has(order_type)) return refused("order_type");
  if (include !== undefined && include !== "stats") return refused("include");
  if (requester_id !== undefined && !isPositiveInt(requester_id)) return refused("requester_id");
  if (company_id !== undefined && !isPositiveInt(company_id)) return refused("company_id");
  const query: Record<string, string | number> = { per_page: options.per_page ?? PER_PAGE };
  for (const name of OPTIONAL) {
    const value = options[name];
    if (value !== undefined) query[name] = value;
  }
  const pages = http.paginate(
    { path: "/tickets", query, ...(cost === undefined ? {} : { cost }) },
    { pages: 1 },
    deadline,
  );
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
    if (!result.ok) {
      // A failed page ends the iteration: its return value has the count.
      const end = await pages.next();
      return { ...result, attempts: end.done ? end.value.attempts : 0 };
    }
    const parsed = ticket.array().safeParse(result.body);
    if (!parsed.success) return malformed("tickets", result.status);
    tickets = parsed.data;
  }
}

export async function getTicket(
  http: GetHttp,
  id: number,
  include: readonly TicketInclude[] = [],
  deadline?: number,
  cost?: CostClass,
): Promise<TicketResult> {
  if (!isPositiveInt(id)) return refused("id");
  if (!include.every((name) => name === "stats")) return refused("include");
  const result = await http.requestWithRetry(
    {
      path: "/tickets/{id}",
      params: { id },
      ...(include.length === 0 ? {} : { query: { include: include.join(",") } }),
      ...(cost === undefined ? {} : { cost }),
    },
    deadline,
  );
  if (!result.ok) return { ok: false, error: result.error, attempts: result.attempts };
  const parsed = ticket.safeParse(result.body);
  if (!parsed.success) return malformed("a ticket", result.status);
  return { ok: true, ticket: parsed.data, attempts: result.attempts };
}

export function listConversations(
  http: GetHttp,
  ticketId: number,
  deadline?: number,
  cost?: CostClass,
): Promise<ConversationsResult> {
  if (!isPositiveInt(ticketId)) return Promise.resolve(refused("ticket id"));
  return listAll(
    http,
    "/tickets/{id}/conversations",
    conversation,
    "conversations",
    deadline,
    { id: ticketId },
    cost,
  );
}

export async function listConversationPage(
  http: GetHttp,
  ticketId: number,
  deadline?: number,
  cost?: CostClass,
): Promise<ConversationPageResult> {
  if (!isPositiveInt(ticketId)) return refused("ticket id");
  const pages = http.paginate(
    {
      path: "/tickets/{id}/conversations",
      params: { id: ticketId },
      query: { per_page: PER_PAGE },
      ...(cost === undefined ? {} : { cost }),
    },
    { pages: 1 },
    deadline,
  );
  let conversations: Conversation[] = [];
  for (;;) {
    // By hand, not `for await`: the return value is where `truncated` is.
    const step = await pages.next();
    if (step.done) {
      const { truncated, attempts } = step.value;
      return { ok: true, conversations, has_more: truncated, attempts };
    }
    const result = step.value;
    if (!result.ok) {
      const end = await pages.next();
      return { ...result, attempts: end.done ? end.value.attempts : 0 };
    }
    const parsed = conversation.array().safeParse(result.body);
    if (!parsed.success) {
      // One page asked for: the next step ends the iteration with the count.
      const end = await pages.next();
      return {
        ...malformed("conversations", result.status),
        attempts: end.done ? end.value.attempts : 0,
      };
    }
    conversations = parsed.data;
  }
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

function isPositiveInt(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function refused(name: string): { ok: false; error: FreshdeskError } {
  return {
    ok: false,
    error: {
      code: "validation",
      http_status: null,
      message: `Not sent: ${name} is not a valid value.`,
      retryable: false,
    },
  };
}
