import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../../src/config.js";
import { createServer } from "../../../src/server.js";
import { type AppContext, createContext } from "../../../src/tools/context.js";
import {
  GROUP_CAP,
  LIST_PAGE_SIZE,
  MAX_GROUP_FIELDS,
  SCAN_START_MS,
  SEARCH_PAGE_SIZE,
} from "../../../src/tools/toolsets/core/count-tickets.js";
import { DATA_NOT_INSTRUCTIONS } from "../../../src/tools/toolsets/index.js";
import { agentPages, groupPages } from "../../fixtures/agents-groups.js";
import { rawTicket, schemaFieldsPayload } from "../../fixtures/schema.js";
import {
  type CallResult,
  callTool,
  listTools,
  open,
  type Session,
} from "../../support/mcp-session.js";
import { type MockAgent, mockDispatcher } from "../../support/mock-dispatcher.js";
import { answersAfter, silentFor } from "../../support/slow-replies.js";

// Every name, label and text here is invented.

const DOMAIN = "acme.freshdesk.com";
const ORIGIN = `https://${DOMAIN}`;
const JSON_TYPE = { "content-type": "application/json" };
const TOOL = "count_tickets";

const FIELDS = "/api/v2/ticket_fields";
const AGENTS = "/api/v2/agents?per_page=100";
const GROUPS = "/api/v2/groups?per_page=100";

/** Fast pacing, so the expensive requests of a test do not wait 500 ms each. */
const FAST = { limits: { pacing_rps: 1000 } };

const PERIOD = { from: "2026-01-01", to: "2026-01-31" };
const PERIOD_QUERY = "created_at:>'2026-01-01' AND created_at:<'2026-01-31'";

/** The fixture fields, with a checkbox and a field of a type the code does not know. */
const FIELDS_PAYLOAD = [
  ...schemaFieldsPayload,
  { id: 1020, name: "cf_urgent", label: "Urgent", type: "custom_checkbox", default: false },
  { id: 1021, name: "cf_mystery", label: "Mystery", type: "custom_mystery", default: false },
  { id: 1022, name: "cf_units", label: "Units", type: "custom_number", default: false },
  { id: 1023, name: "cf_due_at", label: "Due at", type: "custom_date_time", default: false },
];

function searchPath(query: string, page = 1): string {
  return `/api/v2/search/tickets?${String(new URLSearchParams({ query: `"${query}"`, page: String(page) }))}`;
}

/** The ordered list scan from the period's first day, page `page`. */
function scanPath(page: number, from = PERIOD.from): string {
  const query = new URLSearchParams({
    per_page: String(LIST_PAGE_SIZE),
    page: String(page),
    updated_since: `${from}T00:00:00Z`,
    order_by: "created_at",
    order_type: "asc",
  });
  return `/api/v2/tickets?${String(query)}`;
}

/** An Open, High ticket created on 2026-01-02, in the period. */
function ticket(id: number, over: Record<string, unknown> = {}) {
  return {
    ...rawTicket,
    id,
    subject: `Sprocket report ${id}`,
    created_at: "2026-01-02T10:00:00Z",
    updated_at: "2026-01-02T11:30:00Z",
    custom_fields: { ...rawTicket.custom_fields, cf_urgent: false },
    ...over,
  };
}

const closed = (id: number) => ticket(id, { status: 5 });
const closedLow = (id: number) => ticket(id, { status: 5, priority: 1 });
const openLow = (id: number) => ticket(id, { priority: 1 });

function many(from: number, count: number, make: (id: number) => object = ticket) {
  return Array.from({ length: count }, (_, i) => make(from + i));
}

const dir = mkdtempSync(join(tmpdir(), "freshdesk-mcp-count-tickets-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let mock: MockAgent;
let servers: McpServer[];
let fileCount = 0;

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  mock = mockDispatcher();
  servers = [];
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const server of servers) await server.close();
  await mock.close();
});

function reply(
  path: string,
  body: unknown,
  { status = 200, next = false, headers = {} as Record<string, string> } = {},
) {
  return mock
    .get(ORIGIN)
    .intercept({ path, method: "GET" })
    .reply(status, body as object, {
      headers: {
        ...JSON_TYPE,
        ...headers,
        ...(next ? { link: `<${ORIGIN}/api/v2/tickets?page=next>; rel="next"` } : {}),
      },
    });
}

function found(results: unknown[], total = results.length) {
  return { total, results };
}

function sent(): number {
  return mock.getCallHistory()?.calls().length ?? 0;
}

function paths(): string[] {
  return (mock.getCallHistory()?.calls() ?? []).map((call) => {
    const url = new URL(call.fullUrl);
    return url.pathname + url.search;
  });
}

interface Desk {
  session: Session;
  context: AppContext;
}

