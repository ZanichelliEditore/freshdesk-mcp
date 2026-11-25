// `count_tickets` (SPEC §8.2, C7): ticket counts grouped by one or two
// fields over a period of `created_at` days and the `list_tickets` filters,
// aggregated in code. Per docs/architecture/ticket-queries.md
// (`count_tickets`, "Past 300 results", "Date boundary").
//
//   - Group-by fields (checked first, before any request): one or two, each
//     a ticket field by label or API name (trimmed, NFC, any case), each of a
//     known closed type (GROUPABLE: number, decimal, checkbox, date,
//     dropdown, ticket type, nested field, status, priority, source, agent,
//     group). A free-text field is `free_text_field`, any other type, known
//     or not, `unsupported_field` (a date-time among them: SPEC §8.2 names
//     date, and a date-time is one group per ticket); a third field, none, a name no field
//     has, several fields share, or the same field twice is `validation` too.
//     The count of fields is checked before the schema is read, so a third
//     field sends no request at all; the rest needs the schema (its load is
//     the only request then, none when cached).
//   - A group's key is the field's label through `plainName` (a second field
//     with the same label is `Label (api_name)`); its value is what
//     `ticketOutput` shows through `fieldValue` (names for status, priority,
//     source, agent and group, the " > " path of a nested field, a validated
//     choice plain, anything else wrapped). `null`, `""`, and a field
//     `ticketOutput` leaves out count under `null`. Hidden fields: built on
//     `ticketOutput` as it is, so a field the team hides counts every ticket
//     under `null`; nothing else is done about `hidden`, which is not an
//     access control (SPEC §7.3) and not guaranteed in counts. An agent or
//     group is grouped by its id, not its name: when several ids in the
//     result share a name, each shows as `Name (id)`.
//   - Each ticket id is counted once: a ticket a later page repeats (it
//     moved while the call read the pages) is skipped. One that moved the
//     other way can be missing.
//   - At most GROUP_CAP groups are returned, largest first; past it
//     `groups_not_shown` says how many more and the result is `truncated`.
//   - The query: `buildTicketQuery` with the filters and the period as
//     `created_between`, so always a search query, exact on the days
//     (measured, T-055). Search page 1 is the probe; every request of the
//     call is `expensive` (below the limiter's reserve the probe is refused,
//     nothing sent).
//   - `total` ≤ 300 (SEARCH_CAP): the remaining search pages, estimated as
//     the pages after the probe, `checkBudget` before them. Above: the list
//     scan, `updated_since=<from>T00:00:00Z`, `order_by=created_at`,
//     `order_type=asc`, LIST_PAGE_SIZE a page, the search filters checked on
//     each ticket here (status, priority, group, agent by id, type by its
//     resolved name, tag exactly as given among `tags`), stopped after the
//     first page whose last ticket was created on a UTC day after the
//     period. Its estimate is a floor, the probe plus one page per 100 of
//     `total` (the scan also reads tickets created before the period, or not
//     matching): `checkBudget` refuses it when even that is over the budget,
//     and without `confirm: true` the scan stops at the budget while it runs
//     (before a page once the ticket requests, retries included, reach it).
//     `confirm` lifts the budget only, never SCAN_START_MS.
//     A refused estimate has spent the probe: the message says so.
//   - `matchesLocal` on every ticket either source returns (the period's
//     guard, `uncategorized`).
//   - `truncated: true` beside the counts when the source was cut: the scan
//     stopped at the budget, at MAX_LIST_PAGE (it links a next page or comes
//     back full), or at SCAN_START_MS; or a later page the limiter refused
//     (`rate_limited` with no HTTP status), or one the call's deadline
//     ended (`network` the client marks `http.reachedDeadline`: aborted at the
//     deadline, T-037 review, 2026-11-24; or failed with no time left to
//     retry before it, T-059).
//     Any other failed request, and a failed probe, fails the call: no
//     partial count.
//   - One deadline for the whole call, CALL_DEADLINE_MS from its start. No
//     page is started after SCAN_START_MS, so an attempt (10 s) is not cut
//     in flight by the deadline.
//   - `api_calls_used`: every request this call sent, retries included, and
//     the schema's load when this call started it.
//   - The read (probe, estimate, budget, search pages or list scan, each id
//     once, the cuts) is `readPeriod`, with `periodQuery` for the query,
//     exported for `export_tickets` (T-037): it hands each ticket to the
//     caller's `take`, which may stop the read (a cut) or fail it, and counts
//     the requests on the caller's `Meter`. For `export_tickets`' pages
//     (T-057) it also takes a `resume` position and a `limit` (the estimate
//     counts no more tickets than it), and gives `next`, where a later read
//     resumes, whenever it stopped before the period's end (export-tickets.ts
//     header); `count_tickets` passes neither and ignores `next`.

