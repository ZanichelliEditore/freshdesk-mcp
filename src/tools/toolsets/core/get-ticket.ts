// `get_ticket` (SPEC §8.2, C3): one ticket with its fields by label, its
// conversation thread (paged), its requester and, when asked, the requester's
// recent tickets.
//
//   - The cursor is read first, before any request, with MAX_POSITION: one
//     from another call, or past the last page, sends nothing.
//   - Every call then takes the schema (no request while it is cached): the
//     first call for the fields, every call to know whether the team hides
//     the requester.
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
//   - A conversation is `{id, created_at, user_id, incoming, private, source,
//     from, to, cc, attachments, body}`. `created_at` through rows.ts's
//     `isoUpdated`, as a ticket's `updated`: a UTC instant or `null`.
//     `source` is Freshdesk's number for the kind of entry, as sent (a whole
//     number, else `null`): not mapped to a name, no mapping being measured.
//     `from`, each of `to` and `cc`, and each attachment's name (the name
//     only) are customer text (SPEC §7.4): each inside its own
//     `<ticket_content>`, cut at SHORT_CAP. The body as text (`body_text`,
//     else the HTML converted), inside `<ticket_content>`, cut at BODY_CAP
//     with the marker; the ticket's description keeps format.ts's TEXT_CAP.
//   - The requester is `{id, name, email, company}`. `getContact` and
//     `getCompany` give the name and the company name raw: each goes through
//     `plainName` (tags stripped, capped), then inside `<ticket_content>`.
//     The email comes back as written only in a plain shape (PLAIN_EMAIL, at
//     most EMAIL_CAP characters); any other is inside `<ticket_content>`.
//     `company` is the contact's company, not the ticket's `company_id`
//     (which the `ticket` fields show): `null`, with no request, when the
//     contact has none.
//   - Hidden (SPEC §8.4), decided by `shows`, which fails closed. A team that
//     hides the requester field gets no `requester` key and no contact
//     request; every conversation's `user_id` is `null` (whatever its
//     `incoming`: the requester's own entry can be marked outgoing) and none
//     has `from`, `to` or `cc`; `include_recent` gives
//     `recent_tickets_unavailable` instead of `recent_tickets`, with no
//     request. A team that hides the company field gets no `company` key and
//     no company request. Not covered: a body, a subject or an attachment
//     name that itself names the requester; and, when the schema lacks the
//     field, a team key that is the field's localised label rather than one
//     of its usual names.
//   - Recent tickets: the requester's last RECENT_COUNT by creation, this
//     ticket left out, as `ticketRow`s, by the request
//     docs/architecture/ticket-queries.md names (`requester_id`,
//     `order_by=created_at`, `order_type=desc`, no window). A row whose
//     `requester_id` is not the ticket's is dropped, whatever Freshdesk sent.
//   - A failed contact, company or recent-tickets read fails the call with
//     its code and a fixed message naming the part, so a contact's 404 is not
//     read as an unknown ticket; nothing of the failed response is quoted.
//   - One deadline for the whole call, CALL_DEADLINE_MS from its start, shared
//     by every request and by the schema's load.
//   - `api_calls_used` is every request this call sent, retries included:
//     for the ticket, the requester, the recent tickets and the thread, and
//     the schema's load when this call started it (the service's `attempts`:
//     0 from the cache or for a load another call started).

import { z } from "zod";
import type { FreshdeskError } from "../../../client/errors.js";
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
import { isoUpdated, ticketDetail, ticketRow } from "../../rows.js";
import type { Tool, ToolResult } from "../index.js";

/** One call's requests end within this, all of them together. */
const CALL_DEADLINE_MS = 30_000;

