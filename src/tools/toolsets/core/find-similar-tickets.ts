// `find_similar_tickets` (SPEC §8.2, C3): best-effort past cases like one
// ticket, without full text. The endpoints are
// docs/architecture/ticket-queries.md's (`find_similar_tickets`).
//
//   - Requests, one after another, each sent as `expensive` (refused below
//     the reserve, paced): the ticket's view; one page of the list endpoint
//     for its requester (`requester_id`) and one for its company
//     (`company_id`, not sent when the ticket has none), each with
//     `updated_since` N days ago; one search page,
//     `(status:4 OR status:5) AND updated_at:>'<day>'`, the UTC day of N days
//     ago less one (widened, as T-043 does); then one conversations page for
//     each result, its excerpt. The bound is CALL_BOUND requests a call,
//     retries apart (they add to it), and the schema's load when not cached.
//     The ticket is viewed first: below the reserve the call is refused with
//     no request at all.
//   - A candidate is any ticket those sources return, once, other than the
//     ticket itself, in status 4 (Resolved) or 5 (Closed), last updated at or
//     after N days ago (`matchesLocal`): updated, not resolved, since neither
//     source gives the resolution time. It is kept when it shares at least
//     one of: the category (`same: "category"`), the requester, the company.
//   - The category is rows.ts's `categoryFields` (the team's
//     `uncategorised_fields`, a nested level's name selecting its nested
//     field; else the first nested field), compared locally since a nested
//     field is not searchable. A candidate shares it when every category
//     field has the ticket's value, a nested field at every level; a ticket
//     with an empty category field shares it with nobody.
//   - Order: the subject keywords shared with the ticket's, most first; then
//     the last update, latest first; then the id, highest first. RESULTS are
//     returned. Keywords (`keywords`): the subject lower-cased, NFC, split
//     into runs of letters, marks and digits; a run of under MIN_WORD code
//     points or in STOP_WORDS is left out; each counted once.
//   - An item is rows.ts's `ticketRow` plus `same`, `shared_keywords` and
//     `excerpt`: the last entry of the first conversations page (the oldest
//     100) that an agent wrote (`incoming: false`, a reply or a private
//     note), as text, inside `<ticket_content>`, cut at EXCERPT_CAP; `null`
//     with none, or when the read answered `not_found`.
//   - The list envelope, one page only: MAX_POSITION is 0, so a cursor at
//     position 0 over the same arguments is accepted and any other refused,
//     before any request. `truncated: true` when a source had more than the
//     one page read (a list's `Link`, a search `total` past its page).
//   - A failed request fails the call. One exception: after the view was
//     answered, a request the limiter refuses unsent (`rate_limited` with no
//     HTTP status) ends the reads: the candidates read so far are ranked and
//     returned, the excerpts not read `null`, with `incomplete: true`.
//   - One deadline for the whole call, CALL_DEADLINE_MS from its start; the
//     window is measured from that start too.
//   - `api_calls_used` is every request this call sent, retries included, and
//     the schema's load when this call started it.

import { z } from "zod";
import { searchTickets } from "../../../client/resources/search.js";
import {
  type Conversation,
  getTicket,
  listConversationPage,
  listTickets,
  type Ticket,
} from "../../../client/resources/tickets.js";
import type { Schema } from "../../../schema/index.js";
import type { AppContext } from "../../context.js";
import { bodyText } from "../../format.js";
import { listEnvelope, readCursor } from "../../list.js";
import { categoryFields, ticketRow } from "../../rows.js";
import { fieldKey, matchesLocal } from "../../ticket-query.js";
import type { Tool, ToolResult } from "../index.js";

/** One call's requests end within this, all of them together. */
const CALL_DEADLINE_MS = 30_000;
const DAY_MS = 86_400_000;

/** The window when `days` is not given, and its largest value. */
export const DEFAULT_DAYS = 90;
export const MAX_DAYS = 365;
/** Results returned, each with one conversations request. */
export const RESULTS = 5;
/** The view, two lists, one search page, one thread page per result. */
export const CALL_BOUND = 4 + RESULTS;
/** Code points of an excerpt. */
export const EXCERPT_CAP = 500;
/** One page only. */
export const MAX_POSITION = 0;
/** Tickets of one list page. */
const LIST_PER_PAGE = 100;

/** Freshdesk's ids of the statuses Resolved and Closed. */
const RESOLVED = 4;
const CLOSED = 5;