import { z } from "zod";
import type { FieldError, FreshdeskError } from "../../../client/errors.js";
import { MAX_SEARCH_PAGE, searchTickets } from "../../../client/resources/search.js";
import { listTickets, MAX_LIST_PAGE, type Ticket } from "../../../client/resources/tickets.js";
import type { Schema } from "../../../schema/index.js";
import { checkBudget, estimateCalls } from "../../budget.js";
import type { AppContext } from "../../context.js";
import { fieldValue, plainName } from "../../format.js";
import {
  buildTicketQuery,
  matchesLocal,
  resolveFilter,
  type TicketQuery,
} from "../../ticket-query.js";
import type { Tool } from "../index.js";

type TicketField = Schema["fields"][number];
type SearchQuery = Extract<TicketQuery, { endpoint: "search" }>;

/** One call's requests end within this, all of them together. */
export const CALL_DEADLINE_MS = 30_000;
/** No page is started after this: an attempt started before it ends by the deadline. */
export const SCAN_START_MS = CALL_DEADLINE_MS - 10_000;
/** Tickets of a search page (Freshdesk's fixed size). */
export const SEARCH_PAGE_SIZE = 30;
/** Tickets of a list page of the scan (the endpoint's largest). */
export const LIST_PAGE_SIZE = 100;
/** Search answers this many results at most: past it, the list scan. */
const SEARCH_CAP = MAX_SEARCH_PAGE * SEARCH_PAGE_SIZE;
/** Group-by fields a call takes at most. */
export const MAX_GROUP_FIELDS = 2;
/** Groups a result shows at most, largest first. */
export const GROUP_CAP = 200;

/** Field types whose values form a closed set: the only ones a count groups by. */
const GROUPABLE = new Set([
  "custom_number",
  "custom_decimal",
  "custom_checkbox",
  "custom_date",
  "custom_dropdown",
  "default_ticket_type",
  "nested_field",
  "default_status",
  "default_priority",
  "default_source",
  "default_agent",
  "default_group",
]);
const FREE_TEXT = new Set([
  "custom_text",
  "custom_paragraph",
  "default_subject",
  "default_description",
]);

const nameOrId = z.union([z.string(), z.number()]);

const input = z.object({
  group_by: z.array(z.string()),
  created_between: z.object({ from: z.string(), to: z.string() }),
  status: nameOrId.optional(),
  priority: nameOrId.optional(),
  group: nameOrId.optional(),
  agent: nameOrId.optional(),
  type: z.string().optional(),
  tag: z.string().optional(),
  uncategorized: z.boolean().optional(),
  confirm: z.boolean().optional(),
});

/** The period and filters a read takes: count_tickets' and export_tickets' shared input. */
export interface PeriodArgs {
  created_between: { from: string; to: string };
  status?: string | number | undefined;
  priority?: string | number | undefined;
  group?: string | number | undefined;
  agent?: string | number | undefined;
  type?: string | undefined;
  tag?: string | undefined;
  uncategorized?: boolean | undefined;
  confirm?: boolean | undefined;
}

/** What a read has sent: every request (`used`, the schema's load included) and the ticket requests the budget counts. */
export interface Meter {
  used: number;
  requests: number;
}

/**
 * What the caller does with a ticket of the period: `true` takes it and reads
 * on, `false` stops the read before it (a cut: `truncated`), an error fails the call.
 */
export type Take = (ticket: Ticket) => boolean | FreshdeskError | Promise<boolean | FreshdeskError>;

