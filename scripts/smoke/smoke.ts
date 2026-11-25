// The smoke script (SPEC §11, §14 rule 1): the one way a session's code meets
// the real Freshdesk account, run by the owner's hand, never by a test or CI.
//
// Read-only by construction: `SmokeClient` is an `HttpClient` whose `request`
// refuses any method but GET before the base sees the call, so nothing is
// sent, logged or charged to the limiter. `requestWithRetry` calls
// `this.request`, so the same guard covers it. `paginate` always builds a GET
// and would send a write as one; it refuses a method other than GET too, so a
// write is refused, not quietly turned into a read. The subclass adds no
// instance field: the base freezes the instance in its constructor.
//
// What it prints: the shape of `/ticket_fields` (per default field, and per
// custom-field type, the shape of `choices` and counts), whether the zod
// schemas of the resource modules accepted `/ticket_fields`, `/agents` and
// `/groups`, and one line for OD-4: whether agent, group and product carry a
// name → id `choices` record. Never a label, a name, an id, a choice, the
// domain, the key, or Freshdesk's text: a failure prints its error code only.
// A field type is printed only when it is spelled like an API type name.
// A 2xx whose body is not JSON is said to be "not JSON"; a JSON body a zod
// schema refuses, "refused by the schema".
//
// It refuses to start when FRESHDESK_HOST_OVERRIDE is set: it exists for the
// real account only. A configuration it cannot load, and any error it did not
// expect, each print one fixed line: no message, no stack.
//
// Exit code: 0 when the three lists were fetched and accepted, 1 otherwise.
//
// `runProbes` (`make smoke-probes`, T-022) is the second report: one line per
// probe of the ticket list and search endpoints, with the same rules (GET
// only, no value read from the account printed, a failure as its code).
// A search total and a duration are printed as bands, not figures.
// Exit code 0 when the run finished: a refused probe is a measurement.
//
// `runDateProbes` (`make smoke-date-probes`, T-055) is the third: search's
// day operators against local counts, under the same rules; it prints the
// probed dates and exact counts (counts, not values), never the zone's name.
//
// `runCore` (`make smoke-core`, T-039, ./core.ts) is the fourth: every `core`
// tool through the server in process, over this client.

import type { Dispatcher } from "undici";
import {
  HttpClient,
  type HttpRequest,
  type HttpResult,
  type PageCap,
  type PageEnd,
  type PageRequest,
} from "../../src/client/http.js";
import { RateLimiter } from "../../src/client/rate-limit.js";
import { listAgents } from "../../src/client/resources/agents.js";
import { listGroups } from "../../src/client/resources/groups.js";
import type { ListResult } from "../../src/client/resources/list-all.js";
import { listTicketFields } from "../../src/client/resources/ticket-fields.js";
import { type Config, ConfigError, loadConfig } from "../../src/config.js";
import type { FreshdeskError } from "../../src/client/errors.js";
import { type CoreOptions, parseDays, runCore } from "./core.js";

export type { CoreOptions };

type Out = (line: string) => void;

const NOT_GET: HttpResult = Object.freeze({
  ok: false,
  error: Object.freeze({
    code: "validation",
    http_status: null,
    message: "Not sent: the smoke client sends GET only.",
    retryable: false,
  }),
}) as HttpResult;

/** No method, or exactly `GET`. */
function isGet(method: unknown): boolean {
  return method === undefined || method === "GET";
}

export class SmokeClient extends HttpClient {
  override async request(request: HttpRequest, deadline?: number): Promise<HttpResult> {
    // Read once; the base is handed a copy whose method is GET, so a getter
    // that answers differently the second time changes nothing.
    if (!isGet(request.method)) return NOT_GET;
    return super.request({ ...request, method: "GET" }, deadline);
  }

  override async *paginate(
    request: PageRequest,
    cap: PageCap,
    deadline?: number,
  ): AsyncGenerator<HttpResult, PageEnd, void> {
    if (!isGet((request as HttpRequest).method)) {
      yield NOT_GET;
      return { truncated: false, attempts: 0 };
    }
    return yield* super.paginate(request, cap, deadline);
  }
}

/**
 * The shape of a field's `choices`, with counts, never a value:
 * `none`, `list(n)`, `name_to_id(n)`, `id_to_names(n)` (keys all digits,
 * values lists), `tree(depth d: n1/n2/...)` (entries per level),
 * `empty_record`, or `other`.
 */
export function choicesShape(choices: unknown): string {
  if (choices === undefined || choices === null) return "none";
  if (isNames(choices)) return `list(${choices.length})`;
  if (!isRecord(choices)) return "other";
  const entries = Object.entries(choices);
  if (entries.length === 0) return "empty_record";
  if (entries.every(([, value]) => typeof value === "number")) {
    return `name_to_id(${entries.length})`;
  }
  if (entries.every(([key, value]) => /^\d+$/.test(key) && isNames(value))) {
    return `id_to_names(${entries.length})`;
  }
  const levels = treeLevels(choices);
  return levels === undefined ? "other" : `tree(depth ${levels.length}: ${levels.join("/")})`;
}

