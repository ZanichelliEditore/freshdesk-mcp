import { types } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpClient, type HttpRequest, type PageRequest } from "../src/client/http.js";
import { RateLimiter } from "../src/client/rate-limit.js";
import { listTicketFields } from "../src/client/resources/ticket-fields.js";
import {
  choicesShape,
  main,
  runProbes,
  runSmoke,
  smoke,
  SmokeClient,
} from "../scripts/smoke/smoke.js";
import { agentPages, groupPages } from "./fixtures/agents-groups.js";
import { ticketFieldsPayload, ticketFieldsWithEntityChoices } from "./fixtures/ticket-fields.js";
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
  return { status: 200, body: tickets, headers: credits };
}

async function probes(route: (path: string) => Route = healthy) {
  serve(route);
  const lines: string[] = [];
  const code = await runProbes(client(), (line) => lines.push(line), NOW);
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
    expect(lines).toContain("probe search_cap_page_1: total 412, over 300 yes, 2 items, credits 1");
    expect(lines).toContain("probe search_cap_page_11: fail validation");
    expect(lines).toContain(
      "probe search_null_nested_last: total 412, over 300 yes, 2 items, all empty yes, credits 1",
    );
    expect(lines).toContain(
      "probe search_null_nested_top: total 412, over 300 yes, 2 items, all empty no, credits 1",
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
    expect(paths().some((path) => path.includes("requester_id"))).toBe(false);
  });

  it("with no nested field, the null probes are skipped", async () => {
    const { lines } = await probes((path) =>
      path.startsWith("/api/v2/ticket_fields")
        ? { status: 200, body: ticketFieldsPayload.slice(0, 4) }
        : healthy(path),
    );
    expect(lines).toContain("probe nested_field: skipped (no nested field with a plain API name)");
    expect(paths().some((path) => path.includes("null"))).toBe(false);
  });

  it("a nested field name unfit for a query is not sent", async () => {
    const fields = structuredClone(ticketFieldsPayload) as Record<string, unknown>[];
    fields[4]!.nested_ticket_fields = [{ name: "cf model) OR (x", level: 3 }];
    const { lines } = await probes((path) =>
      path.startsWith("/api/v2/ticket_fields") ? { status: 200, body: fields } : healthy(path),
    );
    expect(lines).toContain("probe nested_field: skipped (no nested field with a plain API name)");
    expect(paths().some((path) => path.includes("null"))).toBe(false);
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
