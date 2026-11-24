// `count_tickets` (SPEC §8.2, C7): ticket counts grouped by one or two
// fields over a period of `created_at` days and the `list_tickets` filters,
// aggregated in code. Per docs/architecture/ticket-queries.md
// (`count_tickets`, "Past 300 results", "Date boundary").
//
//   - Group-by fields (checked first, before any request): one or two, each
//     a ticket field by label or API name (trimmed, NFC, any case), each of a
//     known closed type (GROUPABLE: number, decimal, checkbox, date, date
//     time, dropdown, ticket type, nested field, status, priority, source,
//     agent, group). A free-text field is `free_text_field`, any other type,
//     known or not, `unsupported_field`; a third field, none, a name no field
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
//     access control (SPEC §7.3) and not guaranteed in counts.
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
//     and without `confirm: true` the scan stops at the budget while it runs.
//     A refused estimate has spent the probe: the message says so.
//   - `matchesLocal` on every ticket either source returns (the period's
//     guard, `uncategorized`).
//   - `truncated: true` beside the counts when the source was cut: the scan
//     stopped at the budget, at MAX_LIST_PAGE (it links a next page or comes
//     back full), or at SCAN_START_MS; or a later page the limiter refused
//     (`rate_limited` with no HTTP status). Any other failed request fails
//     the call: no partial count.
//   - One deadline for the whole call, CALL_DEADLINE_MS from its start. No
//     page is started after SCAN_START_MS, so an attempt (10 s) is not cut
//     in flight by the deadline.
//   - `api_calls_used`: every request this call sent, retries included, and
//     the schema's load when this call started it.

import { z } from "zod";
import type { FieldError, FreshdeskError } from "../../../client/errors.js";
import { MAX_SEARCH_PAGE, searchTickets } from "../../../client/resources/search.js";
import { listTickets, MAX_LIST_PAGE, type Ticket } from "../../../client/resources/tickets.js";
import type { Schema } from "../../../schema/index.js";
import { checkBudget, estimateCalls } from "../../budget.js";
import type { AppContext } from "../../context.js";
import { fieldValue, plainName } from "../../format.js";
import { buildTicketQuery, matchesLocal, resolveFilter } from "../../ticket-query.js";
import type { Tool } from "../index.js";

type TicketField = Schema["fields"][number];

/** One call's requests end within this, all of them together. */
const CALL_DEADLINE_MS = 30_000;
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

