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

/**
 * Loads the configuration from `env` as the server does and runs the report.
 * A configuration that cannot be loaded prints one fixed line: its message
 * may quote the team file's path. Any other error is thrown.
 */
export async function smoke(
  env: NodeJS.ProcessEnv,
  dispatcher: Dispatcher,
  out: Out,
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
  return runSmoke(http, out);
}

/** `smoke`, with any error it throws turned into one fixed line and exit 1. */
export async function main(
  env: NodeJS.ProcessEnv,
  dispatcher: Dispatcher,
  out: Out,
): Promise<number> {
  try {
    return await smoke(env, dispatcher, out);
  } catch {
    out("smoke: fail (unexpected error)");
    return 1;
  }
}