/** Conversations in one response. */
export const THREAD_PAGE = 10;
/** The most conversations `listConversations` reads: 10 pages of 100. */
export const THREAD_CAP = 1000;
/** The last cursor position this tool serves: the last page of a thread at its cap. */
export const MAX_POSITION = THREAD_CAP / THREAD_PAGE - 1;
/** Code points of one conversation's body. */
export const BODY_CAP = 4000;
/** The requester's recent tickets shown. */
export const RECENT_COUNT = 10;
/** An email address's longest form (RFC 5321 path limit). */
const EMAIL_CAP = 254;
/** Code points of one address or one attachment name. */
const SHORT_CAP = 300;

/** The only email shape returned unwrapped: one `@`, ASCII letters, digits and a few signs. */
const PLAIN_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$/;

/** The team keys that hide the requester or the company when the schema lacks the field. */
export const REQUESTER = {
  type: "default_requester",
  keys: ["requester", "requester_id"],
} as const;
export const COMPANY = { type: "default_company", keys: ["company", "company_id"] } as const;

const input = z.object({
  ticket_id: z.number().int().positive(),
  include_recent: z.boolean().optional(),
  cursor: z.string().optional(),
});

type Failure = Extract<ToolResult, { ok: false }>;

/**
 * Whether the team shows the requester or the company. With the field in the
 * schema, what `ticketOutput` does with it (label, API name and ticket key
 * alike). Without it, fail closed: hidden when a hidden team key is one of
 * the field's usual names, compared as `ticketOutput` compares. Shared with
 * `find_similar_tickets`.
 */
export function shows(
  context: AppContext,
  schema: Schema,
  { type, keys }: typeof REQUESTER | typeof COMPANY,
): boolean {
  const field = schema.fields.find((candidate) => candidate.type === type);
  if (field !== undefined) {
    const probe = { requester_id: 1, company_id: 1 };
    return Object.keys(context.ticketOutput({ ...schema, fields: [field] }, probe)).length > 0;
  }
  const names: readonly string[] = keys;
  return !Object.entries(context.team.fields).some(
    ([key, entry]) => entry.hidden && names.includes(key.normalize("NFC").trim().toLowerCase()),
  );
}

/** The error of a part read after the ticket: its code, a fixed message naming the part. */
function partFailure(error: FreshdeskError, part: string): Failure {
  const { code, http_status, retryable, retry_after_s } = error;
  const status = http_status === null ? "" : ` (HTTP ${http_status})`;
  return {
    ok: false,
    error: {
      code,
      http_status,
      message: `The ticket was read; its requester's ${part} could not be read${status}.`,
      retryable,
      ...(retry_after_s === undefined ? {} : { retry_after_s }),
    },
  };
}

function short(value: unknown): unknown[] {
  return typeof value === "string" ? [untrusted(value, { cap: SHORT_CAP })] : [];
}

function shortList(value: unknown): unknown[] {
  return Array.isArray(value) ? value.flatMap(short) : [];
}

function conversationItem(conversation: Conversation, requesterShown: boolean) {
  const { id, user_id, incoming, source, attachments } = conversation;
  const names = Array.isArray(attachments)
    ? attachments.flatMap((file: unknown) =>
        typeof file === "object" && file !== null ? short((file as { name?: unknown }).name) : [],
      )
    : [];
  return {
    id,
    created_at: isoUpdated(conversation.created_at),
    // Hidden requester: no author at all. Freshdesk's `incoming` does not
    // say which entries are the requester's.
    user_id: requesterShown ? user_id : null,
    incoming,
    private: conversation.private,
    source: Number.isSafeInteger(source) ? source : null,
    ...(requesterShown
      ? {
          from: short(conversation.from_email)[0] ?? null,
          to: shortList(conversation.to_emails),
          cc: shortList(conversation.cc_emails),
        }
      : {}),
    attachments: names,
    body: bodyText(conversation.body_text, conversation.body, { cap: BODY_CAP }),
  };
}

