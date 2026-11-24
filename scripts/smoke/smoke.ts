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
// Exit code 0 when the run finished: a refused probe is a measurement.

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
import { ConfigError, loadConfig } from "../../src/config.js";
import type { FreshdeskError } from "../../src/client/errors.js";

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
function nestedNames(fields: unknown): { top: string; last: string } | undefined {
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
  return { top: field.name, last: deepest?.name ?? field.name };
}

/** A name fit to stand in a search query unquoted; anything else is not probed. */
function queryName(name: string): boolean {
  return /^[A-Za-z0-9_]{1,64}$/.test(name);
}

/** One GET; prints `probe <name>: fail <code>` or calls `ok` with the body's list. */
async function probe(
  http: SmokeClient,
  name: string,
  request: PageRequest,
  out: Out,
  ok: (items: unknown[], body: unknown, headers: Headers) => string,
): Promise<unknown[] | undefined> {
  const result = await http.requestWithRetry({ ...request, method: "GET" });
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
  out(`probe ${name}: ${ok(items, body, result.headers)}, credits ${credits(result.headers)}`);
  return items;
}

/** `n items, next yes|no` for a list page. */
function page(items: unknown[], headers: Headers): string {
  return `${items.length} items, next ${yes(headers.get("link") !== null)}`;
}

/** `total n, over 300 yes|no, n items` for a search page. */
function searchPage(items: unknown[], body: unknown): string {
  const total = isRecord(body) && typeof body.total === "number" ? body.total : undefined;
  const totalText =
    total === undefined ? "total ?" : `total ${total}, over 300 ${yes(total > 300)}`;
  return `${totalText}, ${items.length} items`;
}

function search(query: string, extra: Record<string, string | number> = {}): PageRequest {
  return { path: "/search/tickets", query: { query: `"${query}"`, ...extra } };
}

/** The probes, one line each to `out`. Returns 0 when the run finished. */
export async function runProbes(http: SmokeClient, out: Out, now = Date.now()): Promise<number> {
  out(
    "probes: GET only; counts, yes/no and credits, no names or ids. Keep this output in docs/private/account-facts.md (gitignored); copy only these lines into tracked files.",
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
    (items, _b, h) => {
      const first = items[0];
      const stats = isRecord(first) ? first.stats : undefined;
      return `${page(items, h)}, stats ${keysPresent(stats, STATS_KEYS)}`;
    },
  );
  out(`probe list_ticket_keys: ${keysPresent(recent?.[0], TICKET_KEYS)}`);

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
  } else {
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
  out(`probe search_ticket_keys: ${keysPresent(open?.[0], TICKET_KEYS)}`);
  await probe(
    http,
    "search_include_stats",
    search("status:2", { include: "stats" }),
    out,
    (items, body) => {
      const first = items[0];
      return `${searchPage(items, body)}, stats ${keysPresent(isRecord(first) ? first.stats : undefined, STATS_KEYS)}`;
    },
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
  const nested = fields.ok ? nestedNames(fields.body) : undefined;
  if (!fields.ok) {
    out(`probe nested_field: ${failure(fields.error)}`);
  } else if (nested === undefined || !queryName(nested.top) || !queryName(nested.last)) {
    out("probe nested_field: skipped (no nested field with a plain API name)");
  } else {
    const empty = (name: string) => (items: unknown[], body: unknown) => {
      const blank = items.every((item) => {
        const custom = isRecord(item) && isRecord(item.custom_fields) ? item.custom_fields : {};
        return custom[name] === null || custom[name] === undefined || custom[name] === "";
      });
      return `${searchPage(items, body)}, all empty ${yes(blank)}`;
    };
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

export type Mode = "report" | "probes";

/**
 * Loads the configuration from `env` as the server does and runs the report
 * (or, in `probes` mode, T-022's probes).
 * A configuration that cannot be loaded prints one fixed line: its message
 * may quote the team file's path. Any other error is thrown.
 */
export async function smoke(
  env: NodeJS.ProcessEnv,
  dispatcher: Dispatcher,
  out: Out,
  mode: Mode = "report",
): Promise<number> {
  if (env.FRESHDESK_HOST_OVERRIDE) {
    out(
      "config: fail (FRESHDESK_HOST_OVERRIDE is set: the smoke run is for the real account only)",
    );
    return 1;
  }
  let http: SmokeClient;
  try {
    const config = loadConfig(env);
    http = new SmokeClient({
      domain: config.domain,
      apiKey: config.apiKey,
      dispatcher,
      limiter: new RateLimiter(config.team.limits),
    });
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    out("config: fail (check FRESHDESK_DOMAIN, FRESHDESK_API_KEY, FRESHDESK_MCP_CONFIG)");
    return 1;
  }
  return mode === "probes" ? runProbes(http, out) : runSmoke(http, out);
}

/** `smoke`, with any error it throws turned into one fixed line and exit 1. */
export async function main(
  env: NodeJS.ProcessEnv,
  dispatcher: Dispatcher,
  out: Out,
  mode: Mode = "report",
): Promise<number> {
  try {
    return await smoke(env, dispatcher, out, mode);
  } catch {
    out("smoke: fail (unexpected error)");
    return 1;
  }
}
