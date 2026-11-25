import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { types } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpClient, type HttpRequest, type PageRequest } from "../src/client/http.js";
import { RateLimiter } from "../src/client/rate-limit.js";
import { listTicketFields } from "../src/client/resources/ticket-fields.js";
import { loadConfig } from "../src/config.js";
import { createServer } from "../src/server.js";
import { createContext } from "../src/tools/context.js";
import { OPEN } from "../src/tools/format.js";
import { CORE_TOOLS } from "../src/tools/toolsets/core/index.js";
import { DATA_NOT_INSTRUCTIONS } from "../src/tools/toolsets/index.js";
import {
  choicesShape,
  type CoreOptions,
  DATE_SCAN_PAGES,
  type DateReading,
  elapsedBand,
  main,
  probeDays,
  resolveZone,
  runDateProbes,
  runProbes,
  runSmoke,
  smoke,
  SmokeClient,
  totalBand,
  utcOffset,
  zoneDay,
} from "../scripts/smoke/smoke.js";
import { agentPages, groupPages } from "./fixtures/agents-groups.js";
import { cannedFolderPages, cannedFolderView, cannedResponseView } from "./fixtures/canned.js";
import { schemaFieldsPayload } from "./fixtures/schema.js";
import {
  articlePages,
  articleView,
  categoryPages,
  folderPages,
  folderView,
  searchHits,
} from "./fixtures/solutions.js";
import { conversationPages, ticketPage, ticketView } from "./fixtures/tickets.js";
import { ticketFieldsPayload, ticketFieldsWithEntityChoices } from "./fixtures/ticket-fields.js";
import { type CallResult, listTools, open } from "./support/mcp-session.js";
import { type MockAgent, mockDispatcher } from "./support/mock-dispatcher.js";

// Invented: neither may appear in any output.
const DOMAIN = "quillmoor.freshdesk.com";
const API_KEY = "k3y-Secret-Value-123";
const ORIGIN = `https://${DOMAIN}`;
const JSON_TYPE = { "content-type": "application/json" };
/** Put in error bodies: no output may quote it. */
const CANARY = "Canary-Error-Text-5531";

const agents = agentPages.flat();
const groups = groupPages.flat();

let mock: MockAgent;
let stderr: string[];

beforeEach(() => {
  stderr = [];
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr.push(String(chunk));
    return true;
  });
  mock = mockDispatcher();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await mock.close();
});

function client(): SmokeClient {
  return new SmokeClient({
    domain: DOMAIN,
    apiKey: API_KEY,
    dispatcher: mock,
    limiter: new RateLimiter({ reserve_pct: 20, floor_pct: 5, pacing_rps: 50 }),
  });
}

function sent() {
  return mock.getCallHistory()!.calls();
}

function reply(path: string, status: number, body: unknown, times = 1) {
  mock
    .get(ORIGIN)
    .intercept({ path, method: "GET" })
    .reply(status, body as object, { headers: JSON_TYPE })
    .times(times);
}

/** The three lists, each a 200 unless `status` says otherwise. */
function account(
  fields: unknown,
  status: { fields?: number; agents?: number; groups?: number } = {},
) {
  reply("/api/v2/ticket_fields", status.fields ?? 200, fields, 2);
  reply("/api/v2/agents?per_page=100", status.agents ?? 200, agents);
  reply("/api/v2/groups?per_page=100", status.groups ?? 200, groups);
}

async function run(fields: unknown, status?: Parameters<typeof account>[1]) {
  account(fields, status);
  const lines: string[] = [];
  const code = await runSmoke(client(), (line) => lines.push(line));
  return { code, out: lines.join("\n") };
}

const WRITES = ["POST", "PUT", "DELETE", "PATCH"] as const;

describe("SmokeClient: GET only", () => {
  // PATCH is not in HttpRequest's method type: it reaches the guard through a cast.
  const write = (method: string): HttpRequest =>
    ({ method, path: "/tickets/{id}", params: { id: 1 }, body: {} }) as unknown as HttpRequest;

  function refused(result: Awaited<ReturnType<HttpClient["request"]>> | undefined) {
    expect(result?.ok).toBe(false);
    if (result?.ok !== false) return;
    expect(result.error).toMatchObject({ code: "validation", http_status: null, retryable: false });
  }

  it.each(WRITES)("%s through request: refused, nothing sent", async (method) => {
    refused(await client().request(write(method)));
    expect(sent()).toEqual([]);
    expect(stderr).toEqual([]);
  });

  it.each(WRITES)("%s through requestWithRetry: refused, nothing sent", async (method) => {
    refused(await client().requestWithRetry(write(method)));
    expect(sent()).toEqual([]);
    expect(stderr).toEqual([]);
  });

  it.each(WRITES)("%s through paginate (cast): refused, nothing sent", async (method) => {
    const pages = client().paginate({ method, path: "/tickets" } as unknown as PageRequest, {
      pages: 3,
    });
    const first = await pages.next();
    refused(first.done ? undefined : first.value);
    expect((await pages.next()).done).toBe(true);
    expect(sent()).toEqual([]);
    expect(stderr).toEqual([]);
  });

  it.each(["get", "Get", "HEAD", "OPTIONS", ""])("%j is not GET: refused", async (method) => {
    refused(await client().request(write(method)));
    expect(sent()).toEqual([]);
  });

  it("a method that reads GET once and POST after it is sent as GET", async () => {
    reply("/api/v2/tickets", 200, []);
    let reads = 0;
    const flipping = {
      path: "/tickets",
      get method() {
        reads += 1;
        return reads === 1 ? "GET" : "POST";
      },
    } as HttpRequest;
    expect((await client().request(flipping)).ok).toBe(true);
    expect(sent().map((call) => call.method)).toEqual(["GET"]);
  });

  it("GET, or no method, is sent", async () => {
    reply("/api/v2/tickets", 200, [], 2);
    expect((await client().request({ path: "/tickets" })).ok).toBe(true);
    expect((await client().requestWithRetry({ method: "GET", path: "/tickets" })).ok).toBe(true);
    expect(sent().map((call) => call.method)).toEqual(["GET", "GET"]);
  });

  it("is a frozen HttpClient with no own keys, not a Proxy", async () => {
    const smokeClient = client();
    expect(smokeClient).toBeInstanceOf(HttpClient);
    expect(types.isProxy(smokeClient)).toBe(false);
    expect(Reflect.ownKeys(smokeClient)).toEqual([]);
    expect(Object.isFrozen(smokeClient)).toBe(true);
    // No cast: `make typecheck` proves the resources take it.
    reply("/api/v2/ticket_fields", 200, ticketFieldsPayload);
    expect((await listTicketFields(smokeClient)).ok).toBe(true);
  });
});

describe("choicesShape", () => {
  it.each([
    [undefined, "none"],
    [null, "none"],
    [["A", "B"], "list(2)"],
    [{ A: 1, B: 2, C: 3 }, "name_to_id(3)"],
    [{ "2": ["Open", "Being processed"], "5": ["Closed", "Done"] }, "id_to_names(2)"],
    [{ A: ["x", "y"], B: ["z"] }, "tree(depth 2: 2/3)"],
    [{ A: { B: ["x", "y"], C: ["z"] }, D: { E: ["w"] } }, "tree(depth 3: 2/3/4)"],
    [{}, "empty_record"],
    [[], "list(0)"],
    [[1, 2], "other"],
    ["text", "other"],
    [{ A: 1, B: ["x"] }, "other"],
    [{ A: { B: { C: ["x"] } } }, "other"],
  ])("%j is %s", (choices, shape) => {
    expect(choicesShape(choices)).toBe(shape);
  });
});

describe("runSmoke: the schema report", () => {
  it("says agent, group and product carry a name → id record when they do", async () => {
    const { code, out } = await run(ticketFieldsWithEntityChoices);
    expect(code).toBe(0);
    expect(out).toContain("default default_agent: name_to_id(2)");
    expect(out).toContain("default default_group: name_to_id(3)");
    expect(out).toContain("default default_product: name_to_id(1)");
    expect(out).toContain(
      "OD-4 name_to_id choices: default_agent yes, default_group yes, default_product yes",
    );
    expect(out).toContain("ticket_fields: accepted, 8 fields");
    expect(out).toContain("smoke: ok");
  });

  it("says they carry none on the current fixture", async () => {
    const { code, out } = await run(ticketFieldsPayload);
    expect(code).toBe(0);
    expect(out).toContain(
      "OD-4 name_to_id choices: default_agent no (absent), default_group no (absent), default_product no (absent)",
    );
    expect(out).toContain("default default_status: id_to_names(2)");
    expect(out).toContain("default default_priority: name_to_id(4)");
    expect(out).toContain("custom custom_dropdown: 1 field, list(2) x1");
    expect(out).toContain("custom nested_field: 1 field, tree(depth 3: 2/3/5) x1");
    expect(out).toContain("agents: accepted, 3, complete");
    expect(out).toContain("groups: accepted, 3, complete");
  });

  it("says no when one of them has another shape", async () => {
    const fields = structuredClone(ticketFieldsWithEntityChoices) as Record<string, unknown>[];
    fields[6]!.choices = ["Harbour desk"];
    const { out } = await run(fields);
    expect(out).toContain(
      "OD-4 name_to_id choices: default_agent yes, default_group no (list(1)), default_product yes",
    );
  });

  it("prints a type it does not know the spelling of as other", async () => {
    const fields = structuredClone(ticketFieldsPayload) as Record<string, unknown>[];
    fields[3]!.type = "Quillmoor Secret Type";
    const { out } = await run(fields);
    expect(out).toContain("custom other: 1 field, list(2) x1");
    expect(out).not.toContain("Quillmoor");
  });
});

