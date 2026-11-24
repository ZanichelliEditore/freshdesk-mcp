// Ticket filters (SPEC §8.2, §10; docs/architecture/ticket-queries.md): the
// nine `list_tickets` filters turned into the request that note names,
// names resolved to ids on the read side. Not `ticketInput`, which refuses
// agent and group.
//
//   - `resolveFilter`: status, priority, type, group or agent, by name or by
//     id. A name is compared trimmed, NFC-normalised and lower-cased; it
//     resolves when it names exactly one id: status and priority through
//     their field's choices (a status by its agent name), type to its
//     choice as Freshdesk spells it, agent and group through the schema's
//     name maps. A name several ids share is refused, listing the ids; an
//     unknown one lists the valid names (each through `plainName`, the list
//     clipped); for agent and group, a name not found while the list is
//     truncated says the list is incomplete and asks for the id. An id
//     resolves to itself when the field or map has it, or when the map is
//     truncated (it may still exist); otherwise it is refused like a name.
//   - `buildTicketQuery`: status, priority, group, agent, type, tag and
//     `created_between` are search conditions, joined by ` AND ` in that
//     order (`status:2`, `group_id:<id>`, `type:'<name>'`, `tag:'<tag>'`,
//     `created_at:>'<from>' AND created_at:<'<to>'`); `updated_since`
//     joins them as `updated_at:>'<its UTC day − 1>'`. On `created_at`,
//     search's `>` and `<` keep the day given and compare UTC days
//     (measured 2026-11-24, T-055), so `created_between` is exact, not
//     widened. `updated_at` was not measured, so its day stays widened by
//     one until it is. Both are also returned as local checks
//     (`created_between`, `updated_since` on the result, which callers must
//     apply with `matchesLocal`): the `updated_since` one drops the widened
//     day and the time before the instant; the `created_between` one is a
//     guard that drops nothing the measured search returns.
//     With no search condition the list endpoint serves the call,
//     `updated_since` as its parameter (a UTC instant to the second), no
//     local date check. No filter: the list with no parameter.
//   - A quoted value (type, tag) goes in single quotes. Freshdesk documents
//     no escape inside them, so a value containing `'`, `"`, `\` or a
//     control or format character (`\p{Cc}`, `\p{Cf}`) is refused, not
//     escaped: a quote would end the value and add a clause, and
//     `searchTickets` refuses `"` and `\` anyway. ` OR ` inside the quotes
//     stays part of the one value.
//   - Dates: `updated_since` an ISO 8601 date-time with a zone of `Z` or
//     `±HH:MM`, `created_between` `{from, to}` as `YYYY-MM-DD`, from ≤ to;
//     a calendar-impossible day (2026-02-30) is refused, not rolled over.
//   - `uncategorized: true` is never a search condition (a nested field is
//     not searchable): the result carries the checks, and the caller applies
//     `isUncategorized` to each ticket the request returns. The fields are
//     rows.ts's `categoryFields`, so rows and queries read the setting the
//     same way: those `uncategorised_fields` names (label or API name; a
//     nested level's name selects its nested field), else the first nested
//     field. A nested field is checked at its last level, any other where
//     the ticket holds it; `null`, absent or `""` is empty, and a ticket is
//     uncategorised when any checked field is. `false` is no filter; any
//     other non-boolean value is refused.
//   - `matchesLocal(query, ticket)`: every local check of a built query
//     (uncategorized, `updated_at` ≥ the instant, `created_at`'s UTC day
//     within the range); a ticket whose date is absent or unreadable does
//     not match a date check.
//   - Every problem is reported, one `validation` error with one entry per
//     filter, `http_status: null`: nothing was sent. A query longer than
//     `searchTickets` takes is refused here, with the reason.

