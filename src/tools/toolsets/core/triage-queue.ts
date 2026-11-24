// `triage_queue` (SPEC §8.2, C2): open and pending tickets with the urgency
// signals Claude ranks on. No ranking or scoring here. The endpoints and the
// bound are docs/architecture/ticket-queries.md's (`triage_queue`).
//
//   - Source: search, QUERY (status 2 or 3). A result with any other status
//     is dropped locally. One page of SEARCH_PER_PAGE a call; a cursor
//     position is a search page, read first, before any request, with
//     search.ts's MAX_SEARCH_POSITION. `has_more` and `next_cursor` come from
//     search's `total` alone; `total` over the 300 results the 10 pages hold
//     is `truncated: true`, on every page.
//   - A row is rows.ts's `ticketRow` plus the signals a search result
//     carries: `created` and `age`, the two due times with their overdue
//     flags, the three escalation flags. A date is a UTC ISO 8601 instant
//     through `isoUpdated`; a duration is in words (`human`). Overdue says
//     only that the due time has passed at the call's start. A value that is
//     missing or not in its expected form is `null`: unknown, never a guess.
//   - `reply_signals: true` adds the signals that need `stats`: one
//     `GET /tickets/{id}?include=stats` per returned row, one after another,
//     each sent as `expensive` (refused below the reserve, paced). The bound
//     is 1 + SEARCH_PER_PAGE requests a call (31, about 61 credits), retries
//     apart. Without it no ticket is viewed and the rows have no reply key.
//     `stats` is read here, key by key: a key that is absent or not `null`
//     or an ISO 8601 date-time with a zone makes the signals that need it
//     `null`.
//       - `last_customer_reply` is `requester_responded_at`; when that is
//         `null` the customer's last message is the opening one, so it is
//         `created`. `unanswered_customer_reply`: no agent response
//         (`agent_responded_at` `null`), or one before the customer's reply.
//       - `first_response_overdue` is refined: true only when the due time
//         has passed and `first_responded_at` is `null`. A due time that has
//         passed with `first_responded_at` unreadable, or the ticket not
//         viewed, is `null`.
//       - A view answered `not_found` (search lags a few minutes) leaves the
//         row unviewed: the three reply signals `null`.
//       - Once a view was answered, a later one the limiter refuses unsent
//         (`rate_limited` with no HTTP status) ends the views: every row of
//         the page is returned, the rest unviewed, with
//         `reply_signals_incomplete: true` beside the envelope. Any other
//         failed view, and a refusal of the first, fails the call.
//   - Order: the rows of a page by resolution due time, earliest first, a
//     ticket with none last, ties by id. The pages follow search's own order,
//     so the order holds within a page only.
//   - One deadline for the whole call, CALL_DEADLINE_MS from its start; ages
//     are measured at that start too.
//   - `api_calls_used` is every request this call sent, retries included, and
//     the schema's load when this call started it.

import { z } from "zod";
import {
  MAX_SEARCH_PAGE,
  MAX_SEARCH_POSITION,
  SEARCH_PER_PAGE,
  searchTickets,
} from "../../../client/resources/search.js";
import { getTicket, type Ticket } from "../../../client/resources/tickets.js";
import { listEnvelope, readCursor } from "../../list.js";
import { isoUpdated, ticketRow } from "../../rows.js";
import type { Tool } from "../index.js";

/** One call's requests end within this, all of them together. */
const CALL_DEADLINE_MS = 30_000;
/** Freshdesk's ids of the statuses Open and Pending. */
const OPEN = 2;
const PENDING = 3;
const QUERY = `status:${OPEN} OR status:${PENDING}`;

const MINUTE_MS = 60_000;
const DAY_MIN = 1440;

const input = z.object({
  reply_signals: z.boolean().optional(),
  cursor: z.string().optional(),
});