async function cold(team: unknown = FAST): Promise<Desk> {
  const path = join(dir, `team-${++fileCount}.json`);
  writeFileSync(path, JSON.stringify(team));
  const config = loadConfig({
    FRESHDESK_DOMAIN: DOMAIN,
    FRESHDESK_API_KEY: "k3y-Secret-Value-123",
    FRESHDESK_MCP_CONFIG: path,
  });
  const context = createContext(config, mock);
  const server = createServer(context);
  servers.push(server);
  return { session: await open(server), context };
}

function queueSchema(agents: unknown[] = agentPages.flat()) {
  reply(FIELDS, FIELDS_PAYLOAD);
  reply(AGENTS, agents);
  reply(GROUPS, groupPages.flat());
}

/** A session whose schema is cached, the MockAgent's count back at 0. */
async function warm(team: unknown = FAST, agents?: unknown[]): Promise<Desk> {
  const desk = await cold(team);
  queueSchema(agents);
  const loaded = await desk.context.schema.get();
  if (!loaded.ok) throw new Error("the fixture schema did not load");
  mock.clearCallHistory();
  return desk;
}

interface Group {
  values: Record<string, unknown>;
  count: number;
}

interface Output {
  groups: Group[];
  groups_not_shown?: number;
  total: number;
  truncated?: boolean;
  api_calls_used: number;
}

function output(result: CallResult): Output {
  expect(result.isError).toBeFalsy();
  return JSON.parse(result.content[0].text) as Output;
}

interface Refusal {
  code: string;
  message: string;
  errors?: { field?: string; code?: string; message: string }[];
}

function refusal(result: CallResult): Refusal {
  expect(result.isError).toBe(true);
  return (JSON.parse(result.content[0].text) as { error: Refusal }).error;
}

/** A reply Freshdesk takes `ms` to give, on the clock of test/support/slow-replies.ts. */
function replyTaking(path: string, body: unknown, ms: number, { next = false } = {}) {
  const link: Record<string, string> = next
    ? { link: `<${ORIGIN}/api/v2/tickets?page=next>; rel="next"` }
    : {};
  mock
    .get(ORIGIN)
    .intercept({ path, method: "GET" })
    .reply(answersAfter(ms, body, link));
}

/** A request still unanswered after `ms`, on the same clock: it then fails as `network`. */
function replyHanging(path: string, ms: number) {
  mock.get(ORIGIN).intercept({ path, method: "GET" }).reply(silentFor(ms));
}