/** The requester block and the requests it took. */
async function requesterOf(
  context: AppContext,
  schema: Schema,
  ticket: Ticket,
  deadline: number,
): Promise<{ ok: true; requester: object; calls: number } | Failure> {
  const found = await getContact(context.http, ticket.requester_id, deadline);
  if (!found.ok) return partFailure(found.error, "contact");
  const { name, email, company_id } = found.contact;
  const plain = email !== null && email.length <= EMAIL_CAP && PLAIN_EMAIL.test(email);
  const requester = {
    id: ticket.requester_id,
    name: untrusted(plainName(name)),
    email: plain ? email : untrusted(email, { cap: SHORT_CAP }),
  };
  if (!shows(context, schema, COMPANY)) return { ok: true, requester, calls: found.attempts };
  if (company_id === null) {
    return { ok: true, requester: { ...requester, company: null }, calls: found.attempts };
  }
  const company = await getCompany(context.http, company_id, deadline);
  if (!company.ok) return partFailure(company.error, "company");
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
    "The requester's company is the contact's company, which can differ from the ticket's own Company field.",
    `The thread comes ${THREAD_PAGE} conversations at a time as items; while has_more is true, call again with the same arguments and next_cursor for the next ${THREAD_PAGE}. A call with a cursor returns conversations only.`,
    `A conversation has its author (user_id), direction (incoming), private flag, Freshdesk's source number, its from, to and cc addresses, its attachments' names and its body as text; a body over ${BODY_CAP.toLocaleString("en-US")} characters is cut and says how many are not shown.`,
    `A thread longer than ${THREAD_CAP.toLocaleString("en-US")} conversations is cut and says truncated: true.`,
    `include_recent: true adds recent_tickets, the requester's last ${RECENT_COUNT} tickets by creation as compact rows.`,
    "A field the team configuration hides is left out. When it hides the requester there is no requester, no author (user_id is null) and no address on any conversation, and recent_tickets_unavailable in place of recent_tickets.",
    "api_calls_used counts every request sent for this call, retries included, and the ticket-field schema's load when this call starts it.",
  ].join(" "),
  input,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  cost: "without a cursor, 1 API call for the ticket, 1 for the requester, 1 for the company if there is one, 1 with include_recent, and 1 per 100 conversations (at most 10); with a cursor, the conversation calls only; all within 30 s, plus one per retry after an error, plus at least 3 on any call, with or without a cursor, when the ticket-field schema is not cached",
  customerText: true,
  async handler(args, context) {
    const call = { tool: "get_ticket", args };
    const cursor = readCursor(call, MAX_POSITION);
    if (!cursor.ok) return cursor;
    const deadline = Date.now() + CALL_DEADLINE_MS;
    const id = args.ticket_id;
    const loaded = await context.schema.get();
    if (!loaded.ok) return loaded;
    const { schema } = loaded;
    const requesterShown = shows(context, schema, REQUESTER);
    let calls = loaded.attempts;
    let head: Record<string, unknown> = {};

    if (cursor.position === 0) {
      const got = await getTicket(context.http, id, [], deadline);
      if (!got.ok) return got;
      const { ticket } = got;
      calls += got.attempts;
      head = { ticket: ticketDetail(context, schema, ticket) };
      if (requesterShown) {
        const asked = await requesterOf(context, schema, ticket, deadline);
        if (!asked.ok) return asked;
        calls += asked.calls;
        head.requester = asked.requester;
      }
      if (args.include_recent === true && !requesterShown) {
        head.recent_tickets_unavailable = "requester hidden";
      } else if (args.include_recent === true) {
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
        if (!listed.ok) return partFailure(listed.error, "recent tickets");
        calls += listed.attempts;
        head.recent_tickets = listed.tickets
          .filter((other) => other.id !== ticket.id && other.requester_id === ticket.requester_id)
          .slice(0, RECENT_COUNT)
          .map((other) => ticketRow(context, schema, other));
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
          items: thread.items
            .slice(start, end)
            .map((conversation) => conversationItem(conversation, requesterShown)),
          ...(thread.items.length > end ? { next: cursor.position + 1 } : {}),
          truncated: thread.truncated,
          api_calls_used: calls + thread.attempts,
        }),
      },
    };
  },
};
