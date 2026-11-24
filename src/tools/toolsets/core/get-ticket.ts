// `get_ticket` (SPEC §8.2, C3): one ticket with its fields by label, its
// conversation thread (paged), its requester and, when asked, the requester's
// recent tickets.
//
//   - The cursor is read first, before any request, with MAX_POSITION: one
//     from another call, or past the last page, sends nothing.
//   - The first call (no cursor) returns `ticket` (`ticketDetail`: every
//     field `ticketOutput` gives, each value through `fieldValue` by its own
//     `TicketField`, keys through `plainName`), `requester`, `recent_tickets`
//     when `include_recent` is true, and the first THREAD_PAGE conversations
//     as the list envelope's `items`. A call with a cursor returns the
//     envelope only: the next THREAD_PAGE conversations.
//   - The thread is read whole on every call through `listConversations` (1
//     request per 100 conversations, at most 10, `truncated: true` past
//     THREAD_CAP) and cut locally, oldest first as Freshdesk gives it. A
//     position is a page of THREAD_PAGE conversations, so the last one is
//     THREAD_CAP / THREAD_PAGE - 1.
//   - A conversation is `{id, created_at, user_id, incoming, private, body}`:
//     the body as text (`body_text`, else the HTML converted), inside
//     `<ticket_content>`. Its addresses (from, to, cc) and attachments are
//     left out.
//   - The requester is `{id, name, email, company}`. `getContact` and
//     `getCompany` give the name and the company name raw: each goes through
//     `plainName` (tags stripped, capped), then inside `<ticket_content>`;
//     the email through `plainName` at EMAIL_CAP, not wrapped. `company` is
//     `null`, with no request, when the contact has none. A team that hides
//     the requester field gets no `requester` key and no contact request;
//     one that hides the company field, no `company` key and no company
//     request (SPEC §8.4).
//   - Recent tickets: the requester's last RECENT_COUNT by creation, this
//     ticket left out, as `ticketRow`s, by the request
//     docs/architecture/ticket-queries.md names (`requester_id`,
//     `order_by=created_at`, `order_type=desc`, no window).
//   - One deadline for the whole call, CALL_DEADLINE_MS from its start, shared
//     by every request and by the schema's load.
//   - `api_calls_used` is every request this call sent for the ticket, the
//     requester, the recent tickets and the thread, retries included. The
//     schema's cold load (at least 3 requests, once per cache lifetime) is
//     not in it: the schema service does not report its requests.

import { z } from "zod";
import { getCompany } from "../../../client/resources/companies.js";
import { getContact } from "../../../client/resources/contacts.js";
import {
  type Conversation,
  getTicket,
  listConversations,
  listTickets,
  type Ticket,
} from "../../../client/resources/tickets.js";
import type { Schema } from "../../../schema/index.js";
import type { AppContext } from "../../context.js";
import { bodyText, plainName, untrusted } from "../../format.js";
import { listEnvelope, readCursor } from "../../list.js";
import { ticketDetail, ticketRow } from "../../rows.js";
import type { Tool, ToolResult } from "../index.js";

/** One call's requests end within this, all of them together. */
const CALL_DEADLINE_MS = 30_000;

/** Conversations in one response. */
export const THREAD_PAGE = 20;
/** The most conversations `listConversations` reads: 10 pages of 100. */
export const THREAD_CAP = 1000;
/** The last cursor position this tool serves: the last page of a thread at its cap. */
export const MAX_POSITION = THREAD_CAP / THREAD_PAGE - 1;
/** The requester's recent tickets shown. */
export const RECENT_COUNT = 10;
/** An email address's longest form (RFC 5321 path limit). */
const EMAIL_CAP = 254;

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

const input = z.object({
  ticket_id: z.number().int().positive(),
  include_recent: z.boolean().optional(),
  cursor: z.string().optional(),
});

type Failure = Extract<ToolResult, { ok: false }>;

/** Whether the team shows the default field of this type: absent from the schema counts as shown. */
function shows(context: AppContext, schema: Schema, type: string): boolean {
  const field = schema.fields.find((candidate) => candidate.type === type);
  if (field === undefined) return true;
  const probe = { requester_id: 1, company_id: 1 };
  return Object.keys(context.ticketOutput({ ...schema, fields: [field] }, probe)).length > 0;
}

function conversationItem(conversation: Conversation) {
  const { id, created_at, user_id, incoming } = conversation;
  return {
    id,
    created_at: typeof created_at === "string" && ISO_INSTANT.test(created_at) ? created_at : null,
    user_id,
    incoming,
    private: conversation.private,
    body: bodyText(conversation.body_text, conversation.body),
  };
}