describe("count_tickets: the listing", () => {
  it("is listed read-only, with its cost, its sources, its caps and an example", async () => {
    const tools = await listTools((await cold()).session);
    const tool = tools.find((listed) => listed.name === TOOL);
    expect(tool?.annotations.readOnlyHint).toBe(true);
    expect(tool?.annotations.destructiveHint).toBe(false);
    const description = tool?.description ?? "";
    expect(description).toContain("Cost:");
    expect(description).toContain(DATA_NOT_INSTRUCTIONS);
    expect(description).toContain("300");
    expect(description).toContain("truncated: true");
    expect(description).toContain("confirm: true");
    expect(description).toContain('"group_by": ["Status", "Priority"]');
    expect(description).toContain('{"values": {"Status": "Open", "Priority": "High"}, "count": 2}');
    expect(description).toContain("hides");
    expect(description).toContain("confirm lifts the API budget only, not the time limit");
    expect(description).toContain("about 40 requests (4,000 tickets)");
    expect(description).toContain("no ticket is counted twice");
    expect(description).toContain("groups_not_shown");
  });

  it("its page sizes are the two endpoints' and it groups by two fields at most", () => {
    expect(SEARCH_PAGE_SIZE).toBe(30);
    expect(LIST_PAGE_SIZE).toBe(100);
    expect(MAX_GROUP_FIELDS).toBe(2);
    expect(GROUP_CAP).toBe(200);
  });

  it("its input schema has no zod default or transform", () => {
    const source = readFileSync(
      new URL("../../../src/tools/toolsets/core/count-tickets.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("z.object(");
    expect(source).not.toContain(".default(");
    expect(source).not.toContain(".transform(");
  });
});

describe("count_tickets: counts from search (total ≤ 300)", () => {
  /** 45 tickets over two search pages: 20 Open/High, 10 Open/Low, 15 Closed/Low. */
  function twoPages(query = PERIOD_QUERY) {
    const first = [...many(4301, 20), ...many(4321, 10, openLow)];
    const second = many(4331, 15, closedLow);
    reply(searchPath(query, 1), found(first, 45));
    reply(searchPath(query, 2), found(second, 45));
  }

  it("by one field: the counts by status name, from both pages", async () => {
    const { session } = await warm();
    twoPages();
    const result = output(
      await callTool(session, TOOL, { group_by: ["Status"], created_between: PERIOD }),
    );
    expect(result.groups).toEqual([
      { values: { Status: "Open" }, count: 30 },
      { values: { Status: "Closed" }, count: 15 },
    ]);
    expect(result.total).toBe(45);
    expect(result).not.toHaveProperty("truncated");
    expect(paths()).toEqual([searchPath(PERIOD_QUERY, 1), searchPath(PERIOD_QUERY, 2)]);
    expect(result.api_calls_used).toBe(sent());
  });

  it("by two fields: one group per pair, keyed by both labels", async () => {
    const { session } = await warm();
    twoPages();
    const result = output(
      await callTool(session, TOOL, {
        group_by: ["status", "Priority"],
        created_between: PERIOD,
      }),
    );
    expect(result.groups).toEqual([
      { values: { Status: "Open", Priority: "High" }, count: 20 },
      { values: { Status: "Closed", Priority: "Low" }, count: 15 },
      { values: { Status: "Open", Priority: "Low" }, count: 10 },
    ]);
    expect(result.total).toBe(45);
  });

  it("a nested field, an agent, a group and a checkbox group by their labels and names", async () => {
    const { session } = await warm();
    const other = ticket(4302, {
      responder_id: 501,
      group_id: 701,
      custom_fields: { ...rawTicket.custom_fields, cf_model: null, cf_urgent: true },
    });
    reply(searchPath(PERIOD_QUERY), found([ticket(4301), other]));
    reply(searchPath(PERIOD_QUERY), found([ticket(4301), other]));
    const byProduct = output(
      await callTool(session, TOOL, { group_by: ["cf_kit", "Urgent"], created_between: PERIOD }),
    );
    expect(byProduct.groups).toEqual([
      { values: { Product: "Gadgets > Sprockets > Blue sprocket", Urgent: false }, count: 1 },
      { values: { Product: "Gadgets > Sprockets", Urgent: true }, count: 1 },
    ]);
    const byPeople = output(
      await callTool(session, TOOL, { group_by: ["Agent", "Group"], created_between: PERIOD }),
    );
    expect(byPeople.groups).toEqual([
      // Equal counts: ordered by id (agent 501 before 502).
      { values: { Agent: "Quill Ottersby", Group: "Sprocket Desk" }, count: 1 },
      { values: { Agent: "Juniper Vantablack", Group: "Spanner Desk" }, count: 1 },
    ]);
  });

  it("an empty value counts under null", async () => {
    const { session } = await warm();
    reply(searchPath(PERIOD_QUERY), found([ticket(4301), ticket(4302, { group_id: null })]));
    const result = output(
      await callTool(session, TOOL, { group_by: ["Group"], created_between: PERIOD }),
    );
    expect(result.groups).toEqual([
      { values: { Group: "Spanner Desk" }, count: 1 },
      { values: { Group: null }, count: 1 },
    ]);
  });

  it("a field the team hides counts every ticket under null: hidden is not an access control", async () => {
    const { session } = await warm({ ...FAST, fields: { Priority: { hidden: true } } });
    reply(searchPath(PERIOD_QUERY), found([ticket(4301), openLow(4302)]));
    const result = output(
      await callTool(session, TOOL, { group_by: ["Priority"], created_between: PERIOD }),
    );
    expect(result.groups).toEqual([{ values: { Priority: null }, count: 2 }]);
  });

  it("the filters join the period in one search query", async () => {
    const { session } = await warm();
    const query = `status:2 AND tag:'sprocket' AND ${PERIOD_QUERY}`;
    reply(searchPath(query), found([ticket(4301)]));
    const result = output(
      await callTool(session, TOOL, {
        group_by: ["Status"],
        created_between: PERIOD,
        status: "Open",
        tag: "sprocket",
      }),
    );
    expect(result.groups).toEqual([{ values: { Status: "Open" }, count: 1 }]);
    expect(paths()).toEqual([searchPath(query)]);
  });

  it("uncategorized is checked on each result (matchesLocal)", async () => {
    const { session } = await warm();
    const bare = ticket(4302, { custom_fields: { ...rawTicket.custom_fields, cf_model: null } });
    reply(searchPath(PERIOD_QUERY), found([ticket(4301), bare]));
    const result = output(
      await callTool(session, TOOL, {
        group_by: ["Status"],
        created_between: PERIOD,
        uncategorized: true,
      }),
    );
    expect(result.groups).toEqual([{ values: { Status: "Open" }, count: 1 }]);
    expect(result.total).toBe(1);
  });

  it("a search total of 0 is no group, one request", async () => {
    const { session } = await warm();
    reply(searchPath(PERIOD_QUERY), found([], 0));
    const result = output(
      await callTool(session, TOOL, { group_by: ["Status"], created_between: PERIOD }),
    );
    expect(result.groups).toEqual([]);
    expect(result.total).toBe(0);
    expect(sent()).toBe(1);
  });

  it("a total of exactly 300 is ten search pages, not a scan", async () => {
    const { session } = await warm();
    for (let page = 1; page <= 10; page++) {
      reply(searchPath(PERIOD_QUERY, page), found(many(5000 + page * 100, 30), 300));
    }
    const result = output(
      await callTool(session, TOOL, { group_by: ["Status"], created_between: PERIOD }),
    );
    expect(result.total).toBe(300);
    expect(sent()).toBe(10);
    expect(paths().every((path) => path.startsWith("/api/v2/search/tickets"))).toBe(true);
  });
});

describe("count_tickets: each ticket once, the group cap, shared names", () => {
  it("a ticket on page 1 and again on page 2 (it moved) is counted once", async () => {
    const { session } = await warm();
    reply(searchPath(PERIOD_QUERY, 1), found(many(4301, 30), 45));
    reply(searchPath(PERIOD_QUERY, 2), found([ticket(4330), ...many(4331, 14)], 45));
    const result = output(
      await callTool(session, TOOL, { group_by: ["Status"], created_between: PERIOD }),
    );
    expect(result.total).toBe(44);
    expect(result.groups).toEqual([{ values: { Status: "Open" }, count: 44 }]);
  });

  it("past GROUP_CAP groups: the largest shown, groups_not_shown and truncated: true", async () => {
    const { session } = await warm();
    // 210 tickets: units 0 on six of them, then 204 other values, one each: 205 groups.
    const units = (id: number, n: number) =>
      ticket(id, { custom_fields: { ...rawTicket.custom_fields, cf_units: n } });
    const all = [
      ...Array.from({ length: 6 }, (_, i) => units(5000 + i, 0)),
      ...Array.from({ length: 204 }, (_, i) => units(5100 + i, i + 1)),
    ];
    for (let page = 1; page <= 7; page++) {
      reply(searchPath(PERIOD_QUERY, page), found(all.slice((page - 1) * 30, page * 30), 210));
    }
    const result = output(
      await callTool(session, TOOL, { group_by: ["Units"], created_between: PERIOD }),
    );
    expect(result.groups).toHaveLength(GROUP_CAP);
    expect(result.groups[0]).toEqual({ values: { Units: 0 }, count: 6 });
    expect(result.groups_not_shown).toBe(5);
    expect(result.truncated).toBe(true);
    expect(result.total).toBe(210);
  });

  it("exactly GROUP_CAP groups: all shown, not truncated", async () => {
    const { session } = await warm();
    const all = Array.from({ length: GROUP_CAP }, (_, i) =>
      ticket(5000 + i, { custom_fields: { ...rawTicket.custom_fields, cf_units: i } }),
    );
    for (let page = 1; page <= 7; page++) {
      reply(
        searchPath(PERIOD_QUERY, page),
        found(all.slice((page - 1) * 30, page * 30), GROUP_CAP),
      );
    }
    const result = output(
      await callTool(session, TOOL, { group_by: ["Units"], created_between: PERIOD }),
    );
    expect(result.groups).toHaveLength(GROUP_CAP);
    expect(result).not.toHaveProperty("groups_not_shown");
    expect(result).not.toHaveProperty("truncated");
  });

  it("two agents with one name are two groups, each shown with its id; a unique name stays plain", async () => {
    const twin = {
      ...agentPages[0]![0]!,
      id: 504,
      contact: { ...agentPages[0]![0]!.contact, name: "Juniper Vantablack" },
    };
    const { session } = await warm(FAST, [...agentPages.flat(), twin]);
    reply(
      searchPath(PERIOD_QUERY),
      found([
        ticket(4301),
        ticket(4302),
        ticket(4303, { responder_id: 504 }),
        ticket(4304, { responder_id: 501 }),
      ]),
    );
    const result = output(
      await callTool(session, TOOL, { group_by: ["Agent"], created_between: PERIOD }),
    );
    expect(result.groups).toEqual([
      { values: { Agent: "Juniper Vantablack (502)" }, count: 2 },
      { values: { Agent: "Quill Ottersby" }, count: 1 },
      { values: { Agent: "Juniper Vantablack (504)" }, count: 1 },
    ]);
  });
});

describe("count_tickets: refused, no request sent", () => {
  it("a third field is validation, with no request even on a cold schema", async () => {
    const { session } = await cold();
    const error = refusal(
      await callTool(session, TOOL, {
        group_by: ["Status", "Priority", "Group"],
        created_between: PERIOD,
      }),
    );
    expect(error.code).toBe("validation");
    expect(error.errors?.[0]).toMatchObject({ field: "group_by", code: "too_many_fields" });
    expect(sent()).toBe(0);
  });

  it("no field is validation, with no request", async () => {
    const { session } = await cold();
    const error = refusal(await callTool(session, TOOL, { group_by: [], created_between: PERIOD }));
    expect(error.code).toBe("validation");
    expect(sent()).toBe(0);
  });

  it.each([
    ["Hobby", "custom_text"],
    ["Notes", "custom_paragraph"],
    ["Subject", "default_subject"],
  ])("grouping by the free-text field %s (%s) is validation, nothing sent", async (name) => {
    const { session } = await warm();
    const error = refusal(
      await callTool(session, TOOL, { group_by: ["Status", name], created_between: PERIOD }),
    );
    expect(error.code).toBe("validation");
    expect(error.errors).toEqual([
      expect.objectContaining({ field: "group_by", code: "free_text_field" }),
    ]);
    expect(sent()).toBe(0);
  });

  it("grouping by a field of a type the code does not know is validation, nothing sent", async () => {
    const { session } = await warm();
    const error = refusal(
      await callTool(session, TOOL, { group_by: ["Mystery"], created_between: PERIOD }),
    );
    expect(error.code).toBe("validation");
    expect(error.errors).toEqual([
      expect.objectContaining({ field: "group_by", code: "unsupported_field" }),
    ]);
    expect(sent()).toBe(0);
  });

  it("a date-time field is unsupported_field, with the reason, nothing sent", async () => {
    const { session } = await warm();
    const error = refusal(
      await callTool(session, TOOL, { group_by: ["Due at"], created_between: PERIOD }),
    );
    expect(error.errors).toEqual([
      expect.objectContaining({ field: "group_by", code: "unsupported_field" }),
    ]);
    expect(error.errors?.[0]?.message).toContain("date-time");
    expect(sent()).toBe(0);
  });

  it("a requester, a company and a product are not closed types: refused, nothing sent", async () => {
    const { session } = await warm();
    for (const name of ["Requester", "Company", "Catalogue"]) {
      const error = refusal(
        await callTool(session, TOOL, { group_by: [name], created_between: PERIOD }),
      );
      expect(error.errors?.[0]?.code).toBe("unsupported_field");
    }
    expect(sent()).toBe(0);
  });

  it("an unknown field and the same field twice are validation, nothing sent", async () => {
    const { session } = await warm();
    const unknown = refusal(
      await callTool(session, TOOL, { group_by: ["Flavour"], created_between: PERIOD }),
    );
    expect(unknown.errors?.[0]?.code).toBe("unknown_field");
    const twice = refusal(
      await callTool(session, TOOL, { group_by: ["Status", "status"], created_between: PERIOD }),
    );
    expect(twice.errors?.[0]?.code).toBe("duplicate_field");
    expect(sent()).toBe(0);
  });

  it("a filter that is not valid is validation, nothing sent", async () => {
    const { session } = await warm();
    const bad = refusal(
      await callTool(session, TOOL, {
        group_by: ["Status"],
        created_between: { from: "2026-02-30", to: "2026-03-01" },
        status: "Nonesuch",
      }),
    );
    expect(bad.code).toBe("validation");
    expect(bad.errors?.map((entry) => entry.field)).toEqual(["status", "created_between"]);
    expect(sent()).toBe(0);
  });
});

describe("count_tickets: the budget", () => {
  /** 120 tickets: 4 search pages, so an estimate of 4 calls. */
  function fourPages() {
    for (let page = 1; page <= 4; page++) {
      reply(searchPath(PERIOD_QUERY, page), found(many(4000 + page * 100, 30), 120));
    }
  }

  it("an estimate over the budget is refused without confirm, after the probe only", async () => {
    const { session } = await warm({ limits: { pacing_rps: 1000, call_budget: 3 } });
    fourPages();
    const error = refusal(
      await callTool(session, TOOL, { group_by: ["Status"], created_between: PERIOD }),
    );
    expect(error.code).toBe("validation");
    expect(error.message).toContain("estimated 4 API calls");
    expect(error.message).toContain("budget of 3");
    expect(error.message).toContain("already used 1 API call");
    expect(sent()).toBe(1);
  });

  it("with confirm: true it runs, every page read", async () => {
    const { session } = await warm({ limits: { pacing_rps: 1000, call_budget: 3 } });
    fourPages();
    const result = output(
      await callTool(session, TOOL, {
        group_by: ["Status"],
        created_between: PERIOD,
        confirm: true,
      }),
    );
    expect(result.total).toBe(120);
    expect(sent()).toBe(4);
    expect(result.api_calls_used).toBe(4);
  });

  it("an estimate at exactly the budget runs", async () => {
    const { session } = await warm({ limits: { pacing_rps: 1000, call_budget: 4 } });
    fourPages();
    const result = output(
      await callTool(session, TOOL, { group_by: ["Status"], created_between: PERIOD }),
    );
    expect(result.total).toBe(120);
  });

  it("a later search page the limiter refuses: the counts so far, truncated: true", async () => {
    const { session } = await warm();
    reply(searchPath(PERIOD_QUERY, 1), found(many(4301, 30), 120));
    // Page 2's response says 10 of 100 calls are left: page 3 is refused unsent.
    reply(searchPath(PERIOD_QUERY, 2), found(many(4401, 30), 120), {
      headers: { "x-ratelimit-total": "100", "x-ratelimit-remaining": "10" },
    });
    const result = output(
      await callTool(session, TOOL, { group_by: ["Status"], created_between: PERIOD }),
    );
    expect(result.total).toBe(60);
    expect(result.truncated).toBe(true);
    expect(sent()).toBe(2);
    expect(result.api_calls_used).toBe(2);
  });

  it("starts no search page after SCAN_START_MS: truncated: true, not an error", async () => {
    const { session } = await warm();
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    // 8 s a page: page 3 ends at 24 s, past SCAN_START_MS: no page 4.
    for (let page = 1; page <= 4; page++) {
      replyTaking(searchPath(PERIOD_QUERY, page), found(many(4000 + page * 100, 30), 120), 8000);
    }
    const before = Date.now();
    const counted = output(
      await callTool(session, TOOL, { group_by: ["Status"], created_between: PERIOD }),
    );
    const ms = Date.now() - before;
    expect(counted.truncated).toBe(true);
    expect(counted.total).toBe(90);
    expect(sent()).toBe(3);
    expect(ms).toBeLessThan(30_000);
  });

  it("below the reserve the probe is refused as rate_limited: expensive, nothing sent", async () => {
    const { session } = await warm();
    // A cheap call whose response says 10 of 100 calls are left.
    reply(searchPath("status:2"), found([]), {
      headers: { "x-ratelimit-total": "100", "x-ratelimit-remaining": "10" },
    });
    await callTool(session, "list_tickets", { status: 2 });
    mock.clearCallHistory();
    const error = refusal(
      await callTool(session, TOOL, {
        group_by: ["Status"],
        created_between: PERIOD,
        confirm: true,
      }),
    );
    expect(error.code).toBe("rate_limited");
    expect(sent()).toBe(0);
  });
});

describe("count_tickets: past 300, the ordered list scan", () => {
  const over = found(many(4301, 30), 301);

  it("scans from the period's start, oldest first, checks each ticket, and stops past the period's end", async () => {
    const { session } = await warm();
    reply(searchPath(`status:2 AND ${PERIOD_QUERY}`), over);
    // Page 1: 10 created before the period (updated in it), 60 Open, 30 Closed.
    const before = (id: number) => ticket(id, { created_at: "2025-12-31T23:59:59Z" });
    reply(scanPath(1), [...many(6001, 10, before), ...many(6011, 60), ...many(6071, 30, closed)], {
      next: true,
    });
    // Page 2: 40 Open/Low in the period, then 60 created after it: the last stops the scan.
    const after = (id: number) => ticket(id, { created_at: "2026-02-01T00:00:00Z" });
    reply(scanPath(2), [...many(6101, 40, openLow), ...many(6141, 60, after)], { next: true });
    const result = output(
      await callTool(session, TOOL, {
        group_by: ["Priority"],
        created_between: PERIOD,
        status: "Open",
      }),
    );
    expect(result.groups).toEqual([
      { values: { Priority: "High" }, count: 60 },
      { values: { Priority: "Low" }, count: 40 },
    ]);
    expect(result.total).toBe(100);
    expect(result).not.toHaveProperty("truncated");
    expect(paths()).toEqual([searchPath(`status:2 AND ${PERIOD_QUERY}`), scanPath(1), scanPath(2)]);
    expect(result.api_calls_used).toBe(sent());
  });

  it("checks every search filter on the list pages: priority, group, agent, type and tag", async () => {
    const { session } = await warm();
    const query = `priority:3 AND group_id:703 AND agent_id:502 AND type:'Incident' AND tag:'sprocket' AND ${PERIOD_QUERY}`;
    reply(searchPath(query), over);
    const match = (id: number) => ticket(id, { tags: ["sprocket", "blue"] });
    reply(scanPath(1), [
      match(6001),
      match(6002),
      ticket(6003, { tags: ["sprocket"], priority: 1 }),
      ticket(6004, { tags: ["sprocket"], group_id: 701 }),
      ticket(6005, { tags: ["sprocket"], responder_id: 501 }),
      ticket(6006, { tags: ["sprocket"], type: "Question" }),
      ticket(6007, { tags: ["widget"] }),
      ticket(6008),
    ]);
    const result = output(
      await callTool(session, TOOL, {
        group_by: ["Status"],
        created_between: PERIOD,
        priority: "High",
        group: "Spanner Desk",
        agent: 502,
        type: "incident",
        tag: "sprocket",
      }),
    );
    expect(result.groups).toEqual([{ values: { Status: "Open" }, count: 2 }]);
  });

  it("an estimate from the search total over the budget is refused without confirm", async () => {
    const { session } = await warm({ limits: { pacing_rps: 1000, call_budget: 4 } });
    reply(searchPath(PERIOD_QUERY), over);
    // 1 probe + ceil(301 / 100) pages at least: 5.
    const error = refusal(
      await callTool(session, TOOL, { group_by: ["Status"], created_between: PERIOD }),
    );
    expect(error.code).toBe("validation");
    expect(error.message).toContain("estimated 5 API calls");
    expect(sent()).toBe(1);
  });

  it("a scan cut at the budget while it runs says truncated: true beside the counts", async () => {
    const { session } = await warm({ limits: { pacing_rps: 1000, call_budget: 5 } });
    reply(searchPath(PERIOD_QUERY), over);
    for (let page = 1; page <= 5; page++) {
      reply(scanPath(page), many(6000 + page * 100, LIST_PAGE_SIZE), { next: true });
    }
    const result = output(
      await callTool(session, TOOL, { group_by: ["Status"], created_between: PERIOD }),
    );
    expect(result.groups).toEqual([{ values: { Status: "Open" }, count: 400 }]);
    expect(result.truncated).toBe(true);
    expect(sent()).toBe(5);
    expect(result.api_calls_used).toBe(5);
  });

  it("with confirm: true the scan reads past the budget, to the list's end, not truncated", async () => {
    const { session } = await warm({ limits: { pacing_rps: 1000, call_budget: 3 } });
    reply(searchPath(PERIOD_QUERY), over);
    for (let page = 1; page <= 5; page++) {
      reply(scanPath(page), many(6000 + page * 100, LIST_PAGE_SIZE), { next: page < 5 });
    }
    const result = output(
      await callTool(session, TOOL, {
        group_by: ["Status"],
        created_between: PERIOD,
        confirm: true,
      }),
    );
    expect(result.total).toBe(5 * LIST_PAGE_SIZE);
    expect(result).not.toHaveProperty("truncated");
    expect(sent()).toBe(6);
  });

  it("a page that took a retry counts both requests: the scan stops at the budget, no page after", async () => {
    const { session } = await warm({ limits: { pacing_rps: 1000, call_budget: 5 } });
    reply(searchPath(PERIOD_QUERY), over);
    reply(scanPath(1), { message: "busy" }, { status: 503 });
    for (let page = 1; page <= 4; page++) {
      reply(scanPath(page), many(6000 + page * 100, LIST_PAGE_SIZE), { next: true });
    }
    const result = output(
      await callTool(session, TOOL, { group_by: ["Status"], created_between: PERIOD }),
    );
    // The probe, page 1 twice, pages 2 and 3: 5 requests, the budget.
    expect(sent()).toBe(5);
    expect(result.total).toBe(3 * LIST_PAGE_SIZE);
    expect(result.truncated).toBe(true);
    expect(result.api_calls_used).toBe(5);
  });

  it("a later page the limiter refuses: the counts so far, truncated: true", async () => {
    const { session } = await warm();
    reply(searchPath(PERIOD_QUERY), over);
    reply(scanPath(1), many(6001, LIST_PAGE_SIZE), {
      next: true,
      headers: { "x-ratelimit-total": "100", "x-ratelimit-remaining": "10" },
    });
    const result = output(
      await callTool(session, TOOL, { group_by: ["Status"], created_between: PERIOD }),
    );
    expect(result.total).toBe(LIST_PAGE_SIZE);
    expect(result.truncated).toBe(true);
    expect(sent()).toBe(2);
    expect(result.api_calls_used).toBe(sent());
  });

  it("a later page Freshdesk refuses fails the call", async () => {
    const { session } = await warm();
    reply(searchPath(PERIOD_QUERY), over);
    reply(scanPath(1), { code: "access_denied", message: "no" }, { status: 403 });
    const error = refusal(
      await callTool(session, TOOL, { group_by: ["Status"], created_between: PERIOD }),
    );
    expect(error.code).toBe("forbidden");
  });

  it("starts no page after SCAN_START_MS: slow pages end in truncated: true, not an error", async () => {
    const { session } = await warm();
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    reply(searchPath(PERIOD_QUERY), over);
    // 8 s a page: page 2 ends at 16 s, page 3 at 24 s, past SCAN_START_MS: no page 4.
    for (let page = 1; page <= 4; page++) {
      replyTaking(scanPath(page), many(6000 + page * 100, LIST_PAGE_SIZE), 8000, { next: true });
    }
    const before = Date.now();
    const counted = output(
      await callTool(session, TOOL, { group_by: ["Status"], created_between: PERIOD }),
    );
    const ms = Date.now() - before;
    expect(counted.truncated).toBe(true);
    expect(counted.total).toBe(3 * LIST_PAGE_SIZE);
    expect(sent()).toBe(4);
    expect(ms).toBeGreaterThanOrEqual(SCAN_START_MS);
    expect(ms).toBeLessThan(30_000);
  });

  /** Headers that leave the limiter's reserve far away for 300 pages. */
  const roomy = { "x-ratelimit-total": "5000", "x-ratelimit-remaining": "4900" };

  /** Pages 1–299 of one ticket each, each linking the next. */
  function pagesBeforeTheLast() {
    for (let page = 1; page < 300; page++) {
      reply(scanPath(page), [ticket(7000 + page)], { next: true, headers: roomy });
    }
  }

  it("the list's last page linking a next one is a cut: truncated: true", async () => {
    const { session } = await warm({ limits: { pacing_rps: 1000, call_budget: 1000 } });
    reply(searchPath(PERIOD_QUERY), over);
    pagesBeforeTheLast();
    reply(scanPath(300), [ticket(7300)], { next: true, headers: roomy });
    const result = output(
      await callTool(session, TOOL, { group_by: ["Status"], created_between: PERIOD }),
    );
    expect(result.total).toBe(300);
    expect(result.truncated).toBe(true);
    expect(sent()).toBe(301);
  });

  it("the list's last page full with no Link is a cut too: truncated: true", async () => {
    const { session } = await warm({ limits: { pacing_rps: 1000, call_budget: 1000 } });
    reply(searchPath(PERIOD_QUERY), over);
    pagesBeforeTheLast();
    reply(scanPath(300), many(8000, LIST_PAGE_SIZE), { headers: roomy });
    const result = output(
      await callTool(session, TOOL, { group_by: ["Status"], created_between: PERIOD }),
    );
    expect(result.total).toBe(299 + LIST_PAGE_SIZE);
    expect(result.truncated).toBe(true);
    expect(sent()).toBe(301);
  });

  it("the list's last page one short of full with no Link is the end: not truncated", async () => {
    const { session } = await warm({ limits: { pacing_rps: 1000, call_budget: 1000 } });
    reply(searchPath(PERIOD_QUERY), over);
    pagesBeforeTheLast();
    reply(scanPath(300), many(8000, LIST_PAGE_SIZE - 1), { headers: roomy });
    const result = output(
      await callTool(session, TOOL, { group_by: ["Status"], created_between: PERIOD }),
    );
    expect(result).not.toHaveProperty("truncated");
  });
});

describe("count_tickets: api_calls_used", () => {
  it("on a cold schema it equals the MockAgent count: the schema's load and a retry in it", async () => {
    const { session } = await cold();
    queueSchema();
    reply(searchPath(PERIOD_QUERY), { message: "busy" }, { status: 503 });
    reply(searchPath(PERIOD_QUERY), found([ticket(4301)]));
    const result = output(
      await callTool(session, TOOL, { group_by: ["Status"], created_between: PERIOD }),
    );
    expect(sent()).toBe(5);
    expect(result.api_calls_used).toBe(sent());
  });
});

describe("count_tickets: one 30 s deadline per call", () => {
  it("a later search page aborted at the deadline is a cut: the counts so far, truncated: true", async () => {
    const { session } = await warm();
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    reply(searchPath(PERIOD_QUERY, 1), found(many(4301, 30), 45));
    // Sent after the call started, so 30 s on is at or past its deadline.
    replyHanging(searchPath(PERIOD_QUERY, 2), 30_000);
    const counted = output(
      await callTool(session, TOOL, { group_by: ["Status"], created_between: PERIOD }),
    );
    expect(counted.total).toBe(30);
    expect(counted.truncated).toBe(true);
    // No retry of page 2 past the deadline.
    expect(sent()).toBe(2);
    expect(counted.api_calls_used).toBe(sent());
  });

  it("slow requests end the call at 30 s as network, with no request after", async () => {
    const { session } = await cold();
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    replyTaking(FIELDS, FIELDS_PAYLOAD, 9000);
    replyTaking(AGENTS, agentPages.flat(), 9000);
    replyTaking(GROUPS, groupPages.flat(), 9000);
    // Sent at 27 s: 3 s on is at or past the deadline (the call started after `before`).
    replyHanging(searchPath(PERIOD_QUERY), 3000);
    const before = Date.now();
    const result = await callTool(session, TOOL, {
      group_by: ["Status"],
      created_between: PERIOD,
    });
    const ms = Date.now() - before;
    expect(refusal(result).code).toBe("network");
    expect(ms).toBeGreaterThanOrEqual(30_000);
    expect(sent()).toBe(4);
    // Past the deadline no retry is started: a backoff (500 ms first) would show one by now.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(sent()).toBe(4);
  });
});