/** Every string and every id of the fixtures, labels, names, keys and choices alike. */
function accountValues(value: unknown, into = new Set<string>()): Set<string> {
  if (typeof value === "string") into.add(value);
  else if (typeof value === "number" && value >= 100) into.add(String(value));
  else if (Array.isArray(value)) for (const item of value) accountValues(item, into);
  else if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      into.add(key);
      accountValues(item, into);
    }
  }
  return into;
}

/** The field keys, the type names and the dates of the fixtures: API words, not account values. */
const API_WORDS = new Set([
  ...ticketFieldsWithEntityChoices.flatMap((field) => Object.keys(field)),
  ...ticketFieldsWithEntityChoices.map((field) => field.type),
  ...[...agents, ...groups].flatMap((item) => Object.keys(item)),
  ...Object.keys(agents[0]!.contact),
  "name",
  "label",
  "level",
  "label_in_portal",
  "2026-01-02T10:00:00Z",
]);

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("runSmoke: no account value in the output", () => {
  it("prints no label, name, id or choice of the fixtures, nor the domain or the key", async () => {
    account(ticketFieldsWithEntityChoices);
    const lines: string[] = [];
    const env = { FRESHDESK_DOMAIN: DOMAIN, FRESHDESK_API_KEY: API_KEY };
    const code = await smoke(env, mock, (line) => lines.push(line));
    expect(code).toBe(0);
    const out = [...lines, ...stderr].join("\n");
    expect(lines.length).toBeGreaterThan(5);

    const values = [...accountValues([ticketFieldsWithEntityChoices, agents, groups])].filter(
      (value) => !API_WORDS.has(value) && value.length > 1,
    );
    // A label or a choice is a word of its own: `status` within `default_status` is the type.
    const leaked = values.filter((value) =>
      new RegExp(`(?<![A-Za-z0-9_])${escape(value)}(?![A-Za-z0-9_])`).test(out),
    );
    expect(leaked).toEqual([]);
    // Small numbers (priority 1 to 4, status 2 and 5) are Freshdesk's own,
    // and a count may equal one: every id of the fixtures is 100 or more.
    for (const secret of [DOMAIN, "quillmoor", API_KEY, ORIGIN]) {
      expect(out).not.toContain(secret);
    }
  });

  it("checks against values that do occur in the fixture", () => {
    const values = accountValues(ticketFieldsWithEntityChoices);
    for (const value of ["Quill Pemberton", "70412", "Lantern desk", "Blue sprocket", "Colour"]) {
      expect(values.has(value)).toBe(true);
    }
  });
});

describe("runSmoke: failures", () => {
  it("a failure prints its error code only, exit non-zero", async () => {
    const body = { description: CANARY, errors: [{ field: CANARY, message: CANARY }] };
    const { code, out } = await run(body, { fields: 400 });
    expect(code).not.toBe(0);
    expect(out).toContain("ticket_fields: fail validation");
    expect(out).not.toContain(CANARY);
    expect(out).not.toContain("Freshdesk refused");
    expect(out).toContain("smoke: fail");
  });

  it("a 401 prints auth and no message, and the other lists still run", async () => {
    const { code, out } = await run([], { fields: 401, agents: 401, groups: 401 });
    expect(code).not.toBe(0);
    expect(out).toContain("ticket_fields: fail auth");
    expect(out).toContain("agents: fail auth");
    expect(out).toContain("groups: fail auth");
    expect(out).not.toMatch(/API key|HTTP 401/);
  });

  it("ticket fields the zod schema refuses are reported as refused, exit non-zero", async () => {
    const fields = structuredClone(ticketFieldsPayload) as Record<string, unknown>[];
    delete fields[0]!.label;
    const { code, out } = await run(fields);
    expect(code).not.toBe(0);
    expect(out).toContain("ticket_fields: refused by the schema");
    // The shape is still reported, from the raw body.
    expect(out).toContain("default default_status: id_to_names(2)");
    expect(out).toContain("smoke: fail");
  });

  it("a ticket fields body that is not a list is refused", async () => {
    const { code, out } = await run({ fields: [] });
    expect(code).not.toBe(0);
    expect(out).toContain("ticket_fields: not a list");
    expect(out).toContain("ticket_fields: refused by the schema");
  });

  it("agents and groups the zod schema refuses are reported as refused", async () => {
    reply("/api/v2/ticket_fields", 200, ticketFieldsPayload, 2);
    reply("/api/v2/agents?per_page=100", 200, [{ id: "x" }]);
    reply("/api/v2/groups?per_page=100", 200, [{ id: 1 }]);
    const lines: string[] = [];
    const code = await runSmoke(client(), (line) => lines.push(line));
    expect(code).not.toBe(0);
    expect(lines).toContain("agents: refused by the schema");
    expect(lines).toContain("groups: refused by the schema");
  });

  it("a configuration it cannot load sends nothing and prints no value", async () => {
    const lines: string[] = [];
    const env = { FRESHDESK_DOMAIN: "not-a-host", FRESHDESK_API_KEY: API_KEY };
    const code = await smoke(env, mock, (line) => lines.push(line));
    expect(code).not.toBe(0);
    expect(lines).toEqual([
      "config: fail (check FRESHDESK_DOMAIN, FRESHDESK_API_KEY, FRESHDESK_MCP_CONFIG)",
    ]);
    expect(sent()).toEqual([]);
  });

  it("a missing key: the same line, nothing sent", async () => {
    const lines: string[] = [];
    const code = await smoke({ FRESHDESK_DOMAIN: DOMAIN }, mock, (line) => lines.push(line));
    expect(code).not.toBe(0);
    expect(lines.join("\n")).not.toContain(DOMAIN);
    expect(sent()).toEqual([]);
  });

  it("refuses to start when FRESHDESK_HOST_OVERRIDE is set: nothing sent", async () => {
    const lines: string[] = [];
    const env = {
      FRESHDESK_DOMAIN: DOMAIN,
      FRESHDESK_API_KEY: API_KEY,
      FRESHDESK_HOST_OVERRIDE: "support.quillmoor.example",
    };
    const code = await smoke(env, mock, (line) => lines.push(line));
    expect(code).toBe(1);
    expect(lines).toEqual([
      "config: fail (FRESHDESK_HOST_OVERRIDE is set: the smoke run is for the real account only)",
    ]);
    expect(sent()).toEqual([]);
  });

  it("an empty FRESHDESK_HOST_OVERRIDE is unset, as for the server", async () => {
    account(ticketFieldsPayload);
    const lines: string[] = [];
    const env = {
      FRESHDESK_DOMAIN: DOMAIN,
      FRESHDESK_API_KEY: API_KEY,
      FRESHDESK_HOST_OVERRIDE: "",
    };
    expect(await smoke(env, mock, (line) => lines.push(line))).toBe(0);
  });

  it("a 2xx that is not JSON is reported as not JSON, not as a schema refusal", async () => {
    const html = (path: string, times = 1) =>
      mock
        .get(ORIGIN)
        .intercept({ path, method: "GET" })
        .reply(200, `<html>${CANARY}</html>`, { headers: { "content-type": "text/html" } })
        .times(times);
    html("/api/v2/ticket_fields");
    html("/api/v2/agents?per_page=100");
    html("/api/v2/groups?per_page=100");
    const lines: string[] = [];
    const code = await runSmoke(client(), (line) => lines.push(line));
    expect(code).toBe(1);
    expect(lines).toContain("ticket_fields: not JSON");
    expect(lines).toContain("agents: not JSON");
    expect(lines).toContain("groups: not JSON");
    expect(lines.join("\n")).not.toContain(CANARY);
  });
});

describe("main: an unexpected error", () => {
  /** An environment whose every read throws an error that is not a ConfigError. */
  const throwing = new Proxy({} as NodeJS.ProcessEnv, {
    get() {
      throw new Error(CANARY);
    },
  });

  it("smoke lets an error that is not a ConfigError through", async () => {
    await expect(smoke(throwing, mock, () => undefined)).rejects.toThrow(CANARY);
  });

  it("prints one fixed line, no message or stack, exit 1, nothing sent", async () => {
    const lines: string[] = [];
    const code = await main(throwing, mock, (line) => lines.push(line));
    expect(code).toBe(1);
    expect(lines).toEqual(["smoke: fail (unexpected error)"]);
    expect(stderr).toEqual([]);
    expect(sent()).toEqual([]);
  });

  it("passes a normal run's exit code through", async () => {
    account(ticketFieldsPayload);
    const env = { FRESHDESK_DOMAIN: DOMAIN, FRESHDESK_API_KEY: API_KEY };
    expect(await main(env, mock, () => undefined)).toBe(0);
  });
});