import { type FieldError, type FreshdeskError, MAX_FIELD_TEXT } from "../client/errors.js";
import { MAX_QUERY_LENGTH } from "../client/resources/search.js";
import type { TicketField } from "../client/resources/ticket-fields.js";
import type { Ticket } from "../client/resources/tickets.js";
import type { NameMap, Schema } from "../schema/index.js";
import type { AppContext } from "./context.js";
import { plainName } from "./format.js";
import { categoryFields } from "./rows.js";

export type FilterKind = "status" | "priority" | "type" | "group" | "agent";

export interface TicketFilters {
  status?: string | number;
  priority?: string | number;
  type?: string;
  group?: string | number;
  agent?: string | number;
  tag?: string;
  uncategorized?: boolean;
  /** ISO 8601 date-time with a zone. */
  updated_since?: string;
  /** Days, `YYYY-MM-DD`. */
  created_between?: { from: string; to: string };
}

/** One field `isUncategorized` reads: `key` in `custom_fields` or, for a default field, the ticket. */
export interface CategoryCheck {
  /** The field's API name. */
  field: string;
  key: string;
  custom: boolean;
}

export type QueryContext = Pick<AppContext, "team">;

export type ResolveResult =
  { ok: true; value: number | string } | { ok: false; error: FreshdeskError };

/** What the request cannot ask Freshdesk exactly: checked on each ticket it returns. */
export interface LocalChecks {
  uncategorized?: CategoryCheck[];
  /** UTC instant: `updated_at` at or after it. */
  updated_since?: string;
  /** Days, inclusive, of `created_at` in UTC. */
  created_between?: { from: string; to: string };
}

export type TicketQuery =
  | ({ ok: true; endpoint: "list"; list: { updated_since?: string } } & LocalChecks)
  | ({ ok: true; endpoint: "search"; query: string } & LocalChecks)
  | { ok: false; error: FreshdeskError };

/** Characters of an echoed value, and of a list of valid names, in a message. */
const MAX_QUOTE = 80;
const MAX_LIST = 300;

/** Default fields whose value sits under another key of the ticket (as output.ts). */
const TICKET_KEY: ReadonlyMap<string, string> = new Map([
  ["agent", "responder_id"],
  ["group", "group_id"],
  ["requester", "requester_id"],
  ["company", "company_id"],
  ["product", "product_id"],
  ["ticket_type", "type"],
]);

const FIELD_TYPE = {
  status: "default_status",
  priority: "default_priority",
  type: "default_ticket_type",
} as const;

/** The search key of each id filter. */
const SEARCH_KEY = {
  status: "status",
  priority: "priority",
  group: "group_id",
  agent: "agent_id",
} as const;

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

class Refusal {
  constructor(
    readonly code: string,
    readonly message: string,
  ) {}
}

interface Option {
  name: string;
  id: number | string;
}

/** Where output.ts reads a field: its ticket key, under `custom_fields` unless default. */
export function fieldKey(name: string, isDefault: boolean): string {
  return isDefault ? (TICKET_KEY.get(name) ?? name) : name;
}