export interface PeriodRead {
  /** The call's start (epoch ms): no page is started SCAN_START_MS after it. */
  started: number;
  /** The call's one deadline (epoch ms). */
  deadline: number;
  meter: Meter;
  /** One more call per matching ticket in the estimate (export's conversations). */
  conversations: boolean;
  take: Take;
  /** Where the read starts (export_tickets' cursor, T-057); the period's start when absent. */
  resume?: Resume;
  /** The tickets the caller takes at most (export_tickets' max_tickets): the estimate counts no more. */
  limit?: number;
}

/**
 * A position in a period's read (export_tickets' cursor, T-057): its start;
 * on search (T-066), `second`, the `created_at` of the last ticket taken
 * (epoch seconds, UTC), `ids`, the ids taken in that second by this read and
 * the ones it resumed (ascending), and `page`, the search page that held the
 * last ticket taken. Search answers by created_at descending (measured
 * 2026-11-25), ties in no order a position relies on (`make
 * smoke-order-probe`, 2026-11-25: a tie with ids rising): what is left is
 * every ticket older than `second`, and those of `second` not in `ids`. On
 * the list scan, the UTC second of the latest ticket taken (epoch seconds)
 * and how many tickets created in that second were taken.
 */
export type Resume =
  | { path: "start" }
  | { path: "search"; second: number; ids: readonly number[]; page: number }
  | { path: "list"; second: number; ties: number };

/**
 * A read's outcome: `next`, where to resume, present when it stopped before
 * the period's end and a position can be given; `unordered` when it stopped
 * on search results that did not fall in search's own order, or one whose
 * `created_at` does not read, so no position can be (T-057, T-063).
 */
export type PeriodResult =
  | { ok: true; truncated: boolean; next?: Resume; unordered?: true }
  | { ok: false; error: FreshdeskError };

/** Whether every ticket's `created_at` reads and none rises: search's own order, ties in any id order (T-066). */
function ordered(tickets: readonly Ticket[]): boolean {
  const seconds = tickets.map(createdSecond);
  return seconds.every(
    (second, i) => second !== undefined && (i === 0 || seconds[i - 1]! >= second),
  );
}

function refused(problem: FieldError): { ok: false; error: FreshdeskError } {
  return {
    ok: false,
    error: {
      code: "validation",
      http_status: null,
      message: "The fields to group by are not valid; nothing was sent.",
      retryable: false,
      errors: [problem],
    },
  };
}

function fold(text: string): string {
  return text.normalize("NFC").trim().toLowerCase();
}

/** The group-by fields, or the first problem with them. */
function groupFields(schema: Schema, names: readonly string[]): TicketField[] | FieldError {
  const fields: TicketField[] = [];
  for (const name of names) {
    const shown = JSON.stringify(plainName(name, 80));
    const matches = schema.fields.filter(
      (field) => fold(field.label) === fold(name) || fold(field.name) === fold(name),
    );
    const problem = (code: string, message: string): FieldError => ({
      field: "group_by",
      code,
      message,
    });
    if (matches.length === 0) return problem("unknown_field", `No ticket field is named ${shown}.`);
    if (matches.length > 1) {
      const which = matches.map((field) => plainName(field.name)).join(", ");
      return problem(
        "ambiguous_name",
        `${shown} names several fields (${which}): give its API name.`,
      );
    }
    const field = matches[0]!;
    if (FREE_TEXT.has(field.type)) {
      return problem(
        "free_text_field",
        `${shown} is free text: counts group only by a field with a closed set of values.`,
      );
    }
    if (field.type === "custom_date_time") {
      return problem(
        "unsupported_field",
        `${shown} is a date-time: nearly every ticket has its own, so it cannot group. Group by a date field instead.`,
      );
    }
    if (!GROUPABLE.has(field.type)) {
      return problem(
        "unsupported_field",
        `${shown} is not of a type a count can group by (a number, checkbox, date, dropdown, type, nested field, status, priority, source, agent or group).`,
      );
    }
    if (fields.includes(field)) return problem("duplicate_field", `${shown} is given twice.`);
    fields.push(field);
  }
  return fields;
}

/** Where an agent's or a group's id sits on the ticket: they are grouped by it. */
const ID_KEY: Readonly<Record<string, string>> = {
  default_agent: "responder_id",
  default_group: "group_id",
};