function count(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/** A duration in words, its two largest units of days, hours and minutes, rounded down; `null` when negative. */
function human(ms: number): string | null {
  if (!(ms >= 0)) return null;
  const minutes = Math.floor(ms / MINUTE_MS);
  if (minutes === 0) return "under a minute";
  const parts = [
    count(Math.floor(minutes / DAY_MIN), "day"),
    count(Math.floor((minutes % DAY_MIN) / 60), "hour"),
    count(minutes % 60, "minute"),
  ];
  const first = parts.findIndex((part) => !part.startsWith("0 "));
  return parts
    .slice(first, first + 2)
    .filter((part) => !part.startsWith("0 "))
    .join(" ");
}

/** The time from an instant `isoUpdated` gave to `now`, in words. */
function since(iso: string | null, now: number): string | null {
  return iso === null ? null : human(now - Date.parse(iso));
}

function flag(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/** A `stats` time: an instant in epoch ms, `null` for none yet, `undefined` when absent or in any other form. */
function statTime(stats: Record<string, unknown>, key: string): number | null | undefined {
  if (!Object.hasOwn(stats, key)) return undefined;
  if (stats[key] === null) return null;
  const iso = isoUpdated(stats[key]);
  return iso === null ? undefined : Date.parse(iso);
}

/** A due time in epoch ms for the order; one that is missing or unreadable sorts last. */
function dueTime(ticket: Ticket): number {
  const iso = isoUpdated(ticket.due_by);
  return iso === null ? Infinity : Date.parse(iso);
}

function byResolutionDue(a: Ticket, b: Ticket): number {
  const [dueA, dueB] = [dueTime(a), dueTime(b)];
  return dueA === dueB ? a.id - b.id : dueA < dueB ? -1 : 1;
}

function signals(ticket: Ticket, now: number) {
  const created = isoUpdated(ticket.created_at);
  const firstResponseDue = isoUpdated(ticket.fr_due_by);
  const resolutionDue = isoUpdated(ticket.due_by);
  const overdue = (due: string | null) => (due === null ? null : Date.parse(due) < now);
  return {
    created,
    age: since(created, now),
    first_response_due: firstResponseDue,
    first_response_overdue: overdue(firstResponseDue),
    resolution_due: resolutionDue,
    resolution_overdue: overdue(resolutionDue),
    first_response_escalated: flag(ticket.fr_escalated),
    resolution_escalated: flag(ticket.is_escalated),
    next_response_escalated: flag(ticket.nr_escalated),
  };
}

type Signals = ReturnType<typeof signals>;

/** A row's signals with those that need `stats`; in these `null` is unknown. */
interface ReplySignals extends Signals {
  last_customer_reply: string | null;
  since_last_customer_reply: string | null;
  unanswered_customer_reply: boolean | null;
}

/**
 * The signals of a row whose `stats` could not be read at all. Whether a
 * first response was sent is not known, so a due time that has passed is not
 * known to be overdue.
 */
function unviewed(row: Signals): ReplySignals {
  return {
    ...row,
    first_response_overdue: row.first_response_overdue === true ? null : row.first_response_overdue,
    last_customer_reply: null,
    since_last_customer_reply: null,
    unanswered_customer_reply: null,
  };
}

function replySignals(row: Signals, stats: unknown, now: number): ReplySignals {
  const unknown = unviewed(row);
  if (typeof stats !== "object" || stats === null || Array.isArray(stats)) return unknown;
  const record = stats as Record<string, unknown>;
  const first = statTime(record, "first_responded_at");
  const overdue = {
    first_response_overdue:
      first === undefined
        ? unknown.first_response_overdue
        : row.first_response_overdue && first === null,
  };
  const requester = statTime(record, "requester_responded_at");
  if (requester === undefined) return { ...unknown, ...overdue };
  const agent = statTime(record, "agent_responded_at");
  // No reply since the ticket was opened: the customer's last message is the opening one.
  const last = requester === null ? row.created : new Date(requester).toISOString();
  return {
    ...row,
    ...overdue,
    last_customer_reply: last,
    since_last_customer_reply: since(last, now),
    unanswered_customer_reply:
      agent === undefined ? null : agent === null || (requester !== null && requester > agent),
  };
}

export const triageQueueTool: Tool<typeof input> = {
  name: "triage_queue",
  description: [
    "The tickets in status Open or Pending with the signals to rank them by urgency; the ranking is yours. A ticket in any other status, a custom one included, is not listed (list_tickets filters by any status).",
    "Each row is a compact ticket row (id, subject, status, priority, category, last update, agent and group, by name) plus: created and age; first_response_due and resolution_due with first_response_overdue and resolution_overdue (first_response_overdue means the first-response due time has passed, whether or not a first response was sent; reply_signals refines it); first_response_escalated, resolution_escalated and next_response_escalated, Freshdesk's own flags. Times are ISO 8601 in UTC; age is in words (3 days 4 hours), measured when the call starts. In any signal null means unknown (the value was missing or unreadable), not false and not zero.",
    `With reply_signals: true each row also has last_customer_reply (the time of the customer's last message, the opening one when there was no later reply), since_last_customer_reply in words, and unanswered_customer_reply (true when no agent has responded since that message; null when unknown), and first_response_overdue is true only while no first response has been sent. They cost one more request per row, at most ${1 + SEARCH_PER_PAGE} requests a call, sent as an expensive operation: paced, so a full page takes about 15 s, and refused with rate_limited when the account's API budget is low. If the budget runs out after some rows were read, every row still comes back, the rows not read with these signals null, and the result says reply_signals_incomplete: true: call again later for the rest. Ask for the reply signals when the first pass leaves the ranking open.`,
    `Rows come ${SEARCH_PER_PAGE} a call, ordered by resolution due time, earliest first (a ticket with none last, then by id): the order holds within a page only, so read every page before ranking. While has_more is true, call again with the same arguments and next_cursor. Freshdesk returns the first ${MAX_SEARCH_PAGE * SEARCH_PER_PAGE} matches only: past them the list is cut and says truncated: true. A ticket changed in the last few minutes can be missing or show its earlier state.`,
    "api_calls_used counts every request sent for this call, retries included, and the ticket-field schema's load when this call starts it.",
  ].join(" "),
  input,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  cost: `1 API call, within 30 s; with reply_signals: true one more per row, at most ${1 + SEARCH_PER_PAGE} calls (about ${1 + 2 * SEARCH_PER_PAGE} credits of the rate limit); plus one per retry after an error, plus at least 3 when the ticket-field schema is not cached`,
  customerText: true,
  async handler(args, context) {
    const call = { tool: "triage_queue", args };
    const cursor = readCursor(call, MAX_SEARCH_POSITION);
    if (!cursor.ok) return cursor;
    const now = Date.now();
    const deadline = now + CALL_DEADLINE_MS;
    const loaded = await context.schema.get();
    if (!loaded.ok) return loaded;
    const { schema } = loaded;

    const page = cursor.position + 1;
    const found = await searchTickets(context.http, QUERY, page, deadline);
    if (!found.ok) return found;
    const more = page < MAX_SEARCH_PAGE && page * SEARCH_PER_PAGE < found.total;
    let calls = loaded.attempts + found.attempts;

    const tickets = found.results
      .filter((ticket) => ticket.status === OPEN || ticket.status === PENDING)
      .sort(byResolutionDue);
    const rows = tickets.map((ticket) => ({
      id: ticket.id,
      row: ticketRow(context, schema, ticket),
      signals: signals(ticket, now),
    }));
    const items = [];
    let answered = 0;
    let incomplete = false;
    for (const { id, row, signals: own } of rows) {
      if (args.reply_signals !== true) {
        items.push({ ...row, ...own });
        continue;
      }
      if (incomplete) {
        items.push({ ...row, ...unviewed(own) });
        continue;
      }
      const viewed = await getTicket(context.http, id, ["stats"], deadline, "expensive");
      calls += viewed.attempts ?? 0;
      if (viewed.ok) {
        answered += 1;
        items.push({ ...row, ...replySignals(own, viewed.ticket.stats, now) });
        continue;
      }
      const { error } = viewed;
      if (error.code === "not_found") {
        answered += 1;
      } else if (answered > 0 && error.code === "rate_limited" && error.http_status === null) {
        incomplete = true;
      } else {
        return { ok: false, error };
      }
      items.push({ ...row, ...unviewed(own) });
    }

    return {
      ok: true,
      value: {
        ...listEnvelope(call, {
          items,
          ...(more ? { next: page } : {}),
          truncated: found.total > MAX_SEARCH_PAGE * SEARCH_PER_PAGE,
          api_calls_used: calls,
        }),
        ...(incomplete ? { reply_signals_incomplete: true } : {}),
      },
    };
  },
};