function fold(text: string): string {
  return text.normalize("NFC").trim().toLowerCase();
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function quote(value: unknown): string {
  let text: string | undefined;
  try {
    text = JSON.stringify(value);
  } catch {
    text = undefined;
  }
  return clip(text ?? typeof value, MAX_QUOTE);
}

function listed(options: readonly Option[], withIds: boolean): string {
  if (options.length === 0) return "(none)";
  const shown: string[] = [];
  let length = 0;
  for (const option of options) {
    const name = JSON.stringify(plainName(option.name));
    const text = withIds ? `${name} (${String(option.id)})` : name;
    if (shown.length > 0 && length + text.length > MAX_LIST) break;
    shown.push(text);
    length += text.length + 2;
  }
  const rest = options.length - shown.length;
  return shown.join(", ") + (rest > 0 ? ` … and ${rest} more` : "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The filter's options and whether the list behind them was cut, or why there are none. */
function optionsOf(
  schema: Schema,
  kind: FilterKind,
): { options: Option[]; truncated: boolean } | Refusal {
  if (kind === "agent" || kind === "group") {
    const map: NameMap = kind === "agent" ? schema.agents : schema.groups;
    return {
      options: [...map.names].map(([id, name]) => ({ name, id })),
      truncated: map.truncated,
    };
  }
  const field = schema.fields.find((candidate) => candidate.type === FIELD_TYPE[kind]);
  if (!field) return new Refusal("unknown_field", `This account has no ${kind} field.`);
  const choices = field.choices;
  const options: Option[] = [];
  if (kind === "type") {
    if (Array.isArray(choices)) for (const name of choices) options.push({ name, id: name });
  } else if (isRecord(choices)) {
    for (const [key, entry] of Object.entries(choices)) {
      if (kind === "status") {
        if (/^\d+$/.test(key) && Array.isArray(entry) && typeof entry[0] === "string") {
          options.push({ name: entry[0], id: Number(key) });
        }
      } else if (typeof entry === "number") {
        options.push({ name: key, id: entry });
      }
    }
  }
  return { options, truncated: false };
}

function resolveOne(schema: Schema, kind: FilterKind, value: unknown): number | string | Refusal {
  const found = optionsOf(schema, kind);
  if (found instanceof Refusal) return found;
  const { options, truncated } = found;
  const withIds = kind === "agent" || kind === "group";
  const valid = () => `Valid ${kind} names: ${listed(options, withIds)}.`;

  const byId =
    kind === "type" ? false : typeof value === "number" && Number.isSafeInteger(value) && value > 0;
  if (byId) {
    if (options.some((option) => option.id === value) || truncated) return value as number;
    return new Refusal("unknown_id", `No ${kind} has the id ${quote(value)}. ${valid()}`);
  }
  if (typeof value !== "string") {
    return new Refusal(
      "invalid_value",
      kind === "type"
        ? `The ${kind} filter takes a name.`
        : `The ${kind} filter takes a name or a whole-number id.`,
    );
  }
  const ids = [
    ...new Set(
      options.filter((option) => fold(option.name) === fold(value)).map((option) => option.id),
    ),
  ];
  if (ids.length === 1) return ids[0]!;
  if (ids.length > 1) {
    const which =
      kind === "type"
        ? `choices ${listed(
            options.filter((option) => fold(option.name) === fold(value)),
            false,
          )}: give one exactly as listed by get_ticket_schema`
        : `ids ${ids.join(", ")}: give the id`;
    return new Refusal("ambiguous_name", `${quote(value)} names several ${kind}s (${which}).`);
  }
  if (truncated) {
    return new Refusal(
      "incomplete_list",
      `No ${kind} named ${quote(value)} among those loaded, but the ${kind} list is incomplete: give the ${kind}'s id.`,
    );
  }
  return new Refusal("unknown_name", `No ${kind} is named ${quote(value)}. ${valid()}`);
}

function validation(problems: FieldError[]): { ok: false; error: FreshdeskError } {
  return {
    ok: false,
    error: {
      code: "validation",
      http_status: null,
      message: "Some filters are not valid; nothing was sent.",
      retryable: false,
      errors: problems,
    },
  };
}

function problem(field: string, refusal: Refusal): FieldError {
  return { field, code: refusal.code, message: clip(refusal.message, MAX_FIELD_TEXT) };
}

export function resolveFilter(schema: Schema, kind: FilterKind, value: unknown): ResolveResult {
  const resolved = resolveOne(schema, kind, value);
  return resolved instanceof Refusal
    ? validation([problem(kind, resolved)])
    : { ok: true, value: resolved };
}

/** A value in single quotes, or a refusal when it could end them. */
function quoted(what: string, value: string): string | Refusal {
  if (/['"\\\p{Cc}\p{Cf}]/u.test(value)) {
    return new Refusal(
      "unquotable_value",
      `The ${what} ${quote(value)} contains a quote, a backslash or a control character, which a search query cannot quote safely.`,
    );
  }
  return `'${value}'`;
}

/** Epoch ms of a valid calendar day, else `undefined`. */
function utcDay(year: number, month: number, day: number): number | undefined {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date.getTime()
    : undefined;
}

const DAY_MS = 86_400_000;

/** The UTC day before the instant `value`, as YYYY-MM-DD. */
function dayBefore(value: string): string {
  return new Date(Date.parse(value.slice(0, 10)) - DAY_MS).toISOString().slice(0, 10);
}

function isDay(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DAY.exec(value);
  return (
    match !== null && utcDay(Number(match[1]), Number(match[2]), Number(match[3])) !== undefined
  );
}

/** `updated_since` as a UTC instant to the second (fractions dropped), or a refusal. */
function instant(value: unknown): string | Refusal {
  const match = typeof value === "string" ? DATE_TIME.exec(value) : null;
  const refusal = new Refusal(
    "invalid_date",
    `updated_since ${quote(value)} is not an ISO 8601 date-time with a zone (2026-01-02T03:04:05Z or +01:00).`,
  );
  if (!match) return refusal;
  const [, y, mo, d, h, mi, s, sign, oh, om] = match;
  const day = utcDay(Number(y), Number(mo), Number(d));
  const parts = [Number(h), Number(mi), Number(s ?? 0), Number(oh ?? 0), Number(om ?? 0)];
  const [hour, minute, second, offH, offM] = parts as [number, number, number, number, number];
  if (day === undefined || hour > 23 || minute > 59 || second > 59 || offH > 23 || offM > 59) {
    return refusal;
  }
  const offset = (sign === "-" ? -1 : 1) * (offH * 60 + offM) * 60_000;
  const ms = day + ((hour * 60 + minute) * 60 + second) * 1000 - offset;
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function lastLevelKey(field: TicketField): string {
  const levels = [...(field.nested_ticket_fields ?? [])].sort((a, b) => a.level - b.level);
  return levels.at(-1)?.name ?? field.name;
}

function categoryChecks(ctx: QueryContext, schema: Schema): CategoryCheck[] | Refusal {
  const fields = categoryFields(ctx, schema);
  if (fields.length === 0) {
    return new Refusal(
      "no_category_field",
      ctx.team.uncategorised_fields === undefined
        ? "uncategorized cannot be checked: this account has no nested field and the team sets no uncategorised_fields."
        : "uncategorized cannot be checked: the team's uncategorised_fields name no ticket field.",
    );
  }
  return fields.map((field) => ({
    field: field.name,
    key: field.type === "nested_field" ? lastLevelKey(field) : fieldKey(field.name, field.default),
    custom: !field.default,
  }));
}

/** Epoch ms of a ticket's date key, or `undefined` when absent or unreadable. */
function ticketTime(ticket: Ticket, key: string): number | undefined {
  const value: unknown = Object.hasOwn(ticket, key) ? ticket[key] : undefined;
  const time = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isNaN(time) ? undefined : time;
}

/** Whether the ticket passes every local check of a built query. */
export function matchesLocal(checks: LocalChecks, ticket: Ticket): boolean {
  if (checks.uncategorized !== undefined && !isUncategorized(checks.uncategorized, ticket)) {
    return false;
  }
  if (checks.updated_since !== undefined) {
    const updated = ticketTime(ticket, "updated_at");
    if (updated === undefined || updated < Date.parse(checks.updated_since)) return false;
  }
  if (checks.created_between !== undefined) {
    const created = ticketTime(ticket, "created_at");
    if (created === undefined) return false;
    const day = new Date(created).toISOString().slice(0, 10);
    if (day < checks.created_between.from || day > checks.created_between.to) return false;
  }
  return true;
}

/** Whether any checked field is empty (`null`, absent or `""`) on the ticket. */
export function isUncategorized(checks: readonly CategoryCheck[], ticket: Ticket): boolean {
  return checks.some(({ key, custom }) => {
    const holder: unknown = custom ? ticket.custom_fields : ticket;
    const value = isRecord(holder) && Object.hasOwn(holder, key) ? holder[key] : undefined;
    return value === undefined || value === null || value === "";
  });
}

export function buildTicketQuery(
  ctx: QueryContext,
  schema: Schema,
  filters: TicketFilters,
): TicketQuery {
  const problems: FieldError[] = [];
  const conditions: string[] = [];

  for (const kind of ["status", "priority", "group", "agent"] as const) {
    if (filters[kind] === undefined) continue;
    const id = resolveOne(schema, kind, filters[kind]);
    if (id instanceof Refusal) problems.push(problem(kind, id));
    else conditions.push(`${SEARCH_KEY[kind]}:${String(id)}`);
  }
  if (filters.type !== undefined) {
    const name = resolveOne(schema, "type", filters.type);
    const value = name instanceof Refusal ? name : quoted("type", String(name));
    if (value instanceof Refusal) problems.push(problem("type", value));
    else conditions.push(`type:${value}`);
  }
  if (filters.tag !== undefined) {
    const tag = filters.tag as unknown;
    const value =
      typeof tag === "string" && tag.trim() !== ""
        ? quoted("tag", tag)
        : new Refusal("invalid_value", "The tag filter takes a non-blank string.");
    if (value instanceof Refusal) problems.push(problem("tag", value));
    else conditions.push(`tag:${value}`);
  }
  let createdBetween: { from: string; to: string } | undefined;
  if (filters.created_between !== undefined) {
    const range = filters.created_between as unknown;
    const from = isRecord(range) ? range.from : undefined;
    const to = isRecord(range) ? range.to : undefined;
    if (isDay(from) && isDay(to) && from <= to) {
      conditions.push(`created_at:>'${from}' AND created_at:<'${to}'`);
      createdBetween = { from, to };
    } else {
      problems.push(
        problem(
          "created_between",
          new Refusal(
            "invalid_date",
            "created_between takes {from, to}, each a day as YYYY-MM-DD, from not after to.",
          ),
        ),
      );
    }
  }
  let updatedSince: string | undefined;
  if (filters.updated_since !== undefined) {
    const value = instant(filters.updated_since);
    if (value instanceof Refusal) problems.push(problem("updated_since", value));
    else updatedSince = value;
  }
  let checks: CategoryCheck[] | undefined;
  const uncategorized = filters.uncategorized as unknown;
  if (uncategorized === true) {
    const value = categoryChecks(ctx, schema);
    if (value instanceof Refusal) problems.push(problem("uncategorized", value));
    else checks = value;
  } else if (uncategorized !== undefined && uncategorized !== false) {
    problems.push(
      problem("uncategorized", new Refusal("invalid_value", "uncategorized takes true or false.")),
    );
  }

  const searched = conditions.length > 0;
  if (searched && updatedSince !== undefined) {
    // Widened a day: updated_at's boundary was not measured (T-055).
    conditions.push(`updated_at:>'${dayBefore(updatedSince)}'`);
  }
  const query = conditions.join(" AND ");
  if (problems.length === 0 && `"${query}"`.length > MAX_QUERY_LENGTH) {
    problems.push(
      problem(
        "query",
        new Refusal(
          "query_too_long",
          `These filters make a search query longer than Freshdesk's ${MAX_QUERY_LENGTH} characters: use fewer or shorter values.`,
        ),
      ),
    );
  }
  if (problems.length > 0) return validation(problems);

  const local: LocalChecks = checks === undefined ? {} : { uncategorized: checks };
  if (searched) {
    if (updatedSince !== undefined) local.updated_since = updatedSince;
    if (createdBetween !== undefined) local.created_between = createdBetween;
    return { ok: true, endpoint: "search", query, ...local };
  }
  return {
    ok: true,
    endpoint: "list",
    list: updatedSince === undefined ? {} : { updated_since: updatedSince },
    ...local,
  };
}