/** Field types whose values form a closed set: the only ones a count groups by. */
const GROUPABLE = new Set([
  "custom_number",
  "custom_decimal",
  "custom_checkbox",
  "custom_date",
  "custom_date_time",
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

type Args = z.output<typeof input>;

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

/** The value a ticket is counted under for one field: `null` when it shows none. */
function groupValue(
  context: AppContext,
  schema: Schema,
  field: TicketField,
  ticket: Ticket,
): unknown {
  const shown = Object.values(context.ticketOutput({ ...schema, fields: [field] }, ticket));
  const value: unknown = shown[0];
  if (value === undefined || value === null || value === "") return null;
  return fieldValue(field, value);
}

/** The search filters, checked on a list ticket (the scan cannot ask them of Freshdesk). */
function fieldMatcher(schema: Schema, args: Args): (ticket: Ticket) => boolean {
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

/** A later page the limiter refused before sending (no HTTP status): the source is cut, not failed. */
function limiterRefusal(error: FreshdeskError): boolean {
  return error.code === "rate_limited" && error.http_status === null;
}

function calls(n: number): string {
  return `${n} API call${n === 1 ? "" : "s"}`;
}

export const countTicketsTool: Tool<typeof input> = {
  name: "count_tickets",
  description: [
    `Counts of the tickets created in a period, grouped by one or two ticket fields (group_by, by label or API name), counted here from every matching ticket. created_between {from, to}: days as YYYY-MM-DD, UTC, both included. Filters as list_tickets: status, priority, group and agent by name or id; type by name; tag (one tag, exact); uncategorized: true.`,
    `Only a field with a closed set of values can group: a number, checkbox, date, dropdown, type, nested field (its full path), status, priority, source, agent or group. A free-text field or any other is refused, and nothing is sent.`,
    `Example: {"group_by": ["Status", "Priority"], "created_between": {"from": "2026-01-01", "to": "2026-01-31"}} returns {"groups": [{"values": {"Status": "Open", "Priority": "High"}, "count": 2}, ...], "total": 2, "api_calls_used": 1}: groups by count, largest first; total is the tickets counted. A ticket with no value counts under null, and so does every ticket when the team config hides the field.`,
    `Up to ${SEARCH_CAP} matching tickets it reads Freshdesk's search, ${SEARCH_PAGE_SIZE} a request; above that it reads the list of tickets updated since the period's start, oldest created first, ${LIST_PAGE_SIZE} a request, until it passes the period's end. It first asks for one search page to learn the size, estimates the calls, and is refused when the estimate is over the per-call API budget: narrow the period or the filters, or call again with confirm: true. Without confirm the list read also stops at the budget.`,
    `When the read was cut (the budget, Freshdesk's last list page, the time limit, or the API rate limit), the counts are of what was read and say truncated: true: narrow the period or call again later. It counts as an expensive operation and is refused when the API budget is low. A ticket changed in the last few minutes can be missing.`,
    "api_calls_used counts every request sent for this call, retries included, and the ticket-field schema's load when this call starts it.",
  ].join(" "),
  input,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  cost: `1 API call per ${SEARCH_PAGE_SIZE} matching tickets up to ${SEARCH_CAP} (${MAX_SEARCH_PAGE} at most); above that 1 plus 1 per ${LIST_PAGE_SIZE} tickets read, up to the per-call budget (limits.call_budget, 250 by default) unless confirm: true; all within 30 s, plus one per retry after an error, plus at least 3 when the ticket-field schema is not cached`,
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
      throw new Error("count_tickets: the period did not make a search query");
    }

    const keys: string[] = [];
    for (const field of fields) {
      const label = plainName(field.label);
      keys.push(keys.includes(label) ? `${label} (${plainName(field.name)})` : label);
    }
    const groups = new Map<string, { values: unknown[]; count: number }>();
    let total = 0;
    const count = (ticket: Ticket) => {
      const values = fields.map((field) => groupValue(context, schema, field, ticket));
      const id = JSON.stringify(values);
      const group = groups.get(id);
      if (group) group.count += 1;
      else groups.set(id, { values, count: 1 });
      total += 1;
    };

    let used = loaded.attempts;
    /** Ticket requests only: what the budget is counted in. */
    let requests = 0;
    let truncated = false;
    const spent = (error: FreshdeskError) => ({
      ok: false as const,
      error: {
        ...error,
        message: `${error.message} This call has already used ${calls(used)} to learn the total.`,
      },
    });

    const probe = await searchTickets(context.http, query.query, 1, deadline, "expensive");
    if (!probe.ok) return probe;
    used += probe.attempts;
    requests += probe.attempts;

    if (probe.total <= SEARCH_CAP) {
      const estimate = estimateCalls({
        tickets: Math.max(0, probe.total - SEARCH_PAGE_SIZE),
        pageSize: SEARCH_PAGE_SIZE,
        conversations: false,
        probe: 1,
      });
      const refusal = checkBudget(context, estimate, args.confirm);
      if (refusal) return spent(refusal);
      probe.results.filter((ticket) => matchesLocal(query, ticket)).forEach(count);
      const pages = Math.ceil(probe.total / SEARCH_PAGE_SIZE);
      for (let page = 2; page <= pages; page++) {
        if (Date.now() - started >= SCAN_START_MS) {
          truncated = true;
          break;
        }
        const found = await searchTickets(context.http, query.query, page, deadline, "expensive");
        if (!found.ok) {
          if (!limiterRefusal(found.error)) return found;
          used += found.attempts ?? 0;
          truncated = true;
          break;
        }
        used += found.attempts;
        found.results.filter((ticket) => matchesLocal(query, ticket)).forEach(count);
      }
    } else {
      const estimate = estimateCalls({
        tickets: probe.total,
        pageSize: LIST_PAGE_SIZE,
        conversations: false,
        probe: 1,
      });
      const refusal = checkBudget(context, estimate, args.confirm);
      if (refusal) return spent(refusal);
      const budget = args.confirm === true ? Infinity : context.team.limits.call_budget;
      const matches = fieldMatcher(schema, args);
      const { from, to } = args.created_between;
      for (let page = 1; ; page++) {
        if (requests + 1 > budget || Date.now() - started >= SCAN_START_MS) {
          truncated = true;
          break;
        }
        const listed = await listTickets(
          context.http,
          {
            per_page: LIST_PAGE_SIZE,
            page,
            updated_since: `${from}T00:00:00Z`,
            order_by: "created_at",
            order_type: "asc",
          },
          deadline,
          "expensive",
        );
        if (!listed.ok) {
          if (!limiterRefusal(listed.error)) return listed;
          used += listed.attempts ?? 0;
          truncated = true;
          break;
        }
        used += listed.attempts;
        requests += listed.attempts;
        listed.tickets
          .filter((ticket) => matches(ticket) && matchesLocal(query, ticket))
          .forEach(count);
        const last = createdDay(listed.tickets.at(-1));
        if (last !== undefined && last > to) break;
        if (page === MAX_LIST_PAGE) {
          truncated = listed.has_more || listed.tickets.length === LIST_PAGE_SIZE;
          break;
        }
        if (!listed.has_more) break;
      }
    }

    const sorted = [...groups.entries()].sort(([a, x], [b, y]) =>
      y.count !== x.count ? y.count - x.count : a < b ? -1 : a > b ? 1 : 0,
    );
    return {
      ok: true,
      value: {
        groups: sorted.map(([, group]) => {
          const values: Record<string, unknown> = {};
          group.values.forEach((value, i) => {
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
        total,
        ...(truncated ? { truncated: true } : {}),
        api_calls_used: used,
      },
    };
  },
};