describe("the banner", () => {
  it("says what is printed and where the output is kept", async () => {
    const { out } = await run(ticketFieldsPayload);
    expect(out.split("\n")[0]).toBe(
      "smoke: GET only; shapes and counts, no names or ids. Keep this output in docs/private/account-facts.md (gitignored); copy only shape lines into tracked files.",
    );
  });
});

// ---------------------------------------------------------------------------
// T-022's probes. Every ticket value below is invented and must not appear in
// the output: subjects, names, ids (all 100 or more), tags, custom field names
// and values.

const NOW = Date.parse("2026-11-24T12:00:00Z");

const tickets = [
  {
    id: 90311,
    subject: "Quillmoor sprocket jammed",
    status: 2,
    priority: 3,
    requester_id: 80455,
    company_id: 60771,
    responder_id: 70411,
    group_id: 70421,
    tags: ["lantern-tag"],
    fr_due_by: "2026-11-25T10:00:00Z",
    due_by: "2026-11-27T10:00:00Z",
    fr_escalated: false,
    is_escalated: false,
    created_at: "2026-11-20T09:00:00Z",
    custom_fields: { cf_colour: "Amber", cf_kit: "Gadgets", cf_family: null, cf_model: null },
    stats: {
      first_responded_at: "2026-11-20T10:00:00Z",
      agent_responded_at: "2026-11-20T10:00:00Z",
      requester_responded_at: null,
      resolved_at: null,
      closed_at: null,
    },
  },
  {
    id: 90312,
    subject: "Orrery widget squeaks",
    status: 3,
    priority: 1,
    requester_id: 80456,
    tags: [],
    created_at: "2026-08-01T09:00:00Z",
    custom_fields: { cf_colour: "Teal", cf_kit: null, cf_family: null, cf_model: null },
  },
];

/** `raw`: the body is sent as written, as text/html, not as JSON. */
type Route = { status: number; body: unknown; headers?: Record<string, string>; raw?: true };

/**
 * Answers every request, whatever its method, from `route`, so a request the
 * probes should not send is recorded, not refused by the mock.
 */
function serve(route: (path: string) => Route) {
  mock
    .get(ORIGIN)
    .intercept({ path: () => true, method: () => true })
    .reply(({ path }) => {
      const { status, body, headers, raw } = route(path);
      return {
        statusCode: status,
        data: raw ? String(body) : JSON.stringify(body),
        responseOptions: {
          headers: { ...(raw ? { "content-type": "text/html" } : JSON_TYPE), ...headers },
        },
      };
    })
    .persist();
}

/** A healthy account: lists, search pages and the ticket fields. */
function healthy(path: string): Route {
  const credits = { "x-ratelimit-used-currentrequest": path.includes("include=stats") ? "3" : "1" };
  if (path.startsWith("/api/v2/ticket_fields")) return { status: 200, body: ticketFieldsPayload };
  if (path.startsWith("/api/v2/search/tickets")) {
    if (path.includes("page=11")) {
      return { status: 400, body: { description: CANARY, errors: [{ message: CANARY }] } };
    }
    return { status: 200, body: { total: 412, results: tickets }, headers: credits };
  }
  if (path.includes("/conversations")) return { status: 200, body: [], headers: credits };
  if (/^\/api\/v2\/tickets\/\d+\?/.test(path)) {
    return { status: 200, body: tickets[0], headers: credits };
  }
  return { status: 200, body: tickets, headers: credits };
}

/** A clock that moves 3 s at every read: each timed probe takes 3 s. */
function steppingClock(stepMs = 3_000): () => number {
  let t = 0;
  return () => (t += stepMs);
}

async function probes(route: (path: string) => Route = healthy, clock = steppingClock()) {
  serve(route);
  const lines: string[] = [];
  const code = await runProbes(client(), (line) => lines.push(line), NOW, clock);
  return { code, lines, out: lines.join("\n") };
}

function paths(): string[] {
  return sent().map((call) => call.fullUrl.slice(ORIGIN.length));
}

describe("runProbes: what they ask and print", () => {
  it("prints one line per probe, counts and yes/no only, exit 0", async () => {
    const { code, lines } = await probes();
    expect(code).toBe(0);
    expect(lines[0]).toMatch(/^probes: GET only;/);
    expect(lines).toContain(
      "probe list_default: 2 items, next no, created over 31 days ago 1, credits 1",
    );
    expect(lines).toContain(
      "probe list_status_param: 2 items, next no, all status 2 no, credits 1",
    );
    expect(lines).toContain(
      "probe list_include_stats: 2 items, next no, stats first_responded_at yes, agent_responded_at yes, requester_responded_at yes, status_updated_at no, pending_since no, resolved_at yes, closed_at yes, reopened_at no, credits 3",
    );
    expect(lines).toContain(
      "probe view_include_stats: stats first_responded_at yes, agent_responded_at yes, requester_responded_at yes, status_updated_at no, pending_since no, resolved_at yes, closed_at yes, reopened_at no, credits 3",
    );
    expect(lines).toContain("probe search_cap_page_1: total >300, 2 items, credits 1");
    expect(lines).toContain("probe search_cap_page_11: fail validation");
    expect(lines).toContain(
      "probe search_null_nested_last: total >300, 2 items, all empty yes, credits 1",
    );
    expect(lines).toContain(
      "probe search_null_nested_top: total >300, 2 items, all empty no, credits 1",
    );
    expect(lines.at(-1)).toBe("probes: done");
  });

  it("sends GET only", async () => {
    await probes();
    expect(sent().length).toBeGreaterThan(10);
    expect(new Set(sent().map((call) => call.method))).toEqual(new Set(["GET"]));
  });

  it("asks what each line says it asks", async () => {
    await probes();
    const sentPaths = paths();
    const has = (fragment: string) => sentPaths.some((path) => path.includes(fragment));
    expect(has("updated_since=2025-11-24T12%3A00%3A00Z")).toBe(true);
    expect(has("requester_id=80455&updated_since=2000-01-01T00%3A00%3A00Z")).toBe(true);
    expect(has("/api/v2/tickets/90311/conversations?per_page=100")).toBe(true);
    expect(sentPaths.filter((path) => path === "/api/v2/tickets/90311?include=stats")).toHaveLength(
      1,
    );
    // The nested field's last level, then its top, asked as empty.
    expect(has(encodeURIComponent('"cf_model:null"').replace(/%20/g, "+"))).toBe(true);
    expect(has(encodeURIComponent('"cf_kit:null"').replace(/%20/g, "+"))).toBe(true);
    expect(has("page=10")).toBe(true);
    expect(has("page=11")).toBe(true);
  });

  it("prints no subject, name, id, tag or custom field of the fixtures, nor the domain or the key", async () => {
    serve(healthy);
    const lines: string[] = [];
    const env = { FRESHDESK_DOMAIN: DOMAIN, FRESHDESK_API_KEY: API_KEY };
    expect(await smoke(env, mock, (line) => lines.push(line), "probes")).toBe(0);
    const out = [...lines, ...stderr].join("\n");
    // Ticket keys and stats keys are API words the probes print by a fixed list.
    const apiWords = new Set([
      ...tickets.flatMap((ticket) => Object.keys(ticket)),
      ...Object.keys(tickets[0]!.stats!),
      ...API_WORDS,
    ]);
    const values = [...accountValues([tickets, ticketFieldsPayload])].filter(
      (value) => !apiWords.has(value) && value.length > 1,
    );
    const leaked = values.filter((value) =>
      new RegExp(`(?<![A-Za-z0-9_])${escape(value)}(?![A-Za-z0-9_])`).test(out),
    );
    expect(leaked).toEqual([]);
    for (const value of ["cf_model", "cf_kit", "90311", "80455", "Quillmoor sprocket jammed"]) {
      expect(values).toContain(value);
    }
    for (const secret of [DOMAIN, "quillmoor", API_KEY, ORIGIN]) {
      expect(out.toLowerCase()).not.toContain(secret.toLowerCase());
    }
  });
});