/**
 * What a ticket is counted under for one field: `shown`, the value shown
 * (`null` when it shows none), and `key`, what groups it (the id for an agent
 * or a group, else the value shown).
 */
function groupValue(
  context: AppContext,
  schema: Schema,
  field: TicketField,
  ticket: Ticket,
): { key: unknown; shown: unknown } {
  const out = Object.values(context.ticketOutput({ ...schema, fields: [field] }, ticket));
  const value: unknown = out[0];
  if (value === undefined || value === null || value === "") return { key: null, shown: null };
  const shown = fieldValue(field, value);
  const idKey = ID_KEY[field.type];
  return { key: idKey === undefined ? shown : (ticket[idKey] ?? null), shown };
}

/** The search filters, checked on a list ticket (the scan cannot ask them of Freshdesk). */
function fieldMatcher(schema: Schema, args: PeriodArgs): (ticket: Ticket) => boolean {
  const checks: ((ticket: Ticket) => boolean)[] = [];
  const keys = { status: "status", priority: "priority", group: "group_id", agent: "responder_id" };
  for (const kind of ["status", "priority", "group", "agent"] as const) {
    if (args[kind] === undefined) continue;
    const resolved = resolveFilter(schema, kind, args[kind]);
    // Already resolved once by buildTicketQuery: a failure here fails closed.
    const id = resolved.ok ? resolved.value : Number.NaN;
    checks.push((ticket) => ticket[keys[kind]] === id);
  }
  if (args.type !== undefined) {
    const resolved = resolveFilter(schema, "type", args.type);
    const name = resolved.ok ? resolved.value : Number.NaN;
    checks.push((ticket) => ticket.type === name);
  }
  if (args.tag !== undefined) {
    const tag = args.tag;
    checks.push((ticket) => Array.isArray(ticket.tags) && ticket.tags.includes(tag));
  }
  return (ticket) => checks.every((check) => check(ticket));
}

/** The UTC day a ticket was created on, or `undefined` when unreadable. */
function createdDay(ticket: Ticket | undefined): string | undefined {
  const value: unknown = ticket?.created_at;
  const time = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isNaN(time) ? undefined : new Date(time).toISOString().slice(0, 10);
}

/** The second (epoch, UTC) a ticket was created in, or `undefined` when unreadable. */
function createdSecond(ticket: Ticket): number | undefined {
  const value: unknown = ticket.created_at;
  const time = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isNaN(time) ? undefined : Math.floor(time / 1000);
}