/** The requester block and the requests it took; `requester` absent when the team hides the field. */
async function requesterOf(
  context: AppContext,
  schema: Schema,
  ticket: Ticket,
  deadline: number,
): Promise<{ ok: true; requester?: object; calls: number } | Failure> {
  if (!shows(context, schema, "default_requester")) return { ok: true, calls: 0 };
  const found = await getContact(context.http, ticket.requester_id, deadline);
  if (!found.ok) return found;
  const { name, email, company_id } = found.contact;
  const requester = {
    id: ticket.requester_id,
    name: untrusted(plainName(name)),
    email: email === null ? null : plainName(email, EMAIL_CAP),
  };
  if (!shows(context, schema, "default_company")) {
    return { ok: true, requester, calls: found.attempts };
  }
  if (company_id === null) {
    return { ok: true, requester: { ...requester, company: null }, calls: found.attempts };
  }
  const company = await getCompany(context.http, company_id, deadline);
  if (!company.ok) return company;
  return {
    ok: true,
    requester: {
      ...requester,
      company: { id: company.company.id, name: untrusted(plainName(company.company.name)) },
    },
    calls: found.attempts + company.attempts,
  };
}

export const getTicketTool: Tool<typeof input> = {
  name: "get_ticket",
  description: [
    "One ticket: its fields by label (status, priority, agent and group as names), its requester (name, email, company) and its conversation thread, oldest first.",
    `The thread comes ${THREAD_PAGE} conversations at a time as items; while has_more is true, call again with the same arguments and next_cursor for the next ${THREAD_PAGE}. A call with a cursor returns conversations only.`,
    `A thread longer than ${THREAD_CAP.toLocaleString("en-US")} conversations is cut and says truncated: true.`,
    `include_recent: true adds recent_tickets, the requester's last ${RECENT_COUNT} tickets by creation as compact rows.`,
    "A field or a requester the team configuration hides is left out.",
    "api_calls_used counts every request sent for this call, retries included, but not a load of the ticket-field schema.",
  ].join(" "),
  input,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  cost: "without a cursor, 1 API call for the ticket, 1 for the requester, 1 for the company if there is one, 1 with include_recent, and 1 per 100 conversations (at most 10); with a cursor, the conversation calls only; all within 30 s, plus one per retry after an error, plus at least 3 when the ticket-field schema is not cached",
  customerText: true,
  async handler(args, context) {
    const call = { tool: "get_ticket", args };
    const cursor = readCursor(call, MAX_POSITION);
    if (!cursor.ok) return cursor;
    const deadline = Date.now() + CALL_DEADLINE_MS;
    const id = args.ticket_id;
    let calls = 0;
    let head = {};

    if (cursor.position === 0) {
      const loaded = await context.schema.get();
      if (!loaded.ok) return loaded;
      const { schema } = loaded;
      const got = await getTicket(context.http, id, [], deadline);
      if (!got.ok) return got;
      const { ticket } = got;
      const asked = await requesterOf(context, schema, ticket, deadline);
      if (!asked.ok) return asked;
      calls = got.attempts + asked.calls;
      head = {
        ticket: ticketDetail(context, schema, ticket),
        ...(asked.requester === undefined ? {} : { requester: asked.requester }),
      };
      if (args.include_recent === true) {
        const listed = await listTickets(
          context.http,
          {
            requester_id: ticket.requester_id,
            order_by: "created_at",
            order_type: "desc",
            // One more: this ticket is likely among them and is left out.
            per_page: RECENT_COUNT + 1,
          },
          deadline,
        );
        if (!listed.ok) return listed;
        calls += listed.attempts;
        const recent = listed.tickets
          .filter((other) => other.id !== ticket.id)
          .slice(0, RECENT_COUNT)
          .map((other) => ticketRow(context, schema, other));
        head = { ...head, recent_tickets: recent };
      }
    }

    const thread = await listConversations(context.http, id, deadline);
    if (!thread.ok) return thread;
    const start = cursor.position * THREAD_PAGE;
    const end = start + THREAD_PAGE;
    return {
      ok: true,
      value: {
        ...head,
        ...listEnvelope(call, {
          items: thread.items.slice(start, end).map(conversationItem),
          ...(thread.items.length > end ? { next: cursor.position + 1 } : {}),
          truncated: thread.truncated,
          api_calls_used: calls + thread.attempts,
        }),
      },
    };
  },
};