describe("runProbes: failures", () => {
  it("a failed probe prints its error code only", async () => {
    const { code, lines, out } = await probes(() => ({
      status: 400,
      body: { description: CANARY, errors: [{ field: CANARY, message: CANARY }] },
    }));
    expect(code).toBe(0);
    expect(lines).toContain("probe list_default: fail validation");
    expect(lines).toContain("probe search_status_open: fail validation");
    expect(lines).toContain("probe nested_field: fail validation");
    expect(out).not.toContain(CANARY);
    expect(out).not.toContain("Freshdesk refused");
    // Every probe that sent a request printed its code and nothing else.
    const sentLines = lines.filter(
      (line) => line.startsWith("probe ") && !/_ticket_keys: |: skipped \(/.test(line),
    );
    expect(sentLines.length).toBeGreaterThan(5);
    expect(sentLines.filter((line) => !/^probe [a-z0-9_]+: fail validation$/.test(line))).toEqual(
      [],
    );
  });

  it("a 401 prints auth; a 2xx not JSON, and a JSON body not a list, say so", async () => {
    const { lines, out } = await probes((path) => {
      if (path.startsWith("/api/v2/tickets?per_page=100&updated_since")) {
        return { status: 200, body: `<html>${CANARY}</html>`, raw: true };
      }
      if (path.startsWith("/api/v2/search")) return { status: 200, body: { note: CANARY } };
      return { status: 401, body: { message: CANARY } };
    });
    expect(lines).toContain("probe list_default: fail auth");
    expect(lines).toContain("probe list_updated_since_365d: not JSON");
    expect(lines).toContain("probe search_status_open: not a list, credits ?");
    expect(out).not.toContain(CANARY);
  });

  it("with no recent ticket, the requester and conversation probes are skipped", async () => {
    const { lines } = await probes((path) =>
      path.startsWith("/api/v2/ticket_fields")
        ? { status: 200, body: ticketFieldsPayload }
        : path.startsWith("/api/v2/search")
          ? { status: 200, body: { total: 0, results: [] } }
          : { status: 200, body: [] },
    );
    expect(lines).toContain("probe list_requester: skipped (no ticket in the last 30 days)");
    expect(lines).toContain(
      "probe conversations_per_page_100: skipped (no ticket in the last 30 days)",
    );
    expect(lines).toContain("probe view_include_stats: skipped (no ticket in the last 30 days)");
    expect(paths().some((path) => path.includes("requester_id"))).toBe(false);
    expect(paths().some((path) => /\/tickets\/\d/.test(path))).toBe(false);
  });

  it.each([
    ["a failure prints its code", { status: 404, body: { message: CANARY } }, "fail not_found"],
    [
      "a body that is no ticket says so",
      { status: 200, body: [CANARY] },
      "not a ticket, credits ?",
    ],
    [
      "a ticket without stats is no for every key",
      { status: 200, body: { id: 90311, subject: CANARY } },
      "stats first_responded_at no, agent_responded_at no, requester_responded_at no, status_updated_at no, pending_since no, resolved_at no, closed_at no, reopened_at no, credits ?",
    ],
  ])("the one-ticket view: %s", async (_, route, line) => {
    const { lines, out } = await probes((path) =>
      /^\/api\/v2\/tickets\/\d+\?/.test(path) ? route : healthy(path),
    );
    expect(lines).toContain(`probe view_include_stats: ${line}`);
    expect(out).not.toContain(CANARY);
  });

  it("with no nested field, the null probes are skipped", async () => {
    const { lines } = await probes((path) =>
      path.startsWith("/api/v2/ticket_fields")
        ? { status: 200, body: ticketFieldsPayload.slice(0, 4) }
        : healthy(path),
    );
    expect(lines).toContain("probe nested_field: skipped (no nested field with a plain API name)");
    expect(paths().some((path) => /cf_kit|cf_model|cf_family/.test(path))).toBe(false);
  });

  it("a nested field name unfit for a query is not sent", async () => {
    const fields = structuredClone(ticketFieldsPayload) as Record<string, unknown>[];
    fields[4]!.nested_ticket_fields = [{ name: "cf model) OR (x", level: 3 }];
    const { lines } = await probes((path) =>
      path.startsWith("/api/v2/ticket_fields") ? { status: 200, body: fields } : healthy(path),
    );
    expect(lines).toContain("probe nested_field: skipped (no nested field with a plain API name)");
    expect(paths().some((path) => /cf_kit|cf_model|cf_family/.test(path))).toBe(false);
  });
});

describe("main: the probes mode", () => {
  it("runs the probes, not the report", async () => {
    serve(healthy);
    const lines: string[] = [];
    const env = { FRESHDESK_DOMAIN: DOMAIN, FRESHDESK_API_KEY: API_KEY };
    expect(await main(env, mock, (line) => lines.push(line), "probes")).toBe(0);
    expect(lines[0]).toMatch(/^probes: /);
    expect(lines.some((line) => line.startsWith("OD-4"))).toBe(false);
  });
});

describe("runProbes: control probes (review of 2026-11-24)", () => {
  it("asks spaced queries on documented fields, spaces sent as +", async () => {
    const { lines } = await probes();
    expect(lines).toContain("probe search_spaced_or: total >300, 2 items, credits 1");
    expect(lines).toContain("probe search_spaced_and: total >300, 2 items, credits 1");
    const sentPaths = paths();
    expect(sentPaths.some((path) => path.includes("%22status%3A2+OR+status%3A3%22"))).toBe(true);
    expect(sentPaths.some((path) => path.includes("%22status%3A2+AND+priority%3A1%22"))).toBe(true);
  });

  it("asks the nested top level for one of its own values, and never prints it", async () => {
    const { lines, out } = await probes();
    expect(lines).toContain(
      "probe search_nested_top_value: total >300, 2 items, all match no, credits 1",
    );
    expect(paths().some((path) => path.includes("%22cf_kit%3A%27Gadgets%27%22"))).toBe(true);
    expect(out).not.toContain("Gadgets");
    expect(out).not.toContain("cf_kit");
  });

  it("asks a plain custom dropdown for null, as a control", async () => {
    const { lines } = await probes();
    expect(lines).toContain(
      "probe search_null_dropdown: total >300, 2 items, all empty no, credits 1",
    );
    expect(paths().some((path) => path.includes("%22cf_colour%3Anull%22"))).toBe(true);
  });

  it("skips the dropdown control when there is no custom dropdown", async () => {
    const fields = ticketFieldsPayload.filter((field) => field.type !== "custom_dropdown");
    const { lines } = await probes((path) =>
      path.startsWith("/api/v2/ticket_fields") ? { status: 200, body: fields } : healthy(path),
    );
    expect(lines).toContain(
      "probe search_null_dropdown: skipped (no custom dropdown with a plain API name)",
    );
    expect(paths().some((path) => path.includes("cf_colour"))).toBe(false);
  });

  it("skips the nested value control when the value is unfit for a query", async () => {
    const fields = structuredClone(ticketFieldsPayload) as Record<string, unknown>[];
    fields[4]!.choices = { "Gad'gets) OR (x": { A: ["b"] } };
    const { lines } = await probes((path) =>
      path.startsWith("/api/v2/ticket_fields") ? { status: 200, body: fields } : healthy(path),
    );
    expect(lines).toContain(
      "probe search_nested_top_value: skipped (no top-level choice fit for a query)",
    );
    expect(paths().some((path) => path.includes("Gad"))).toBe(false);
    // The null probes still run.
    expect(lines.some((line) => line.startsWith("probe search_null_nested_last: total"))).toBe(
      true,
    );
  });

  it("times the deep page in both orders, as a band", async () => {
    const { lines } = await probes();
    expect(lines).toContain(
      "probe list_updated_since_365d: 2 items, next no, created over 31 days ago 1, elapsed 2-5s, credits 1",
    );
    expect(lines).toContain(
      "probe list_updated_since_365d_default_order: 2 items, next no, created over 31 days ago 1, elapsed 2-5s, credits 1",
    );
    const deep = paths().filter((path) => path.includes("updated_since=2025-11-24"));
    expect(deep.some((path) => path.includes("order_by=created_at&order_type=asc"))).toBe(true);
    expect(deep.some((path) => !path.includes("order_by"))).toBe(true);
    // Only the two deep pages are timed.
    expect(lines.filter((line) => line.includes("elapsed"))).toHaveLength(2);
  });

  it.each([
    [0, "<2s"],
    [1_999, "<2s"],
    [2_000, "2-5s"],
    [4_999, "2-5s"],
    [5_000, "5-10s"],
    [10_000, "5-10s"],
    [10_001, ">10s"],
  ])("elapsedBand(%d) is %s", (ms, band) => {
    expect(elapsedBand(ms)).toBe(band);
  });

  it.each([
    [0, "0"],
    [1, "1-300"],
    [300, "1-300"],
    [301, ">300"],
  ])("totalBand(%d) is %s", (total, band) => {
    expect(totalBand(total)).toBe(band);
  });

  it("prints a total as a band, never its figure", async () => {
    const { out } = await probes();
    expect(out).not.toContain("412");
  });

  it("key lines say skipped when their source failed or was empty", async () => {
    const { lines } = await probes((path) =>
      path.startsWith("/api/v2/search")
        ? { status: 200, body: { total: 0, results: [] } }
        : path.startsWith("/api/v2/ticket_fields")
          ? { status: 200, body: ticketFieldsPayload }
          : { status: 400, body: { description: CANARY } },
    );
    expect(lines).toContain("probe list_ticket_keys: skipped (no item)");
    expect(lines).toContain("probe search_ticket_keys: skipped (no item)");
    expect(lines).toContain(
      "probe search_include_stats: total 0, 0 items, stats skipped (no item), credits ?",
    );
  });
});

// ---------------------------------------------------------------------------
// T-055's date probes. NOW is Tuesday 2026-11-24: the probed days are
// 2026-11-19, 18 and 17, the scan window 2026-11-15 to 2026-11-22 (UTC).
// Ticket ids, subjects and the account's name and zone are invented and must
// not appear in the output.

const HOUR_MS = 3_600_000;

/** Newest first, as the list sends them with `order_type=desc`. */
const dated = [
  { id: 91001, subject: "Ledgerline crank", created_at: "2026-11-23T10:00:00Z" }, // after the window
  { id: 91002, subject: "Ledgerline crank", created_at: "2026-11-21T10:00:00Z" },
  { id: 91003, subject: "Ledgerline crank", created_at: "2026-11-20T09:00:00Z" },
  { id: 91004, subject: "Ledgerline crank", created_at: "2026-11-19T10:00:00Z" },
  { id: 91005, subject: "Ledgerline crank", created_at: "2026-11-18T23:30:00Z" }, // 19 in Rome
  { id: 91006, subject: "Ledgerline crank", created_at: "2026-11-18T08:00:00Z" },
  { id: 91007, subject: "Ledgerline crank", created_at: "2026-11-17T12:00:00Z" },
  { id: 91008, subject: "Ledgerline crank", created_at: "2026-11-16T23:10:00Z" }, // 17 in Rome
  { id: 91009, subject: "Ledgerline crank", created_at: "2026-11-10T10:00:00Z" }, // before it
];

/** A day, UTC or Rome's (UTC+1 in November), computed apart from the code under test. */
function dayIn(created: string, rome: boolean): string {
  return new Date(Date.parse(created) + (rome ? HOUR_MS : 0)).toISOString().slice(0, 10);
}

/** A search that counts `dated` under `reading`, Rome being the account's zone. */
function searchUnder(reading: DateReading, path: string): Route {
  const text = decodeURIComponent(path.replace(/\+/g, " "));
  const eq = /created_at:'(\d{4}-\d\d-\d\d)'/.exec(text)?.[1];
  const gt = /created_at:>'(\d{4}-\d\d-\d\d)'/.exec(text)?.[1];
  const lt = /created_at:<'(\d{4}-\d\d-\d\d)'/.exec(text)?.[1];
  const total = dated.filter(({ created_at }) => {
    const d = dayIn(created_at, reading.day === "zone");
    if (eq !== undefined) return d === eq;
    const afterOk = reading.gt === "exclusive" ? d > gt! : d >= gt!;
    const beforeOk = reading.lt === "exclusive" ? d < lt! : d <= lt!;
    return afterOk && beforeOk;
  }).length;
  return {
    status: 200,
    body: { total, results: [] },
    headers: { "x-ratelimit-used-currentrequest": "1" },
  };
}

const ACCOUNT = {
  account_name: "Ledgerline Widgets",
  account_domain: DOMAIN,
  timezone: "Rome",
  contact_person: { name: "Orla Vantree", email: "orla@ledgerline.example" },
};

function dateAccount(
  reading: DateReading = { gt: "exclusive", lt: "exclusive", day: "zone" },
  overrides: { account?: Route; tickets?: Route } = {},
) {
  return (path: string): Route => {
    if (path.startsWith("/api/v2/account"))
      return overrides.account ?? { status: 200, body: ACCOUNT };
    if (path.startsWith("/api/v2/tickets"))
      return overrides.tickets ?? { status: 200, body: dated };
    if (path.startsWith("/api/v2/search/tickets")) return searchUnder(reading, path);
    return { status: 404, body: { message: CANARY } };
  };
}

async function dateProbes(route: (path: string) => Route = dateAccount()) {
  serve(route);
  const lines: string[] = [];
  const code = await runDateProbes(client(), (line) => lines.push(line), NOW);
  return { code, lines, out: lines.join("\n") };
}

describe("probeDays", () => {
  it.each([
    ["2026-11-24T12:00:00Z", ["2026-11-19", "2026-11-18", "2026-11-17"]], // Tuesday
    ["2026-11-26T00:00:00Z", ["2026-11-19", "2026-11-18", "2026-11-17"]], // Thursday
    ["2026-11-28T23:59:59Z", ["2026-11-25", "2026-11-24", "2026-11-19"]], // Saturday
  ])(
    "from %s: the latest Tuesdays to Thursdays whose next day ended two days before",
    (now, days) => {
      expect(probeDays(Date.parse(now))).toEqual(days);
    },
  );

  it("takes as many days as asked", () => {
    expect(probeDays(NOW, 1)).toEqual(["2026-11-19"]);
  });
});

describe("the date probes' zone helpers", () => {
  it.each([
    ["Rome", "Europe/Rome"],
    ["Europe/Rome", "Europe/Rome"],
    ["UTC", "UTC"],
    ["New York", "America/New_York"],
    ["Kolkata", "Asia/Kolkata"],
  ])("resolves %s to %s", (name, zone) => {
    expect(resolveZone(name)).toBe(zone);
  });

  it.each([
    ["Eastern Time (US & Canada)"],
    ["Nowhere Town"],
    ["../etc/passwd"],
    [""],
    [42],
    [null],
  ])("does not resolve %j", (name) => {
    expect(resolveZone(name)).toBeUndefined();
  });

  it.each([
    ["2026-11-19T12:00:00Z", "Europe/Rome", "UTC+1"],
    ["2026-07-01T12:00:00Z", "Europe/Rome", "UTC+2"],
    ["2026-11-19T12:00:00Z", "America/New_York", "UTC-5"],
    ["2026-11-19T12:00:00Z", "Asia/Kolkata", "UTC+5.5"],
    ["2026-11-19T12:00:00Z", "UTC", "UTC+0"],
  ])("the offset at %s in %s is %s", (at, zone, offset) => {
    expect(utcOffset(Date.parse(at), zone)).toBe(offset);
  });

  it("takes a ticket's day in the zone, across midnight both ways", () => {
    expect(zoneDay(Date.parse("2026-11-18T23:30:00Z"), "Europe/Rome")).toBe("2026-11-19");
    expect(zoneDay(Date.parse("2026-11-18T22:59:59Z"), "Europe/Rome")).toBe("2026-11-18");
    expect(zoneDay(Date.parse("2026-11-19T03:00:00Z"), "America/New_York")).toBe("2026-11-18");
  });
});

describe("runDateProbes", () => {
  it("prints the zone, the scan, the local counts, the totals and the verdict, exit 0", async () => {
    const { code, lines } = await dateProbes();
    expect(code).toBe(0);
    expect(lines[0]).toMatch(/^date probes: GET only;/);
    expect(lines).toContain(
      "date probes: D = 2026-11-19, 2026-11-18, 2026-11-17 (Tuesdays to Thursdays, UTC; D+1 over two days before today)",
    );
    expect(lines).toContain(
      "probe date_zone: account time zone readable yes, resolved yes, UTC+1 on the probed days",
    );
    expect(lines).toContain(
      `probe date_scan: list pages 1 (cap ${DATE_SCAN_PAGES}), window covered yes, tickets created in the window 7, unreadable created_at 0, on a different day in UTC and in the zone 2`,
    );
    expect(lines).toContain(
      "probe date_local 2026-11-19: created per UTC day D-1 2, D 1, D+1 1; per zone day D-1 1, D 2, D+1 1",
    );
    expect(lines).toContain("probe date_search 2026-11-19 created_at:'D': total 2, credits 1");
    expect(lines).toContain(
      "probe date_search 2026-11-19 created_at:>'D-1' AND created_at:<'D+1': total 2, credits 1",
    );
    expect(lines).toContain(
      "probe date_search 2026-11-19 created_at:>'D' AND created_at:<'D': total 0, credits 1",
    );
    expect(lines.filter((line) => line.startsWith("probe date_search "))).toHaveLength(15);
    expect(lines).toContain(
      "probe date_verdict: 1 of 8 readings predict all 15 totals: > exclusive, < exclusive, zone day",
    );
    expect(lines.at(-1)).toBe("date probes: done");
  });

  // All eight, the measured one (inclusive, inclusive, UTC) among them.
  it.each<DateReading>(
    (["exclusive", "inclusive"] as const).flatMap((gt) =>
      (["exclusive", "inclusive"] as const).flatMap((lt) =>
        (["UTC", "zone"] as const).map((day) => ({ gt, lt, day })),
      ),
    ),
  )("names the one reading a search under %j agrees with", async (reading) => {
    const { lines } = await dateProbes(dateAccount(reading));
    const day = `${reading.day} day`;
    expect(lines).toContain(
      `probe date_verdict: 1 of 8 readings predict all 15 totals: > ${reading.gt}, < ${reading.lt}, ${day}`,
    );
  });

  it("lists every reading the totals cannot tell apart", async () => {
    // No ticket near midnight: UTC and zone days agree everywhere.
    const noon = dated.filter((t) => t.id !== 91005 && t.id !== 91008);
    const { lines } = await dateProbes((path) =>
      path.startsWith("/api/v2/search")
        ? searchUnderTickets(noon, path)
        : dateAccount(undefined, { tickets: { status: 200, body: noon } })(path),
    );
    expect(lines).toContain(
      "probe date_verdict: 2 of 8 readings predict all 15 totals: > exclusive, < exclusive, UTC day; > exclusive, < exclusive, zone day",
    );
    expect(lines.some((line) => line.endsWith("on a different day in UTC and in the zone 0"))).toBe(
      true,
    );
  });

  it("says none when no reading predicts the totals", async () => {
    const { lines } = await dateProbes((path) =>
      path.startsWith("/api/v2/search")
        ? { status: 200, body: { total: 99, results: [] } }
        : dateAccount()(path),
    );
    expect(lines).toContain("probe date_verdict: 0 of 8 readings predict all 15 totals");
  });

  it("asks the account, the list window newest first, and each day query", async () => {
    await dateProbes();
    const sentPaths = paths();
    expect(new Set(sent().map((call) => call.method))).toEqual(new Set(["GET"]));
    expect(sentPaths).toContain("/api/v2/account");
    expect(sentPaths).toContain(
      "/api/v2/tickets?per_page=100&updated_since=2026-11-15T00%3A00%3A00Z&order_by=created_at&order_type=desc",
    );
    const asked = (query: string) =>
      sentPaths.includes(
        `/api/v2/search/tickets?query=${encodeURIComponent(`"${query}"`).replace(/%20/g, "+").replace(/'/g, "%27")}`,
      );
    expect(asked("created_at:'2026-11-17'")).toBe(true);
    expect(asked("created_at:>'2026-11-18' AND created_at:<'2026-11-20'")).toBe(true);
    expect(asked("created_at:>'2026-11-18' AND created_at:<'2026-11-19'")).toBe(true);
    expect(asked("created_at:>'2026-11-19' AND created_at:<'2026-11-20'")).toBe(true);
    expect(asked("created_at:>'2026-11-19' AND created_at:<'2026-11-19'")).toBe(true);
    expect(sentPaths.filter((path) => path.startsWith("/api/v2/search"))).toHaveLength(15);
  });

  it("prints no id, subject, account name, zone name, domain or key", async () => {
    const account = { ...ACCOUNT, timezone: "Tokyo" };
    serve(dateAccount(undefined, { account: { status: 200, body: account } }));
    const lines: string[] = [];
    const env = { FRESHDESK_DOMAIN: DOMAIN, FRESHDESK_API_KEY: API_KEY };
    expect(await main(env, mock, (line) => lines.push(line), "dates")).toBe(0);
    const out = [...lines, ...stderr].join("\n");
    expect(lines).toContain(
      "probe date_zone: account time zone readable yes, resolved yes, UTC+9 on the probed days",
    );
    for (const value of [
      ...dated.map((t) => String(t.id)),
      "Ledgerline",
      "Orla",
      "orla@",
      "Tokyo",
      "Asia/",
      "quillmoor",
      API_KEY,
    ]) {
      expect(out.toLowerCase()).not.toContain(value.toLowerCase());
    }
  });

  it.each([
    [
      "a refused account read",
      { status: 403, body: { message: CANARY } },
      "readable no (fail forbidden), assumed Europe/Rome",
    ],
    [
      "a body with no timezone",
      { status: 200, body: { account_name: CANARY } },
      "readable no (no timezone in the body), assumed Europe/Rome",
    ],
    [
      "a zone name that does not resolve",
      { status: 200, body: { timezone: "Eastern Time (US & Canada)" } },
      "readable yes, resolved no, assumed Europe/Rome",
    ],
  ])("%s: says so and assumes Europe/Rome", async (_, account, text) => {
    const { lines, out } = await dateProbes(dateAccount(undefined, { account }));
    expect(lines).toContain(`probe date_zone: account time zone ${text}, UTC+1 on the probed days`);
    expect(out).not.toContain(CANARY);
    expect(out).not.toContain("Eastern");
    // Rome is what the fake search uses: the verdict still finds it.
    expect(lines.some((line) => line.endsWith("> exclusive, < exclusive, zone day"))).toBe(true);
  });

  it("a scan cut at the page cap is not judged", async () => {
    const inside = dated.slice(1, 8);
    const { lines } = await dateProbes(
      dateAccount(undefined, {
        tickets: {
          status: 200,
          body: inside,
          headers: { link: `<${ORIGIN}/api/v2/tickets?per_page=100&page=2>; rel="next"` },
        },
      }),
    );
    expect(lines).toContain(
      `probe date_scan: list pages ${DATE_SCAN_PAGES} (cap ${DATE_SCAN_PAGES}), window covered no, tickets created in the window ${inside.length * DATE_SCAN_PAGES}, unreadable created_at 0, on a different day in UTC and in the zone ${2 * DATE_SCAN_PAGES}`,
    );
    expect(lines).toContain("probe date_verdict: not judged (the scan did not cover the window)");
    expect(paths().filter((path) => path.startsWith("/api/v2/tickets"))).toHaveLength(
      DATE_SCAN_PAGES,
    );
  });

  it("a scan that ends with no next page covers the window", async () => {
    const inside = dated.slice(1, 8);
    const { lines } = await dateProbes(
      dateAccount(undefined, { tickets: { status: 200, body: inside } }),
    );
    expect(lines.some((line) => line.includes("list pages 1 (cap 30), window covered yes"))).toBe(
      true,
    );
  });

  it("a failed scan prints its code and is not judged", async () => {
    const { lines, out } = await dateProbes(
      dateAccount(undefined, { tickets: { status: 500, body: { message: CANARY } } }),
    );
    expect(lines.some((line) => /^probe date_scan: fail server, list pages 1 /.test(line))).toBe(
      true,
    );
    expect(lines).toContain("probe date_verdict: not judged (the scan did not cover the window)");
    expect(out).not.toContain(CANARY);
  });

  it("counts unreadable created_at apart", async () => {
    const odd = [...dated.slice(0, 3), { id: 91010, created_at: "yesterday" }, ...dated.slice(3)];
    const { lines } = await dateProbes(
      dateAccount(undefined, { tickets: { status: 200, body: odd } }),
    );
    expect(lines.some((line) => line.includes("unreadable created_at 1,"))).toBe(true);
  });

  it("a list body that is not a list fails the scan", async () => {
    const notList = await dateProbes(
      dateAccount(undefined, { tickets: { status: 200, body: { note: CANARY } } }),
    );
    expect(notList.lines.some((line) => line.startsWith("probe date_scan: not a list,"))).toBe(
      true,
    );
  });

  it("a refused search prints its code; the verdict uses the other totals", async () => {
    const { lines, out } = await dateProbes((path) =>
      path.startsWith("/api/v2/search") && !path.includes("%3E")
        ? { status: 400, body: { description: CANARY } }
        : dateAccount()(path),
    );
    expect(lines).toContain("probe date_search 2026-11-19 created_at:'D': fail validation");
    expect(lines).toContain(
      "probe date_verdict: 1 of 8 readings predict all 12 totals: > exclusive, < exclusive, zone day",
    );
    expect(out).not.toContain(CANARY);
  });

  it("no search total at all is not judged", async () => {
    const { lines } = await dateProbes((path) =>
      path.startsWith("/api/v2/search")
        ? { status: 200, body: { results: [] } }
        : dateAccount()(path),
    );
    expect(lines).toContain("probe date_search 2026-11-19 created_at:'D': total ?, credits ?");
    expect(lines).toContain("probe date_verdict: not judged (no search total)");
  });
});

/** `searchUnder`'s exclusive zone reading over other tickets. */
function searchUnderTickets(list: typeof dated, path: string): Route {
  const text = decodeURIComponent(path.replace(/\+/g, " "));
  const eq = /created_at:'(\d{4}-\d\d-\d\d)'/.exec(text)?.[1];
  const gt = /created_at:>'(\d{4}-\d\d-\d\d)'/.exec(text)?.[1];
  const lt = /created_at:<'(\d{4}-\d\d-\d\d)'/.exec(text)?.[1];
  const total = list.filter(({ created_at }) => {
    const d = dayIn(created_at, true);
    return eq !== undefined ? d === eq : d > gt! && d < lt!;
  }).length;
  return { status: 200, body: { total, results: [] } };
}

// ---------------------------------------------------------------------------
// T-039: every `core` tool through the server in process (`make smoke-core`).

/** 2026-03-10, 12:00 UTC: the default period is 2026-03-04 to 2026-03-10. */
const CORE_NOW = Date.parse("2026-03-10T12:00:00Z");
const IN_PERIOD = "2026-03-09T10:00:00Z";
const RATE_HEADERS = {
  ...JSON_TYPE,
  "x-ratelimit-total": "5000.0",
  "x-ratelimit-remaining": "4990.0",
  "x-ratelimit-used-currentrequest": "1",
};

const coreTickets = ticketPage.map((ticket) => ({
  ...ticket,
  created_at: IN_PERIOD,
  updated_at: IN_PERIOD,
}));
const coreView = { ...ticketView, created_at: IN_PERIOD, updated_at: IN_PERIOD };
const coreContact = { id: 8801, name: "Pip Marlowe", email: "pip@example.com", company_id: 9001 };
const coreCompany = { id: 9001, name: "Marlowe Kites" };

interface CoreAccount {
  tickets: unknown[];
  categories: unknown[];
  cannedFolders: unknown[];
  /** Each category's folders and each folder's articles; the fixtures' first pages by default. */
  folders?: unknown[];
  articles?: unknown[];
  /** Search's `total` for the period query of count_tickets and export_tickets. */
  periodTotal?: number;
  /** A status for a request, or undefined to serve it. */
  fail?: (url: URL, seen: number) => number | undefined;
}

const HEALTHY: CoreAccount = {
  tickets: coreTickets,
  categories: categoryPages[0]!,
  cannedFolders: cannedFolderPages[0]!,
};

function periodQuery(from: string, to: string): string {
  return `"created_at:>'${from}' AND created_at:<'${to}'"`;
}

/** Every GET of the core tools, served by path; `seen` counts the requests so far. */
function serveCore(account: CoreAccount, onPeriodSearch?: () => void) {
  let seen = 0;
  mock
    .get(ORIGIN)
    .intercept({ path: () => true, method: "GET" })
    .reply((opts) => {
      seen += 1;
      const url = new URL(opts.path, ORIGIN);
      const path = url.pathname.replace(/^\/api\/v2/, "");
      const answer = (body: unknown, statusCode = 200) => ({
        statusCode,
        data: JSON.stringify(body),
        responseOptions: { headers: RATE_HEADERS },
      });
      const failed = account.fail?.(url, seen);
      if (failed !== undefined) {
        return answer({ description: CANARY, errors: [{ message: CANARY }] }, failed);
      }
      if (path === "/ticket_fields") return answer(schemaFieldsPayload);
      if (path === "/agents") return answer(agents);
      if (path === "/groups") return answer(groups);
      if (path === "/tickets") return answer(account.tickets);
      if (/^\/tickets\/\d+$/.test(path)) return answer(coreView);
      if (/^\/tickets\/\d+\/conversations$/.test(path)) return answer(conversationPages[0]);
      if (/^\/contacts\/\d+$/.test(path)) return answer(coreContact);
      if (/^\/companies\/\d+$/.test(path)) return answer(coreCompany);
      if (path === "/search/tickets") {
        const query = url.searchParams.get("query") ?? "";
        if (query.includes("created_at:<")) {
          onPeriodSearch?.();
          return answer({
            total: account.periodTotal ?? account.tickets.length,
            results: account.tickets,
          });
        }
        return answer({ total: account.tickets.length, results: account.tickets });
      }
      if (path === "/solutions/categories") return answer(account.categories);
      if (/^\/solutions\/categories\/\d+\/folders$/.test(path))
        return answer(account.folders ?? folderPages[0]);
      if (/^\/solutions\/folders\/\d+\/articles$/.test(path))
        return answer(account.articles ?? articlePages[0]);
      if (/^\/solutions\/folders\/\d+$/.test(path)) return answer(folderView);
      if (/^\/solutions\/articles\/\d+$/.test(path)) return answer(articleView);
      if (path === "/search/solutions") return answer(searchHits);
      if (path === "/canned_response_folders") return answer(account.cannedFolders);
      if (/^\/canned_response_folders\/\d+$/.test(path)) return answer(cannedFolderView);
      if (/^\/canned_responses\/\d+$/.test(path)) return answer(cannedResponseView);
      return answer({ description: "not served by the test" }, 404);
    })
    .persist();
}

let coreDirs: string[] = [];
afterEach(() => {
  for (const dir of coreDirs) rmSync(dir, { recursive: true, force: true });
  coreDirs = [];
});

/** A fresh parent for the run's export directory, and a team file with fast pacing. */
function coreSetup() {
  const root = mkdtempSync(join(tmpdir(), "freshdesk-mcp-smoke-test-"));
  coreDirs.push(root);
  const team = join(root, "team.json");
  writeFileSync(team, JSON.stringify({ limits: { pacing_rps: 1000 } }));
  const tmpRoot = join(root, "tmp");
  mkdirSync(tmpRoot);
  return { team, tmpRoot };
}

async function core(
  account: CoreAccount,
  options: Partial<CoreOptions> = {},
  onPeriodSearch?: (tmpRoot: string) => void,
) {
  const { team, tmpRoot } = coreSetup();
  serveCore(account, () => onPeriodSearch?.(tmpRoot));
  const lines: string[] = [];
  const results = new Map<string, CallResult[]>();
  const env = { FRESHDESK_DOMAIN: DOMAIN, FRESHDESK_API_KEY: API_KEY, FRESHDESK_MCP_CONFIG: team };
  const code = await main(env, mock, (line) => lines.push(line), "core", {
    now: CORE_NOW,
    tmpRoot,
    seen: (tool, result) => results.set(tool, [...(results.get(tool) ?? []), result]),
    ...options,
  });
  return { code, lines, out: lines.join("\n"), results, tmpRoot };
}

function toolLine(lines: string[], label: string): string {
  const line = lines.find((each) => each.startsWith(`tool ${label}: `));
  expect(line, `no line for ${label}`).toBeDefined();
  return line!;
}

function caseLine(lines: string[], name: string): string {
  const line = lines.find((each) => each.startsWith(`use case ${name} `));
  expect(line, `no line for ${name}`).toBeDefined();
  return line!;
}

function requestUrls(): URL[] {
  return sent().map((call) => new URL(call.fullUrl));
}

/** String values and numbers of 100 or more in the fixtures: ticket text, names, ids. */
function fixtureValues(value: unknown, into = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    if (value.length > 3 && !/^\d{4}-\d\d-\d\d/.test(value)) into.add(value);
  } else if (typeof value === "number" && value >= 100) into.add(String(value));
  else if (Array.isArray(value)) for (const item of value) fixtureValues(item, into);
  else if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) fixtureValues(item, into);
  }
  return into;
}