/** An epoch second as the list's `updated_since`: `2026-01-02T03:04:05Z`. */
function instantOf(second: number): string {
  return new Date(second * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * A later request that cuts the source rather than failing the call: one the
 * limiter refused before sending (`rate_limited`, no HTTP status), or one the
 * call's deadline ended (`network` the client marks so: aborted at it, or
 * failed with no time left to retry before it; `http.reachedDeadline`, T-059).
 */
export function isCut(error: FreshdeskError, context: AppContext): boolean {
  return (
    (error.code === "rate_limited" && error.http_status === null) ||
    (error.code === "network" && context.http.reachedDeadline(error))
  );
}

function calls(n: number): string {
  return `${n} API call${n === 1 ? "" : "s"}`;
}

/** The period and the filters as one search query (`created_between` always makes one). */
export function periodQuery(
  context: AppContext,
  schema: Schema,
  args: PeriodArgs,
): SearchQuery | { ok: false; error: FreshdeskError } {
  const query = buildTicketQuery(context, schema, {
    ...(args.status === undefined ? {} : { status: args.status }),
    ...(args.priority === undefined ? {} : { priority: args.priority }),
    ...(args.group === undefined ? {} : { group: args.group }),
    ...(args.agent === undefined ? {} : { agent: args.agent }),
    ...(args.type === undefined ? {} : { type: args.type }),
    ...(args.tag === undefined ? {} : { tag: args.tag }),
    ...(args.uncategorized === undefined ? {} : { uncategorized: args.uncategorized }),
    created_between: args.created_between,
  });
  if (!query.ok) return query;
  if (query.endpoint !== "search") {
    // created_between is always a search condition: fail closed otherwise.
    throw new Error("periodQuery: the period did not make a search query");
  }
  return query;
}

/**
 * Every ticket of the period and filters, each id once, handed to `take`:
 * search when its total is SEARCH_CAP or less, else the ordered list scan
 * (this file's header), from `resume` when given. Counts what it sends on
 * `meter`; `truncated` when the read was cut, or `take` stopped it; `next`
 * where a later read resumes, whenever it stopped before the period's end.
 */
export async function readPeriod(
  context: AppContext,
  schema: Schema,
  args: PeriodArgs,
  query: SearchQuery,
  { started, deadline, meter, conversations, take, resume, limit }: PeriodRead,
): Promise<PeriodResult> {
  const from = resume ?? { path: "start" };
  const seen = new Set<number>();
  const spent = (error: FreshdeskError) => ({
    ok: false as const,
    error: {
      ...error,
      message: `${error.message} This call has already used ${calls(meter.used)} to learn the total.`,
    },
  });
  /** The read stopped before the period's end: `at` is where it resumes. */
  const cut = (at: Resume) => ({ ok: true as const, truncated: true, next: at });

  const budget = args.confirm === true ? Infinity : context.team.limits.call_budget;
  // A search position starts at the page that held its last ticket: that page is the probe.
  const position =
    from.path === "search" ? { second: from.second, ids: new Set(from.ids) } : undefined;
  let firstPage = from.path === "search" ? from.page : 1;
  let probe = await searchTickets(context.http, query.query, firstPage, deadline, "expensive");
  if (!probe.ok) return probe;
  meter.used += probe.attempts;
  meter.requests += probe.attempts;
  /** A search position holds only while search keeps its own order: past a disorder, a resumed read fails closed. */
  const disordered = () =>
    spent({
      code: "validation",
      http_status: null,
      message:
        "Freshdesk's search gave this period's tickets out of its own order (created_at, newest first), or one without a readable created_at, so it cannot be paged safely from a cursor: nothing was kept. Export it without max_tickets and without a cursor, in shorter periods.",
      retryable: false,
    });
  if (position !== undefined && !ordered(probe.results)) return disordered();
  /** Whether a page is empty or starts no newer than the position's second; its seconds read (`ordered` passed). */
  const reachesInto = (results: readonly Ticket[]) =>
    results.length === 0 || createdSecond(results[0]!)! <= position!.second;
  // Tickets that left the results since moved the rest forward, and the position's second may
  // hold unwritten tickets on an earlier page in any id order: while the page is empty or starts
  // no newer than that second, step back. The whole tie run of the second is then read.
  while (position !== undefined && firstPage > 1 && reachesInto(probe.results)) {
    // Counted against the budget and the time limit like any later page; the position stays.
    if (meter.requests >= budget || Date.now() - started >= SCAN_START_MS) return cut(from);
    firstPage -= 1;
    const earlier = await searchTickets(
      context.http,
      query.query,
      firstPage,
      deadline,
      "expensive",
    );
    if (!earlier.ok) {
      if (!isCut(earlier.error, context)) return earlier;
      meter.used += earlier.attempts ?? 0;
      meter.requests += earlier.attempts ?? 0;
      return cut(from);
    }
    meter.used += earlier.attempts;
    meter.requests += earlier.attempts;
    // The earlier page, and its join to the page after it, must keep the order too.
    const after = probe.results[0];
    if (!ordered(after === undefined ? earlier.results : [...earlier.results, after])) {
      return disordered();
    }
    probe = earlier;
  }

  if (from.path === "search" && probe.total > SEARCH_CAP) {
    return spent({
      code: "validation",
      http_status: null,
      message: `The period now matches more than ${SEARCH_CAP} tickets, so the cursor's position in Freshdesk's search no longer holds: nothing was kept. Call again without a cursor to start over.`,
      retryable: false,
    });
  }

  if (from.path === "search" || (from.path === "start" && probe.total <= SEARCH_CAP)) {
    // The results this call reads at most: the caller's limit from the first page read.
    const skipped = (firstPage - 1) * SEARCH_PAGE_SIZE;
    const end = Math.min(probe.total, limit === undefined ? probe.total : skipped + limit);
    const estimate =
      estimateCalls({
        tickets: Math.max(0, end - firstPage * SEARCH_PAGE_SIZE),
        pageSize: SEARCH_PAGE_SIZE,
        conversations: false,
        probe: 1,
      }) + (conversations ? Math.max(0, end - skipped) : 0);
    const refusal = checkBudget(context, estimate, args.confirm);
    if (refusal) return spent(refusal);
    /** The last ticket taken: its second, every id taken in that second (resumed ones included), its page. */
    let last =
      from.path === "search"
        ? { second: from.second, ids: new Set(from.ids), page: from.page }
        : undefined;
    /** The second of the result before, across every page read: a fresh read past a disorder gives no position. */
    let previous: number | undefined;
    let unordered = false;
    const stopped = () =>
      unordered
        ? { ok: true as const, truncated: true, unordered: true as const }
        : cut(
            last === undefined
              ? { path: "start" }
              : {
                  path: "search",
                  second: last.second,
                  ids: [...last.ids].sort((a, b) => a - b),
                  page: last.page,
                },
          );
    const pages = Math.ceil(probe.total / SEARCH_PAGE_SIZE);
    let results = probe.results;
    for (let page = firstPage; ; page++) {
      if (page > firstPage) {
        if (page > pages) break;
        // Ticket requests, retries included, at the budget: no further page (the local checks can drop results).
        if (meter.requests >= budget || Date.now() - started >= SCAN_START_MS) return stopped();
        const found = await searchTickets(context.http, query.query, page, deadline, "expensive");
        if (!found.ok) {
          if (!isCut(found.error, context)) return found;
          meter.used += found.attempts ?? 0;
          meter.requests += found.attempts ?? 0;
          return stopped();
        }
        meter.used += found.attempts;
        meter.requests += found.attempts;
        results = found.results;
      }
      for (const ticket of results) {
        const second = createdSecond(ticket);
        // A created_at that does not read is out of order too: no second can be checked against it.
        if (second === undefined || (previous !== undefined && second > previous)) {
          // Resumed: the position may have dropped a ticket unseen. Fresh: nothing was skipped.
          if (position !== undefined) return disordered();
          unordered = true;
        }
        previous = second;
        // Newer than the position's second (taken by an earlier call, or created or matching since),
        // or taken in it: skipped. Ties come in any id order, so the ids are a set.
        if (
          position !== undefined &&
          (second! > position.second || (second === position.second && position.ids.has(ticket.id)))
        ) {
          continue;
        }
        if (!matchesLocal(query, ticket)) continue;
        // A ticket a later page repeats (it moved during the call) is taken once.
        if (seen.has(ticket.id)) continue;
        seen.add(ticket.id);
        const taken = await take(ticket);
        if (taken === false) return stopped();
        if (taken !== true) return { ok: false, error: taken };
        // Taken, so in the period: its created_at reads (matchesLocal). An older second starts the set again.
        if (second !== undefined) {
          if (last === undefined || second < last.second) {
            last = { second, ids: new Set([ticket.id]), page };
          } else if (second === last.second) {
            last.ids.add(ticket.id);
            last.page = page;
          }
        }
      }
    }
    return { ok: true, truncated: false };
  }

  const estimate = estimateCalls({
    tickets: limit === undefined ? probe.total : Math.min(probe.total, limit),
    pageSize: LIST_PAGE_SIZE,
    conversations,
    probe: 1,
  });
  const refusal = checkBudget(context, estimate, args.confirm);
  if (refusal) return spent(refusal);
  const matches = fieldMatcher(schema, args);
  const { to } = args.created_between;
  /** Taken before this read: tickets created before `skip.second`, and the first `skip.ties` created in it. */
  const skip = from.path === "list" ? from : undefined;
  let skipped = 0;
  /** The latest second taken and how many tickets created in it were taken. */
  let last = skip === undefined ? undefined : { second: skip.second, ties: skip.ties };
  const here = (): Resume => (last === undefined ? { path: "start" } : { path: "list", ...last });
  // Every ticket created in or after a second was updated in or after it: the list from just before it holds them all.
  const since =
    skip === undefined ? `${args.created_between.from}T00:00:00Z` : instantOf(skip.second - 1);
  for (let page = 1; ; page++) {
    // Ticket requests, retries included, at the budget: no further page.
    if (meter.requests >= budget || Date.now() - started >= SCAN_START_MS) return cut(here());
    const listed = await listTickets(
      context.http,
      {
        per_page: LIST_PAGE_SIZE,
        page,
        updated_since: since,
        order_by: "created_at",
        order_type: "asc",
      },
      deadline,
      "expensive",
    );
    if (!listed.ok) {
      if (!isCut(listed.error, context)) return listed;
      meter.used += listed.attempts ?? 0;
      meter.requests += listed.attempts ?? 0;
      return cut(here());
    }
    meter.used += listed.attempts;
    meter.requests += listed.attempts;
    for (const ticket of listed.tickets) {
      if (!matches(ticket) || !matchesLocal(query, ticket)) continue;
      if (seen.has(ticket.id)) continue;
      seen.add(ticket.id);
      // In the period (matchesLocal), so its created_at reads.
      const second = createdSecond(ticket);
      if (second === undefined) continue;
      if (skip !== undefined) {
        if (second < skip.second) continue;
        if (second === skip.second && skipped < skip.ties) {
          skipped += 1;
          continue;
        }
      }
      const taken = await take(ticket);
      if (taken === false) return cut(here());
      if (taken !== true) return { ok: false, error: taken };
      // Out of order (an earlier second after a later one): the position stays at the later.
      if (last === undefined || second > last.second) last = { second, ties: 1 };
      else if (second === last.second) last.ties += 1;
    }
    const lastDay = createdDay(listed.tickets.at(-1));
    if (lastDay !== undefined && lastDay > to) break;
    if (page === MAX_LIST_PAGE) {
      if (listed.has_more || listed.tickets.length === LIST_PAGE_SIZE) return cut(here());
      break;
    }
    if (!listed.has_more) break;
  }
  return { ok: true, truncated: false };
}

export const countTicketsTool: Tool<typeof input> = {
  name: "count_tickets",
  description: [
    `Counts of the tickets created in a period, grouped by one or two ticket fields (group_by, by label or API name), counted here from every matching ticket. created_between {from, to}: days as YYYY-MM-DD, UTC, both included. Filters as list_tickets: status, priority, group and agent by name or id; type by name; tag (one tag, exact); uncategorized: true.`,
    `Only a field with a closed set of values can group: a number, checkbox, date, dropdown, type, nested field (its full path), status, priority, source, agent or group. A free-text field or any other is refused, and nothing is sent.`,
    `Example: {"group_by": ["Status", "Priority"], "created_between": {"from": "2026-01-01", "to": "2026-01-31"}} returns {"groups": [{"values": {"Status": "Open", "Priority": "High"}, "count": 2}, ...], "total": 2, "api_calls_used": 1}: groups by count, largest first; total is the tickets counted. A ticket with no value counts under null, and so does every ticket when the team config hides the field. Agents and groups that share a name show as "Name (id)". At most ${GROUP_CAP} groups are shown, the largest; groups_not_shown says how many more.`,
    `Up to ${SEARCH_CAP} matching tickets it reads Freshdesk's search, ${SEARCH_PAGE_SIZE} a request; above that it reads the list of tickets updated since the period's start, oldest created first, ${LIST_PAGE_SIZE} a request, until it passes the period's end. It first asks for one search page to learn the size, estimates the calls, and is refused when the estimate is over the per-call API budget: narrow the period or the filters, or call again with confirm: true. Without confirm the list read also stops at the budget. confirm lifts the API budget only, not the time limit: the list read starts no request after ${SCAN_START_MS / 1000} s, about ${(SCAN_START_MS / 1000) * 2} requests (${((SCAN_START_MS / 1000) * 2 * LIST_PAGE_SIZE).toLocaleString("en-US")} tickets) at the default pacing.`,
    `When the read was cut (the budget, Freshdesk's last list page, the time limit, or the API rate limit), the counts are of what was read and say truncated: true (so does a result past ${GROUP_CAP} groups): narrow the period or call again later. It counts as an expensive operation and is refused when the API budget is low. A ticket changed in the last few minutes, or while the call reads, can be missing; no ticket is counted twice.`,
    "api_calls_used counts every request sent for this call, retries included, and the ticket-field schema's load when this call starts it.",
  ].join(" "),
  input,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  cost: `1 API call per ${SEARCH_PAGE_SIZE} matching tickets up to ${SEARCH_CAP} (${MAX_SEARCH_PAGE} at most); above that 1 plus 1 per ${LIST_PAGE_SIZE} tickets read, up to the per-call budget (limits.call_budget, 250 by default) unless confirm: true, and a list read starts no request after ${SCAN_START_MS / 1000} s (about ${(SCAN_START_MS / 1000) * 2} at the default pacing); all within 30 s, plus one per retry after an error, plus at least 3 when the ticket-field schema is not cached`,
  customerText: true,
  async handler(args, context) {
    const started = Date.now();
    const deadline = started + CALL_DEADLINE_MS;
    if (args.group_by.length === 0 || args.group_by.length > MAX_GROUP_FIELDS) {
      return refused({
        field: "group_by",
        code: args.group_by.length === 0 ? "no_field" : "too_many_fields",
        message: `group_by takes one or ${MAX_GROUP_FIELDS} fields.`,
      });
    }
    const loaded = await context.schema.get();
    if (!loaded.ok) return loaded;
    const { schema } = loaded;
    const fields = groupFields(schema, args.group_by);
    if (!Array.isArray(fields)) return refused(fields);
    const query = periodQuery(context, schema, args);
    if (!query.ok) return query;

    const keys: string[] = [];
    for (const field of fields) {
      const label = plainName(field.label);
      keys.push(keys.includes(label) ? `${label} (${plainName(field.name)})` : label);
    }
    const groups = new Map<string, { keys: unknown[]; shown: unknown[]; count: number }>();
    let total = 0;
    const count = (ticket: Ticket) => {
      const parts = fields.map((field) => groupValue(context, schema, field, ticket));
      const keys = parts.map((part) => part.key);
      const id = JSON.stringify(keys);
      const group = groups.get(id);
      if (group) group.count += 1;
      else groups.set(id, { keys, shown: parts.map((part) => part.shown), count: 1 });
      total += 1;
    };

    const meter: Meter = { used: loaded.attempts, requests: 0 };
    const read = await readPeriod(context, schema, args, query, {
      started,
      deadline,
      meter,
      conversations: false,
      take: (ticket) => {
        count(ticket);
        return true;
      },
    });
    if (!read.ok) return read;

    const sorted = [...groups.entries()].sort(([a, x], [b, y]) =>
      y.count !== x.count ? y.count - x.count : a < b ? -1 : a > b ? 1 : 0,
    );
    // An agent or group name several ids share in this result shows its id.
    const shared = fields.map((field, i) => {
      const ids = new Map<unknown, Set<unknown>>();
      if (ID_KEY[field.type] !== undefined) {
        for (const group of groups.values()) {
          const set = ids.get(group.shown[i]) ?? new Set();
          set.add(group.keys[i]);
          ids.set(group.shown[i], set);
        }
      }
      return (shown: unknown) => shown !== null && (ids.get(shown)?.size ?? 0) > 1;
    });
    const shownGroups = sorted.slice(0, GROUP_CAP);
    const notShown = sorted.length - shownGroups.length;
    return {
      ok: true,
      value: {
        groups: shownGroups.map(([, group]) => {
          const values: Record<string, unknown> = {};
          group.shown.forEach((shown, i) => {
            const value = shared[i]!(shown) ? `${String(shown)} (${String(group.keys[i])})` : shown;
            // Defined, not assigned: a label `__proto__` stays an own key.
            Object.defineProperty(values, keys[i]!, {
              value,
              enumerable: true,
              writable: true,
              configurable: true,
            });
          });
          return { values, count: group.count };
        }),
        ...(notShown > 0 ? { groups_not_shown: notShown } : {}),
        total,
        ...(read.truncated || notShown > 0 ? { truncated: true } : {}),
        api_calls_used: meter.used,
      },
    };
  },
};