/** A keyword has at least this many code points. */
const MIN_WORD = 3;
/** Common English and Italian words, and a mail prefix, of MIN_WORD or more. */
const STOP_WORDS: ReadonlySet<string> = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "not",
  "you",
  "your",
  "this",
  "that",
  "per",
  "con",
  "non",
  "che",
  "del",
  "della",
  "delle",
  "dei",
  "degli",
  "nel",
  "nella",
  "una",
  "uno",
  "gli",
  "fwd",
]);
const WORD = /[\p{L}\p{M}\p{N}]+/gu;

type Same = "category" | "requester" | "company";

const input = z.object({
  ticket_id: z.number().int().positive(),
  days: z.number().int().min(1).max(MAX_DAYS).optional(),
  cursor: z.string().optional(),
});

/** A subject's keywords: see the file's header. */
export function keywords(subject: string): Set<string> {
  const words = subject.toLowerCase().normalize("NFC").match(WORD) ?? [];
  return new Set(
    words.filter((word) => Array.from(word).length >= MIN_WORD && !STOP_WORDS.has(word)),
  );
}

function positiveId(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

/** Where each category field is read: its holder and its keys, every level of a nested one. */
function categoryKeys(context: AppContext, schema: Schema) {
  return categoryFields(context, schema).map((field) => ({
    custom: !field.default,
    keys:
      field.type === "nested_field"
        ? [
            field.name,
            ...[...(field.nested_ticket_fields ?? [])]
              .sort((a, b) => a.level - b.level)
              .map((level) => level.name),
          ]
        : [fieldKey(field.name, field.default)],
  }));
}

function read(ticket: Ticket, custom: boolean, key: string): unknown {
  const holder: unknown = custom ? ticket.custom_fields : ticket;
  if (typeof holder !== "object" || holder === null) return undefined;
  return Object.hasOwn(holder, key) ? (holder as Record<string, unknown>)[key] : undefined;
}

function sameCategory(
  fields: ReturnType<typeof categoryKeys>,
  ticket: Ticket,
  other: Ticket,
): boolean {
  if (fields.length === 0) return false;
  return fields.every(
    ({ custom, keys }) =>
      !isEmpty(read(ticket, custom, keys[0]!)) &&
      keys.every((key) => read(ticket, custom, key) === read(other, custom, key)),
  );
}

/** The last entry an agent wrote, as wrapped text, or `null`. */
function excerptOf(conversations: readonly Conversation[]): string | null {
  for (let i = conversations.length - 1; i >= 0; i -= 1) {
    const entry = conversations[i]!;
    if (entry.incoming !== false) continue;
    return bodyText(entry.body_text, entry.body, {
      cap: EXCERPT_CAP,
      rest: "get_ticket returns the whole thread",
    });
  }
  return null;
}

/** A limiter refusal that sent nothing more: ends the reads, keeps what was read. */
function refusedUnsent(error: { code: string; http_status: number | null }): boolean {
  return error.code === "rate_limited" && error.http_status === null;
}

export const findSimilarTicketsTool: Tool<typeof input> = {
  name: "find_similar_tickets",
  description: [
    `Best effort: up to ${RESULTS} resolved or closed tickets like one ticket, from its subject's words, its category, its requester and its company. Freshdesk has no full-text search, so the ticket's text is not compared, only subjects.`,
    `A candidate is a ticket in status Resolved or Closed, last updated within the last N days, N being days (${DEFAULT_DAYS} when not given, at most ${MAX_DAYS}; the last update, not the resolution, which Freshdesk does not give here), sharing the category (every category field, each level of a nested one, the same; the category fields are those uncategorized checks), the requester or the company. Candidates come from one page each of the requester's tickets, the company's tickets and the tickets resolved or closed in that time; past those pages the result says truncated: true.`,
    `Results come at most ${RESULTS}, ordered by the number of subject keywords shared with the ticket's (shared_keywords), most first, then by last update, latest first, then by id, highest first. Keywords are the subject's words in lower case, letters and digits, of ${MIN_WORD} characters or more, without common English and Italian words.`,
    `Each result is a compact ticket row (id, subject, status, priority, category, last update, agent and group, by name) plus same (what it shares: category, requester, company), shared_keywords and excerpt: the last entry an agent wrote among the first 100 of its thread (a reply or a private note), cut at ${EXCERPT_CAP} characters; null when there is none or it was not read. get_ticket returns the whole thread.`,
    "One page only: has_more is always false. The calls are an expensive operation: paced, and refused with rate_limited when the account's API budget is low; if the budget runs out after the ticket was read, the result ranks what was read and says incomplete: true, the excerpts not read null: call again later.",
    "api_calls_used counts every request sent for this call, retries included, and the ticket-field schema's load when this call starts it.",
  ].join(" "),
  input,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  cost: `at most ${CALL_BOUND} API calls (1 for the ticket, 1 for its requester's tickets, 1 for its company's, 1 search, 1 per result for its excerpt), sent as an expensive operation, within 30 s; plus one per retry after an error, plus at least 3 when the ticket-field schema is not cached`,
  customerText: true,
  async handler(args, context): Promise<ToolResult> {
    const call = { tool: "find_similar_tickets", args };
    const cursor = readCursor(call, MAX_POSITION);
    if (!cursor.ok) return cursor;
    const now = Date.now();
    const deadline = now + CALL_DEADLINE_MS;
    const since = now - (args.days ?? DEFAULT_DAYS) * DAY_MS;
    const sinceSecond = new Date(since).toISOString().replace(/\.\d{3}Z$/, "Z");
    const searchDay = new Date(since - DAY_MS).toISOString().slice(0, 10);

    const viewed = await getTicket(context.http, args.ticket_id, [], deadline, "expensive");
    if (!viewed.ok) return viewed;
    const { ticket } = viewed;
    let calls = viewed.attempts;
    const loaded = await context.schema.get();
    if (!loaded.ok) return loaded;
    const { schema } = loaded;
    calls += loaded.attempts;

    const candidates = new Map<number, Ticket>();
    let truncated = false;
    let incomplete = false;
    const keep = (tickets: readonly Ticket[]) => {
      for (const other of tickets) if (!candidates.has(other.id)) candidates.set(other.id, other);
    };

    const company = positiveId(ticket.company_id);
    const lists = [
      { requester_id: ticket.requester_id },
      ...(company === null ? [] : [{ company_id: company }]),
    ];
    for (const filter of lists) {
      const listed = await listTickets(
        context.http,
        { per_page: LIST_PER_PAGE, updated_since: sinceSecond, ...filter },
        deadline,
        "expensive",
      );
      calls += listed.attempts ?? 0;
      if (!listed.ok) {
        if (!refusedUnsent(listed.error)) return listed;
        incomplete = true;
        break;
      }
      keep(listed.tickets);
      truncated ||= listed.has_more;
    }
    if (!incomplete) {
      const query = `(status:${RESOLVED} OR status:${CLOSED}) AND updated_at:>'${searchDay}'`;
      const found = await searchTickets(context.http, query, 1, deadline, "expensive");
      calls += found.attempts ?? 0;
      if (!found.ok) {
        if (!refusedUnsent(found.error)) return found;
        incomplete = true;
      } else {
        keep(found.results);
        truncated ||= found.total > found.results.length;
      }
    }

    const category = categoryKeys(context, schema);
    const words = keywords(ticket.subject);
    const window = { updated_since: new Date(since).toISOString() };
    const ranked = [...candidates.values()]
      .filter(
        (other) =>
          other.id !== ticket.id &&
          (other.status === RESOLVED || other.status === CLOSED) &&
          matchesLocal(window, other),
      )
      .map((other) => {
        const same: Same[] = [];
        if (sameCategory(category, ticket, other)) same.push("category");
        if (other.requester_id === ticket.requester_id) same.push("requester");
        if (company !== null && positiveId(other.company_id) === company) same.push("company");
        const shared = [...keywords(other.subject)].filter((word) => words.has(word)).length;
        return { other, same, shared, updated: Date.parse(other.updated_at as string) };
      })
      .filter(({ same }) => same.length > 0)
      .sort((a, b) => b.shared - a.shared || b.updated - a.updated || b.other.id - a.other.id)
      .slice(0, RESULTS);

    const items = [];
    for (const { other, same, shared } of ranked) {
      let excerpt: string | null = null;
      if (!incomplete) {
        const thread = await listConversationPage(context.http, other.id, deadline, "expensive");
        calls += thread.attempts ?? 0;
        if (thread.ok) {
          excerpt = excerptOf(thread.conversations);
        } else if (refusedUnsent(thread.error)) {
          incomplete = true;
        } else if (thread.error.code !== "not_found") {
          return thread;
        }
      }
      items.push({
        ...ticketRow(context, schema, other),
        same,
        shared_keywords: shared,
        excerpt,
      });
    }

    return {
      ok: true,
      value: {
        ...listEnvelope(call, { items, truncated, api_calls_used: calls }),
        ...(incomplete ? { incomplete: true } : {}),
      },
    };
  },
};