describe("smoke core: every registered core tool", () => {
  it("calls each tool of the registry through the server; all pass on a healthy account", async () => {
    const { code, lines, results } = await core(HEALTHY);
    expect(code).toBe(0);
    for (const tool of CORE_TOOLS) {
      expect(results.has(tool.name), `${tool.name} was not called`).toBe(true);
      expect(toolLine(lines, tool.name)).toMatch(/: pass(, | \(empty\), )/);
    }
    expect(toolLine(lines, "list_tickets uncategorized")).toMatch(/: pass/);
    expect(lines.filter((line) => line.startsWith("tool "))).toHaveLength(CORE_TOOLS.length + 1);
    for (const name of ["C1 listing", "C2", "C3 read", "C7", "C9", "C10"]) {
      expect(caseLine(lines, name)).toMatch(/: pass/);
    }
    expect(lines.at(-1)).toBe("smoke core: ok");
  });

  it("a registered tool the run has no call for is a fail, exit non-zero", async () => {
    const extra = { ...CORE_TOOLS[0]!, name: "brand_new_tool" };
    const { code, lines } = await core(HEALTHY, { toolsets: { core: [...CORE_TOOLS, extra] } });
    expect(code).toBe(1);
    expect(toolLine(lines, "brand_new_tool")).toBe(
      "tool brand_new_tool: fail no_smoke_call, calls 0",
    );
    expect(lines.at(-1)).toBe("smoke core: fail");
  });

  it("sends GET only, and every request counted in the calls", async () => {
    const { lines } = await core(HEALTHY);
    const calls = sent();
    expect(calls.length).toBeGreaterThan(20);
    expect(new Set(calls.map((call) => call.method))).toEqual(new Set(["GET"]));
    const total = lines.find((line) => /^smoke core: \d+ tool lines, /.test(line));
    expect(total).toMatch(new RegExp(`; ${calls.length} calls$`));
  });

  it("prints the calls each tool used", async () => {
    const { lines } = await core(HEALTHY);
    // Warm schema: get_ticket_schema loads it (fields, agents, groups).
    expect(toolLine(lines, "get_ticket_schema")).toMatch(/, calls 3$/);
    expect(toolLine(lines, "list_agents")).toMatch(/, calls 1$/);
  });
});