/** Entries per level of a tree two or three levels deep; `undefined` if it is not one. */
function treeLevels(tree: Record<string, unknown>): number[] | undefined {
  const values = Object.values(tree);
  if (values.every(isNames)) {
    return [values.length, values.reduce((sum, names) => sum + names.length, 0)];
  }
  if (!values.every((value) => isRecord(value) && Object.values(value).every(isNames))) {
    return undefined;
  }
  const middles = values as Record<string, string[]>[];
  const leaves = middles.flatMap((middle) => Object.values(middle));
  return [
    values.length,
    middles.reduce((sum, middle) => sum + Object.keys(middle).length, 0),
    leaves.reduce((sum, names) => sum + names.length, 0),
  ];
}

function isNames(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** An API type name (`custom_dropdown`) as it is; anything else `other`. */
function typeName(type: unknown): string {
  return typeof type === "string" && /^[a-z][a-z0-9_]{0,39}$/.test(type) ? type : "other";
}

/**
 * A failure in a few words, never its message. A 2xx comes back as an error
 * in two cases only: the HTTP core could not parse the body (its fixed
 * message, src/client/http.ts), or a resource module's zod schema refused it.
 */
function failure(error: FreshdeskError): string {
  const ok = error.http_status !== null && error.http_status >= 200 && error.http_status < 300;
  if (error.code !== "server" || !ok) return `fail ${error.code}`;
  return error.message.startsWith("Freshdesk sent a body that is not JSON")
    ? "not JSON"
    : "refused by the schema";
}

const OD4_TYPES = ["default_agent", "default_group", "default_product"];

/** The shape report of a raw `/ticket_fields` body. */
function reportShapes(body: unknown, out: Out): void {
  if (!Array.isArray(body)) {
    out("ticket_fields: not a list");
    return;
  }
  const defaults: string[] = [];
  const custom = new Map<string, Map<string, number>>();
  const od4 = new Map<string, string>();
  for (const field of body) {
    const record = isRecord(field) ? field : {};
    const type = typeName(record.type);
    const shape = choicesShape(record.choices);
    if (record.default === true) {
      defaults.push(`default ${type}: ${shape}`);
      if (OD4_TYPES.includes(type) && !od4.has(type)) od4.set(type, shape);
    } else {
      const shapes = custom.get(type) ?? new Map<string, number>();
      shapes.set(shape, (shapes.get(shape) ?? 0) + 1);
      custom.set(type, shapes);
    }
  }
  for (const line of defaults) out(line);
  for (const [type, shapes] of custom) {
    const count = [...shapes.values()].reduce((sum, n) => sum + n, 0);
    const parts = [...shapes].map(([shape, n]) => `${shape} x${n}`);
    out(`custom ${type}: ${count} field${count === 1 ? "" : "s"}, ${parts.join(", ")}`);
  }
  const answers = OD4_TYPES.map((type) => {
    const shape = od4.get(type);
    if (shape === undefined) return `${type} no (absent)`;
    return shape.startsWith("name_to_id(") ? `${type} yes` : `${type} no (${shape})`;
  });
  out(`OD-4 name_to_id choices: ${answers.join(", ")}`);
}

function reportList(noun: string, result: ListResult<unknown>, out: Out): boolean {
  if (result.ok) {
    out(
      `${noun}: accepted, ${result.items.length}, ${result.truncated ? "truncated" : "complete"}`,
    );
    return true;
  }
  out(`${noun}: ${failure(result.error)}`);
  return false;
}

/** The report, one line at a time to `out`. Returns the exit code. */
export async function runSmoke(http: SmokeClient, out: Out): Promise<number> {
  out(
    "smoke: GET only; shapes and counts, no names or ids. Keep this output in docs/private/account-facts.md (gitignored); copy only shape lines into tracked files.",
  );
  let ok = true;

  const raw = await http.requestWithRetry({ path: "/ticket_fields" });
  if (raw.ok) {
    reportShapes(raw.body, out);
    const fields = await listTicketFields(http);
    if (fields.ok) {
      out(`ticket_fields: accepted, ${fields.fields.length} fields`);
    } else {
      ok = false;
      out(`ticket_fields: ${failure(fields.error)}`);
    }
  } else {
    ok = false;
    out(`ticket_fields: ${failure(raw.error)}`);
  }

  ok = reportList("agents", await listAgents(http), out) && ok;
  ok = reportList("groups", await listGroups(http), out) && ok;
  out(ok ? "smoke: ok" : "smoke: fail");
  return ok ? 0 : 1;
}

// ---------------------------------------------------------------------------
// T-022's probes (`make smoke-probes`): which endpoint serves which ticket
// filter, measured where the API documentation is silent. GET only, through
// the same client. Each line prints fixed words, counts, yes/no and the
// credits Freshdesk says the request cost; never a value read from a ticket
// or a field. A field name or a ticket id read from one response is used in
// the next request only, and the client logs the path template, not the
// query or the id. A failed probe prints its error code only.

const DAY_MS = 86_400_000;

/** The `stats` keys `triage_queue` would read; the docs name only three. */
const STATS_KEYS = [
  "first_responded_at",
  "agent_responded_at",
  "requester_responded_at",
  "status_updated_at",
  "pending_since",
  "resolved_at",
  "closed_at",
  "reopened_at",
];

/** The ticket keys `triage_queue` and the filters would read. */
const TICKET_KEYS = [
  "fr_due_by",
  "due_by",
  "nr_due_by",
  "fr_escalated",
  "is_escalated",
  "nr_escalated",
  "tags",
  "custom_fields",
  "requester_id",
  "company_id",
  "stats",
];

function yes(value: boolean): string {
  return value ? "yes" : "no";
}

/** The credits header, digits only; `?` when absent or not a count. */
function credits(headers: Headers): string {
  const value = headers.get("x-ratelimit-used-currentrequest");
  return value !== null && /^\d{1,6}$/.test(value) ? value : "?";
}

/** `yes`/`no` per key of a fixed list: no key of the account is printed. */
function keysPresent(item: unknown, keys: readonly string[]): string {
  const record = isRecord(item) ? item : {};
  return keys.map((key) => `${key} ${yes(key in record)}`).join(", ");
}

/** `keysPresent` of the first item, or `skipped (no item)` when there is none to read. */
function firstKeys(
  items: unknown[] | undefined,
  keys: readonly string[],
  pick = (item: unknown) => item,
): string {
  const first = items?.[0];
  return first === undefined ? "skipped (no item)" : keysPresent(pick(first), keys);
}

/** A duration as a band, never the figure: `<2s`, `2-5s`, `5-10s`, `>10s`. */
export function elapsedBand(ms: number): string {
  if (ms < 2_000) return "<2s";
  if (ms < 5_000) return "2-5s";
  if (ms <= 10_000) return "5-10s";
  return ">10s";
}

/** A search total as a band, never the figure: `0`, `1-300`, `>300`. */
export function totalBand(total: number): string {
  if (total <= 0) return "0";
  return total <= 300 ? "1-300" : ">300";
}

function olderThan(items: unknown[], days: number, now: number): number {
  return items.filter((item) => {
    const created = isRecord(item) ? Date.parse(String(item.created_at)) : NaN;
    return created < now - days * DAY_MS;
  }).length;
}

/** An ISO instant without milliseconds, as Freshdesk's examples write it. */
function instant(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function day(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function positiveId(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

/** The first nested field's top-level and last-level API names, from a raw body. */
function nestedNames(
  fields: unknown,
): { top: string; last: string; value: string | undefined } | undefined {
  if (!Array.isArray(fields)) return undefined;
  const field = fields.find((item) => isRecord(item) && item.type === "nested_field") as
    Record<string, unknown> | undefined;
  if (field === undefined || typeof field.name !== "string") return undefined;
  const levels = Array.isArray(field.nested_ticket_fields)
    ? field.nested_ticket_fields.filter(
        (level): level is { name: string; level: number } =>
          isRecord(level) && typeof level.name === "string" && typeof level.level === "number",
      )
    : [];
  const deepest = levels.reduce<{ name: string; level: number } | undefined>(
    (best, level) => (best === undefined || level.level > best.level ? level : best),
    undefined,
  );
  const value = isRecord(field.choices) ? Object.keys(field.choices)[0] : undefined;
  return { top: field.name, last: deepest?.name ?? field.name, value };
}

/** The first custom dropdown's API name, from a raw body. */
function dropdownName(fields: unknown): string | undefined {
  if (!Array.isArray(fields)) return undefined;
  const field = fields.find(
    (item) => isRecord(item) && item.type === "custom_dropdown" && typeof item.name === "string",
  ) as { name: string } | undefined;
  return field?.name;
}

/** A name fit to stand in a search query unquoted; anything else is not probed. */
function queryName(name: string): boolean {
  return /^[A-Za-z0-9_]{1,64}$/.test(name);
}

/** A choice fit to stand in single quotes in a query: no quote, no backslash. */
function queryValue(value: string | undefined): value is string {
  return value !== undefined && /^[A-Za-z0-9 _.-]{1,64}$/.test(value);
}

/** One GET; prints `probe <name>: fail <code>` or calls `ok` with the body's list. */
async function probe(
  http: SmokeClient,
  name: string,
  request: PageRequest,
  out: Out,
  ok: (items: unknown[], body: unknown, headers: Headers) => string,
  clock?: () => number,
): Promise<unknown[] | undefined> {
  const started = clock?.();
  const result = await http.requestWithRetry({ ...request, method: "GET" });
  const elapsed =
    clock === undefined || started === undefined
      ? ""
      : `, elapsed ${elapsedBand(clock() - started)}`;
  if (!result.ok) {
    out(`probe ${name}: ${failure(result.error)}`);
    return undefined;
  }
  const body = result.body;
  const items = Array.isArray(body)
    ? body
    : isRecord(body) && Array.isArray(body.results)
      ? body.results
      : undefined;
  if (items === undefined) {
    out(`probe ${name}: not a list, credits ${credits(result.headers)}`);
    return undefined;
  }
  out(
    `probe ${name}: ${ok(items, body, result.headers)}${elapsed}, credits ${credits(result.headers)}`,
  );
  return items;
}

/** `n items, next yes|no` for a list page. */
function page(items: unknown[], headers: Headers): string {
  return `${items.length} items, next ${yes(headers.get("link") !== null)}`;
}

/** `total 0|1-300|>300, n items` for a search page. */
function searchPage(items: unknown[], body: unknown): string {
  const total = isRecord(body) && typeof body.total === "number" ? body.total : undefined;
  const totalText = total === undefined ? "total ?" : `total ${totalBand(total)}`;
  return `${totalText}, ${items.length} items`;
}

function search(query: string, extra: Record<string, string | number> = {}): PageRequest {
  return { path: "/search/tickets", query: { query: `"${query}"`, ...extra } };
}

/** The probes, one line each to `out`. Returns 0 when the run finished. */
export async function runProbes(
  http: SmokeClient,
  out: Out,
  now = Date.now(),
  clock: () => number = () => performance.now(),
): Promise<number> {
  out(
    "probes: GET only; counts, bands, yes/no and credits, no names or ids. Keep this output in docs/private/account-facts.md (gitignored); copy only these lines into tracked files.",
  );
  const old = (items: unknown[]) => `created over 31 days ago ${olderThan(items, 31, now)}`;

  // The 30-day window of GET /tickets, and what updated_since does to it.
  const recent = await probe(
    http,
    "list_default",
    { path: "/tickets", query: { per_page: 100 } },
    out,
    (items, _b, h) => `${page(items, h)}, ${old(items)}`,
  );
  await probe(
    http,
    "list_updated_since_365d",
    {
      path: "/tickets",
      query: {
        per_page: 100,
        updated_since: instant(now - 365 * DAY_MS),
        order_by: "created_at",
        order_type: "asc",
      },
    },
    out,
    (items, _b, h) => `${page(items, h)}, ${old(items)}`,
    clock,
  );
  // The same deep page in the default order (created_at desc): is depth or order slow?
  await probe(
    http,
    "list_updated_since_365d_default_order",
    { path: "/tickets", query: { per_page: 100, updated_since: instant(now - 365 * DAY_MS) } },
    out,
    (items, _b, h) => `${page(items, h)}, ${old(items)}`,
    clock,
  );
  // GET /tickets documents no status parameter: refused, ignored or applied?
  await probe(
    http,
    "list_status_param",
    { path: "/tickets", query: { per_page: 100, status: 2 } },
    out,
    (items, _b, h) =>
      `${page(items, h)}, all status 2 ${yes(items.every((item) => isRecord(item) && item.status === 2))}`,
  );
  // include=stats: which keys it carries, and what it costs.
  await probe(
    http,
    "list_include_stats",
    { path: "/tickets", query: { per_page: 100, include: "stats" } },
    out,
    (items, _b, h) =>
      `${page(items, h)}, stats ${firstKeys(items, STATS_KEYS, (item) => (isRecord(item) ? item.stats : undefined))}`,
  );
  out(`probe list_ticket_keys: ${firstKeys(recent, TICKET_KEYS)}`);

  // The requester filter of get_ticket's recent tickets, with and without updated_since.
  const firstTicket = recent?.[0];
  const requester = isRecord(firstTicket) ? positiveId(firstTicket.requester_id) : undefined;
  if (requester === undefined) {
    out("probe list_requester: skipped (no ticket in the last 30 days)");
  } else {
    await probe(
      http,
      "list_requester",
      { path: "/tickets", query: { per_page: 100, requester_id: requester } },
      out,
      (items, _b, h) => `${page(items, h)}, ${old(items)}`,
    );
    await probe(
      http,
      "list_requester_updated_since_2000",
      {
        path: "/tickets",
        query: { per_page: 100, requester_id: requester, updated_since: "2000-01-01T00:00:00Z" },
      },
      out,
      (items, _b, h) => `${page(items, h)}, ${old(items)}`,
    );
  }

  // Conversations per page, for export_tickets' call count per ticket.
  const ticketId = isRecord(firstTicket) ? positiveId(firstTicket.id) : undefined;
  if (ticketId === undefined) {
    out("probe conversations_per_page_100: skipped (no ticket in the last 30 days)");
    out("probe view_include_stats: skipped (no ticket in the last 30 days)");
  } else {
    // One ticket's view with include=stats: the 8 keys the list carries? (T-029)
    const viewed = await http.requestWithRetry({
      path: "/tickets/{id}",
      params: { id: ticketId },
      query: { include: "stats" },
    });
    if (!viewed.ok) {
      out(`probe view_include_stats: ${failure(viewed.error)}`);
    } else if (!isRecord(viewed.body)) {
      out(`probe view_include_stats: not a ticket, credits ${credits(viewed.headers)}`);
    } else {
      out(
        `probe view_include_stats: stats ${keysPresent(viewed.body.stats, STATS_KEYS)}, credits ${credits(viewed.headers)}`,
      );
    }
    await probe(
      http,
      "conversations_per_page_100",
      { path: "/tickets/{id}/conversations", params: { id: ticketId }, query: { per_page: 100 } },
      out,
      (items, _b, h) => page(items, h),
    );
  }

  // Search: the fields of a result, include=stats, the 300-result cap.
  const open = await probe(http, "search_status_open", search("status:2"), out, (items, body) =>
    searchPage(items, body),
  );
  out(`probe search_ticket_keys: ${firstKeys(open, TICKET_KEYS)}`);
  // Spaced queries on fields search documents: a control for `+` as a space.
  await probe(http, "search_spaced_or", search("status:2 OR status:3"), out, (items, body) =>
    searchPage(items, body),
  );
  await probe(http, "search_spaced_and", search("status:2 AND priority:1"), out, (items, body) =>
    searchPage(items, body),
  );
  await probe(
    http,
    "search_include_stats",
    search("status:2", { include: "stats" }),
    out,
    (items, body) =>
      `${searchPage(items, body)}, stats ${firstKeys(items, STATS_KEYS, (item) => (isRecord(item) ? item.stats : undefined))}`,
  );
  const all = search("created_at:>'2000-01-01'");
  await probe(http, "search_cap_page_1", all, out, (items, body) => searchPage(items, body));
  await probe(
    http,
    "search_cap_page_10",
    { ...all, query: { ...all.query, page: 10 } },
    out,
    (items, body) => searchPage(items, body),
  );
  await probe(
    http,
    "search_cap_page_11",
    { ...all, query: { ...all.query, page: 11 } },
    out,
    (items, body) => searchPage(items, body),
  );

  // field:null on the nested field (uncategorized's default rule).
  const fields = await http.requestWithRetry({ path: "/ticket_fields" });
  if (!fields.ok) {
    out(`probe nested_field: ${failure(fields.error)}`);
    out("probes: done");
    return 0;
  }
  const custom = (item: unknown) =>
    isRecord(item) && isRecord(item.custom_fields) ? item.custom_fields : {};
  const empty = (name: string) => (items: unknown[], body: unknown) => {
    const blank = items.every((item) => {
      const value = custom(item)[name];
      return value === null || value === undefined || value === "";
    });
    return `${searchPage(items, body)}, all empty ${yes(blank)}`;
  };
  // A control: `<dropdown>:null` on a plain custom dropdown, which search documents.
  const dropdown = dropdownName(fields.body);
  if (dropdown === undefined || !queryName(dropdown)) {
    out("probe search_null_dropdown: skipped (no custom dropdown with a plain API name)");
  } else {
    await probe(http, "search_null_dropdown", search(`${dropdown}:null`), out, empty(dropdown));
  }
  const nested = nestedNames(fields.body);
  if (nested === undefined || !queryName(nested.top) || !queryName(nested.last)) {
    out("probe nested_field: skipped (no nested field with a plain API name)");
  } else {
    // A control: the nested field's top level asked for one of its own values.
    const value = nested.value;
    if (!queryValue(value)) {
      out("probe search_nested_top_value: skipped (no top-level choice fit for a query)");
    } else {
      await probe(
        http,
        "search_nested_top_value",
        search(`${nested.top}:'${value}'`),
        out,
        (items, body) =>
          `${searchPage(items, body)}, all match ${yes(items.every((item) => custom(item)[nested.top] === value))}`,
      );
    }
    await probe(
      http,
      "search_null_nested_top",
      search(`${nested.top}:null`),
      out,
      empty(nested.top),
    );
    await probe(
      http,
      "search_null_nested_last",
      search(`${nested.last}:null`),
      out,
      empty(nested.last),
    );
    await probe(
      http,
      "search_null_nested_last_30d",
      search(`${nested.last}:null AND created_at:>'${day(now - 30 * DAY_MS)}'`),
      out,
      empty(nested.last),
    );
  }
  out("probes: done");
  return 0;
}

// ---------------------------------------------------------------------------
// T-055's date probes (`make smoke-date-probes`): whether search's
// `created_at:>'D'` and `<'D'` keep the boundary day, and whose day they use.
// For a few recent days D, the exact search totals of five day queries are
// set beside local counts of the same tickets read from the list endpoint
// (`updated_since` two days before the oldest D, newest first, until the
// window is passed or the page cap is hit), each ticket's day taken in UTC
// and in the account's time zone. A verdict line names which of eight
// readings (`>` and `<` each exclusive or inclusive, the day UTC's or the
// zone's) predict every total. Printed: the probed dates, counts, the zone's
// UTC offset and yes/no; never the zone's name, an id or a ticket value.

type Bound = "exclusive" | "inclusive";
type DayOf = "UTC" | "zone";

/** One reading of search's day operators. */
export interface DateReading {
  gt: Bound;
  lt: Bound;
  day: DayOf;
}

const READINGS: readonly DateReading[] = (["exclusive", "inclusive"] as const).flatMap((gt) =>
  (["exclusive", "inclusive"] as const).flatMap((lt) =>
    (["UTC", "zone"] as const).map((day) => ({ gt, lt, day })),
  ),
);

/** The day after (or before) `value` by `days`, as YYYY-MM-DD. */
function shift(value: string, days: number): string {
  return day(Date.parse(value) + days * DAY_MS);
}

/** Whether `ticketDay` passes `>'bound'` (exclusive: after it; inclusive: on or after it). */
function after(ticketDay: string, bound: string, how: Bound): boolean {
  return how === "exclusive" ? ticketDay > bound : ticketDay >= bound;
}

/** Whether `ticketDay` passes `<'bound'` (exclusive: before it; inclusive: on or before it). */
function before(ticketDay: string, bound: string, how: Bound): boolean {
  return how === "exclusive" ? ticketDay < bound : ticketDay <= bound;
}

/** A day query of the probes: its text with D written as `D`, and the days it keeps. */
interface DayQuery {
  label: string;
  query: (d: string) => string;
  keeps: (ticketDay: string, d: string, reading: DateReading) => boolean;
}

/** `>'lo' AND <'hi'` around D, lo and hi as offsets from D in days. */
function between(lo: number, hi: number): DayQuery {
  const name = (offset: number) => (offset === 0 ? "D" : `D${offset > 0 ? "+" : ""}${offset}`);
  return {
    label: `created_at:>'${name(lo)}' AND created_at:<'${name(hi)}'`,
    query: (d) => `created_at:>'${shift(d, lo)}' AND created_at:<'${shift(d, hi)}'`,
    keeps: (ticketDay, d, reading) =>
      after(ticketDay, shift(d, lo), reading.gt) && before(ticketDay, shift(d, hi), reading.lt),
  };
}

const DAY_QUERIES: readonly DayQuery[] = [
  {
    label: "created_at:'D'",
    query: (d) => `created_at:'${d}'`,
    keeps: (ticketDay, d) => ticketDay === d,
  },
  between(-1, 1),
  between(-1, 0),
  between(0, 1),
  between(0, 0),
];

/** Pages of 100 the local scan reads at most. */
export const DATE_SCAN_PAGES = 30;

/** The zone assumed when the account's cannot be read or resolved. */
const ASSUMED_ZONE = "Europe/Rome";

/**
 * The probed days: the `count` most recent Tuesdays to Thursdays (UTC) whose
 * next day ended at least two days before `now`'s UTC day, newest first, so
 * D−1, D and D+1 are weekdays and over in every zone.
 */
export function probeDays(now: number, count = 3): string[] {
  const days: string[] = [];
  for (let t = Date.parse(day(now)) - 3 * DAY_MS; days.length < count; t -= DAY_MS) {
    const weekday = new Date(t).getUTCDay();
    if (weekday >= 2 && weekday <= 4) days.push(day(t));
  }
  return days;
}

function isZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * An IANA zone for the account's `timezone`: the value itself when it is one,
 * else a Rails-style city name (`Rome`) under a continent prefix; `undefined`
 * when neither resolves.
 */
export function resolveZone(name: unknown): string | undefined {
  if (typeof name !== "string" || !/^[A-Za-z][A-Za-z0-9 _/+-]{0,63}$/.test(name)) return undefined;
  if (isZone(name)) return name;
  const city = name.replace(/ /g, "_");
  return ["Europe", "America", "Asia", "Africa", "Australia", "Pacific", "Atlantic", "Indian"]
    .map((continent) => `${continent}/${city}`)
    .find(isZone);
}

/** The wall-clock parts of `ms` in `zone`. */
function wallClock(ms: number, zone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(ms);
  return Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]),
  );
}

/** The day `ms` falls on in `zone`, as YYYY-MM-DD. */
export function zoneDay(ms: number, zone: string): string {
  const { year, month, day: date } = wallClock(ms, zone);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
}

/** `zone`'s offset from UTC at `ms`, as `UTC+1`, `UTC-5`, `UTC+5.5`. */
export function utcOffset(ms: number, zone: string): string {
  const w = wallClock(ms, zone);
  const local = Date.UTC(w.year!, w.month! - 1, w.day!, w.hour!, w.minute!, w.second!);
  const hours = Math.round((local - Math.floor(ms / 1000) * 1000) / 60_000) / 60;
  return `UTC${hours < 0 ? "-" : "+"}${Math.abs(hours)}`;
}

/** The account's zone, or the assumed one; prints `probe date_zone`. */
async function accountZone(http: SmokeClient, days: string[], out: Out): Promise<string> {
  const result = await http.requestWithRetry({ path: "/account" });
  const name = result.ok && isRecord(result.body) ? result.body.timezone : undefined;
  const resolved = resolveZone(name);
  const zone = resolved ?? ASSUMED_ZONE;
  const offsets = [...new Set(days.map((d) => utcOffset(Date.parse(d) + DAY_MS / 2, zone)))];
  const read = !result.ok
    ? `readable no (${failure(result.error)})`
    : typeof name !== "string"
      ? "readable no (no timezone in the body)"
      : `readable yes, resolved ${yes(resolved !== undefined)}`;
  const assumed = resolved === undefined ? `, assumed ${ASSUMED_ZONE}` : "";
  out(
    `probe date_zone: account time zone ${read}${assumed}, ${offsets.join("/")} on the probed days`,
  );
  return zone;
}

/** The local scan: `created_at` of every ticket in [start, end), and whether it covered them. */
async function scanCreated(
  http: SmokeClient,
  start: number,
  end: number,
): Promise<{
  created: number[];
  covered: boolean;
  pages: number;
  unreadable: number;
  failed?: string;
}> {
  const pages = http.paginate(
    {
      path: "/tickets",
      query: {
        per_page: 100,
        updated_since: instant(start),
        order_by: "created_at",
        order_type: "desc",
      },
    },
    { pages: DATE_SCAN_PAGES },
  );
  const created: number[] = [];
  let read = 0;
  let unreadable = 0;
  for (;;) {
    const step = await pages.next();
    if (step.done) return { created, covered: !step.value.truncated, pages: read, unreadable };
    read += 1;
    const result = step.value;
    if (!result.ok) {
      return { created, covered: false, pages: read, unreadable, failed: failure(result.error) };
    }
    if (!Array.isArray(result.body)) {
      return { created, covered: false, pages: read, unreadable, failed: "not a list" };
    }
    let passed = false;
    for (const item of result.body) {
      const time = isRecord(item) ? Date.parse(String(item.created_at)) : Number.NaN;
      if (Number.isNaN(time)) unreadable += 1;
      else if (time < start) passed = true;
      else if (time < end) created.push(time);
    }
    // Newest first: a ticket created before the window means the rest are too.
    if (passed) return { created, covered: true, pages: read, unreadable };
  }
}

/** One day query's exact search total; prints `probe date_search`. */
async function dayTotal(
  http: SmokeClient,
  d: string,
  q: DayQuery,
  out: Out,
): Promise<number | undefined> {
  const name = `probe date_search ${d} ${q.label}`;
  const result = await http.requestWithRetry({ ...search(q.query(d)), method: "GET" });
  if (!result.ok) {
    out(`${name}: ${failure(result.error)}`);
    return undefined;
  }
  const total =
    isRecord(result.body) &&
    typeof result.body.total === "number" &&
    Number.isSafeInteger(result.body.total) &&
    result.body.total >= 0
      ? result.body.total
      : undefined;
  out(`${name}: total ${total ?? "?"}, credits ${credits(result.headers)}`);
  return total;
}

function readingText(reading: DateReading): string {
  return `> ${reading.gt}, < ${reading.lt}, ${reading.day} day`;
}

/** The date probes, one line each to `out`. Returns 0 when the run finished. */
export async function runDateProbes(
  http: SmokeClient,
  out: Out,
  now = Date.now(),
): Promise<number> {
  out(
    "date probes: GET only; probed dates, counts, the zone's UTC offset and yes/no, no names or ids. Keep this output in docs/private/account-facts.md (gitignored); copy only these lines into tracked files.",
  );
  const days = probeDays(now);
  out(
    `date probes: D = ${days.join(", ")} (Tuesdays to Thursdays, UTC; D+1 over two days before today)`,
  );
  const zone = await accountZone(http, days, out);

  // Two days of margin on each side: the zone's days are inside the window for any offset.
  const start = Date.parse(shift(days.at(-1)!, -2));
  const end = Date.parse(shift(days[0]!, 3));
  const scan = await scanCreated(http, start, end);
  const probed = new Set(days.flatMap((d) => [shift(d, -1), d, shift(d, 1)]));
  const tickets = scan.created.map((time) => ({ UTC: day(time), zone: zoneDay(time, zone) }));
  const split = tickets.filter(
    (t) => (probed.has(t.UTC) || probed.has(t.zone)) && t.UTC !== t.zone,
  ).length;
  out(
    `probe date_scan: ${scan.failed === undefined ? "" : `${scan.failed}, `}list pages ${scan.pages} (cap ${DATE_SCAN_PAGES}), window covered ${yes(scan.covered)}, tickets created in the window ${tickets.length}, unreadable created_at ${scan.unreadable}, on a different day in UTC and in the zone ${split}`,
  );

  const count = (dayOf: DayOf, target: string) => tickets.filter((t) => t[dayOf] === target).length;
  const totals: { d: string; q: DayQuery; total: number }[] = [];
  for (const d of days) {
    const per = (dayOf: DayOf) =>
      `D-1 ${count(dayOf, shift(d, -1))}, D ${count(dayOf, d)}, D+1 ${count(dayOf, shift(d, 1))}`;
    out(`probe date_local ${d}: created per UTC day ${per("UTC")}; per zone day ${per("zone")}`);
    for (const q of DAY_QUERIES) {
      const total = await dayTotal(http, d, q, out);
      if (total !== undefined) totals.push({ d, q, total });
    }
  }

  if (!scan.covered || totals.length === 0) {
    out(
      `probe date_verdict: not judged (${scan.covered ? "no search total" : "the scan did not cover the window"})`,
    );
  } else {
    const predicts = (reading: DateReading) =>
      totals.every(
        ({ d, q, total }) =>
          tickets.filter((t) => q.keeps(t[reading.day], d, reading)).length === total,
      );
    const matching = READINGS.filter(predicts);
    out(
      `probe date_verdict: ${matching.length} of ${READINGS.length} readings predict all ${totals.length} totals${matching.length === 0 ? "" : `: ${matching.map(readingText).join("; ")}`}`,
    );
  }
  out("date probes: done");
  return 0;
}

export type Mode = "report" | "probes" | "dates" | "core";

/**
 * Loads the configuration from `env` as the server does and runs the report
 * (or, in `probes` mode, T-022's probes; in `dates` mode, T-055's; in `core`
 * mode, T-039's run of every `core` tool, with `options`).
 * A configuration that cannot be loaded prints one fixed line: its message
 * may quote the team file's path. Any other error is thrown.
 */
export async function smoke(
  env: NodeJS.ProcessEnv,
  dispatcher: Dispatcher,
  out: Out,
  mode: Mode = "report",
  options: CoreOptions = {},
): Promise<number> {
  if (env.FRESHDESK_HOST_OVERRIDE) {
    out(
      "config: fail (FRESHDESK_HOST_OVERRIDE is set: the smoke run is for the real account only)",
    );
    return 1;
  }
  const days = parseDays(options.days);
  if (mode === "core" && days === undefined) {
    out(`config: fail (--days takes a whole number of days, 1 to 366)`);
    return 1;
  }
  // In core mode every request is counted at the dispatcher, retries included.
  let requests = 0;
  const sending =
    mode === "core"
      ? dispatcher.compose((dispatch) => (opts, handler) => {
          requests += 1;
          return dispatch(opts, handler);
        })
      : dispatcher;
  let config: Config;
  let http: SmokeClient;
  try {
    config = loadConfig(env);
    http = new SmokeClient({
      domain: config.domain,
      apiKey: config.apiKey,
      dispatcher: sending,
      limiter: new RateLimiter(config.team.limits),
    });
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    out("config: fail (check FRESHDESK_DOMAIN, FRESHDESK_API_KEY, FRESHDESK_MCP_CONFIG)");
    return 1;
  }
  if (mode === "core") return runCore(config, http, () => requests, out, days!, options);
  if (mode === "dates") return runDateProbes(http, out);
  return mode === "probes" ? runProbes(http, out) : runSmoke(http, out);
}

/** `smoke`, with any error it throws turned into one fixed line and exit 1. */
export async function main(
  env: NodeJS.ProcessEnv,
  dispatcher: Dispatcher,
  out: Out,
  mode: Mode = "report",
  options: CoreOptions = {},
): Promise<number> {
  try {
    return await smoke(env, dispatcher, out, mode, options);
  } catch {
    out("smoke: fail (unexpected error)");
    return 1;
  }
}