describe("smoke core: the period of count_tickets and export_tickets", () => {
  it("is the last 7 days by default, asserted in the requests", async () => {
    const { lines } = await core(HEALTHY);
    const queries = requestUrls()
      .filter((url) => url.pathname === "/api/v2/search/tickets")
      .map((url) => url.searchParams.get("query"));
    expect(
      queries.filter((query) => query === periodQuery("2026-03-04", "2026-03-10")),
    ).toHaveLength(2);
    expect(lines[0]).toContain("2026-03-04 to 2026-03-10");
    expect(toolLine(lines, "count_tickets")).toMatch(/: pass, total 2, groups 1, calls \d+$/);
    expect(toolLine(lines, "export_tickets")).toMatch(/: pass, rows 2, calls \d+$/);
  });

  it("takes a narrower period from --days", async () => {
    await core(HEALTHY, { days: "2" });
    const queries = requestUrls().map((url) => url.searchParams.get("query"));
    expect(
      queries.filter((query) => query === periodQuery("2026-03-09", "2026-03-10")),
    ).toHaveLength(2);
  });

  it.each(["0", "-1", "1.5", "abc", "367", ""])("refuses --days %j, nothing sent", async (days) => {
    const { code, lines } = await core(HEALTHY, { days });
    expect(code).toBe(1);
    expect(lines).toEqual(["config: fail (--days takes a whole number of days, 1 to 366)"]);
    expect(sent()).toEqual([]);
  });

  it("reports a budget refusal as refused (budget) with the estimate, not as fail", async () => {
    const { code, lines } = await core({ ...HEALTHY, periodTotal: 30_000 });
    expect(code).toBe(0);
    expect(toolLine(lines, "count_tickets")).toMatch(
      /^tool count_tickets: refused \(budget\), estimate 301 calls over the budget of 250, calls \d+$/,
    );
    expect(toolLine(lines, "export_tickets")).toMatch(/: refused \(budget\), estimate 301 calls/);
    expect(caseLine(lines, "C7")).toMatch(/: refused \(budget\)/);
    expect(lines.join("\n")).not.toMatch(/: fail/);
  });
});

describe("smoke core: outcomes", () => {
  it("an empty list is pass (empty); a tool with no id to use is not exercised", async () => {
    const { lines } = await core({ tickets: [], categories: [], cannedFolders: [] });
    expect(toolLine(lines, "list_tickets")).toMatch(
      /^tool list_tickets: pass \(empty\), items 0, /,
    );
    expect(toolLine(lines, "get_ticket")).toBe(
      "tool get_ticket: not exercised (no ticket), calls 0",
    );
    expect(toolLine(lines, "find_similar_tickets")).toBe(
      "tool find_similar_tickets: not exercised (no ticket), calls 0",
    );
    expect(toolLine(lines, "list_solution_tree")).toMatch(/: pass \(empty\), categories 0, /);
    expect(toolLine(lines, "get_solution_article")).toBe(
      "tool get_solution_article: not exercised (no article), calls 0",
    );
    expect(toolLine(lines, "search_solutions")).toBe(
      "tool search_solutions: not exercised (no article title or folder name to search for), calls 0",
    );
    expect(toolLine(lines, "list_canned_responses")).toMatch(/: pass \(empty\), folders 0, /);
    expect(toolLine(lines, "get_canned_response")).toBe(
      "tool get_canned_response: not exercised (no canned response), calls 0",
    );
    expect(caseLine(lines, "C3 read")).toMatch(
      /: pass; owner to accept: list_tickets pass \(empty\), get_ticket not exercised/,
    );
  });

  it("a failing tool prints its error code only, and the run exits non-zero", async () => {
    const fail = (url: URL) => (/^\/api\/v2\/tickets\/\d+$/.test(url.pathname) ? 404 : undefined);
    const { code, lines, out } = await core({ ...HEALTHY, fail });
    expect(code).toBe(1);
    expect(toolLine(lines, "get_ticket")).toBe("tool get_ticket: fail not_found, calls 1");
    expect(caseLine(lines, "C3 read")).toMatch(/: fail$/);
    expect(out).not.toContain(CANARY);
    expect(stderr.join("")).not.toContain(CANARY);
    expect(lines.at(-1)).toBe("smoke core: fail");
  });

  it("C9 and C10 each include the search_tickets call, sent for recent tickets", async () => {
    const { lines } = await core(HEALTHY);
    expect(caseLine(lines, "C9")).toMatch(/\(.*search_tickets.*\): pass/);
    expect(caseLine(lines, "C10")).toMatch(/\(.*search_tickets.*\): pass/);
    expect(caseLine(lines, "C9")).toContain("list_solution_tree");
    expect(caseLine(lines, "C10")).toContain("list_canned_responses");
    const queries = requestUrls().map((url) => url.searchParams.get("query"));
    expect(queries).toContain(`"created_at:>'2026-03-04'"`);
  });

  it("prints no fixture text, id, domain or key", async () => {
    const { lines } = await core(HEALTHY);
    const out = [...lines, ...stderr].join("\n");
    const values = [
      ...fixtureValues([
        coreTickets,
        coreView,
        coreContact,
        coreCompany,
        conversationPages,
        agents,
        groups,
        schemaFieldsPayload,
        categoryPages,
        folderPages,
        articlePages,
        articleView,
        searchHits,
        folderView,
        cannedFolderPages,
        cannedFolderView,
        cannedResponseView,
      ]),
    ];
    expect(values).toContain("Sprocket squeaks at dawn");
    expect(values).toContain("4101");
    const leaked = values.filter((value) =>
      new RegExp(`(?<![A-Za-z0-9_])${escape(value)}(?![A-Za-z0-9_])`).test(out),
    );
    expect(leaked).toEqual([]);
    for (const secret of [DOMAIN, "quillmoor", API_KEY, ORIGIN]) expect(out).not.toContain(secret);
  });
});

describe("smoke core: where the solutions term and article come from", () => {
  function solutionRequests() {
    const urls = requestUrls();
    return {
      terms: urls
        .filter((url) => url.pathname === "/api/v2/search/solutions")
        .map((url) => url.searchParams.get("term")),
      articles: urls
        .map((url) => /^\/api\/v2\/solutions\/articles\/(\d+)$/.exec(url.pathname)?.[1])
        .filter((id) => id !== undefined),
    };
  }

  it("a tree with articles: the first article's title word and its id", async () => {
    const { lines } = await core(HEALTHY);
    // "Fitting a new sprocket", id 3301: the tree's first article.
    expect(solutionRequests()).toEqual({ terms: ["Fitting"], articles: ["3301"] });
    expect(toolLine(lines, "search_solutions")).toMatch(/: pass, items 2, /);
    expect(toolLine(lines, "get_solution_article")).toMatch(/: pass, text yes, /);
  });

  it("a tree with folders but no article: the first folder's name word, the first hit's id", async () => {
    const { lines } = await core({ ...HEALTHY, articles: [] });
    // "Getting Started": the first folder; 3302: the first search hit.
    expect(solutionRequests()).toEqual({ terms: ["Getting"], articles: ["3302"] });
    expect(toolLine(lines, "list_solution_tree")).toMatch(
      /: pass, categories 2, folders 4, articles 0, /,
    );
    expect(toolLine(lines, "search_solutions")).toMatch(/: pass, items 2, /);
    expect(toolLine(lines, "get_solution_article")).toMatch(/: pass, text yes, /);
    expect(caseLine(lines, "C9")).toMatch(/: pass$/);
  });

  it("no folder either: both not exercised, nothing searched", async () => {
    const { lines } = await core({ ...HEALTHY, folders: [] });
    expect(solutionRequests()).toEqual({ terms: [], articles: [] });
    expect(toolLine(lines, "search_solutions")).toBe(
      "tool search_solutions: not exercised (no article title or folder name to search for), calls 0",
    );
    expect(toolLine(lines, "get_solution_article")).toBe(
      "tool get_solution_article: not exercised (no article), calls 0",
    );
  });
});

describe("smoke core: the export directory", () => {
  function watch() {
    const modes: number[] = [];
    const record = (tmpRoot: string) => {
      const entries = readdirSync(tmpRoot);
      expect(entries).toHaveLength(1);
      modes.push(statSync(join(tmpRoot, entries[0]!)).mode & 0o777);
    };
    return { modes, record };
  }

  it("is a temporary 0700 directory, gone after a run that passes", async () => {
    const { modes, record } = watch();
    const { code, tmpRoot } = await core(HEALTHY, {}, record);
    expect(code).toBe(0);
    expect(modes.length).toBeGreaterThan(0);
    expect(new Set(modes)).toEqual(new Set([0o700]));
    expect(readdirSync(tmpRoot)).toEqual([]);
  });

  it("is gone after a run whose export fails", async () => {
    const { modes, record } = watch();
    let periodSearches = 0;
    const fail = (url: URL) => {
      if (!(url.searchParams.get("query") ?? "").includes("created_at:<")) return undefined;
      periodSearches += 1;
      // count_tickets' search is served; export_tickets' fails.
      return periodSearches === 2 ? 400 : undefined;
    };
    const { code, lines, tmpRoot } = await core({ ...HEALTHY, fail }, {}, record);
    expect(code).toBe(1);
    expect(toolLine(lines, "export_tickets")).toMatch(/^tool export_tickets: fail validation, /);
    expect(modes).toEqual([0o700]);
    expect(readdirSync(tmpRoot)).toEqual([]);
  });
});

describe("smoke core: the real registry's descriptions", () => {
  it("state each tool's cost; a tool whose fixture result has customer text says so", async () => {
    const { results } = await core(HEALTHY);
    const { team } = coreSetup();
    const config = loadConfig({
      FRESHDESK_DOMAIN: DOMAIN,
      FRESHDESK_API_KEY: API_KEY,
      FRESHDESK_MCP_CONFIG: team,
    });
    const server = createServer(createContext(config, mock));
    const listed = await listTools(await open(server));
    expect(listed.map((tool) => tool.name).sort()).toEqual(
      CORE_TOOLS.map((tool) => tool.name).sort(),
    );
    const withText: string[] = [];
    for (const tool of CORE_TOOLS) {
      const description = listed.find((each) => each.name === tool.name)!.description;
      expect(description).toContain(`Cost: ${tool.cost}.`);
      const texts = (results.get(tool.name) ?? []).flatMap((result) =>
        result.content.map((part) => part.text),
      );
      if (texts.some((text) => text.includes(OPEN))) {
        withText.push(tool.name);
        expect(tool.customerText, tool.name).toBe(true);
        expect(description, tool.name).toContain(DATA_NOT_INSTRUCTIONS);
      }
    }
    expect(withText).toEqual(expect.arrayContaining(["get_ticket", "get_canned_response"]));
    await server.close();
  });
});
