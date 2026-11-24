import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";
import {
  MAX_SEARCH_PAGE,
  MAX_SEARCH_POSITION,
  SEARCH_PER_PAGE,
} from "../../../src/client/resources/search.js";
import { MAX_LIST_PAGE } from "../../../src/client/resources/tickets.js";
import { loadConfig } from "../../../src/config.js";
import type { Schema } from "../../../src/schema/index.js";
import { createServer } from "../../../src/server.js";
import { type AppContext, createContext } from "../../../src/tools/context.js";
import { CLOSE, OPEN } from "../../../src/tools/format.js";
import { listEnvelope } from "../../../src/tools/list.js";
import { ticketDetail, ticketRow } from "../../../src/tools/rows.js";
import { buildTicketQuery, type TicketFilters } from "../../../src/tools/ticket-query.js";
import {
  DETAIL_SCAN_MAX_ROWS,
  DETAIL_SCAN_PER_PAGE,
  DETAIL_VALUE_CAP,
  LIST_ROWS,
  MAX_LIST_POSITION,
  SCAN_MAX_ROWS,
  SCAN_PAGES,
  SCAN_PER_PAGE,
  SCAN_START_MS,
} from "../../../src/tools/toolsets/core/list-tickets.js";
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

// Every name, address, label and text here is invented.

const DOMAIN = "acme.freshdesk.com";
const ORIGIN = `https://${DOMAIN}`;
const JSON_TYPE = { "content-type": "application/json" };
const TOOL = "list_tickets";

const FIELDS = "/api/v2/ticket_fields";
const AGENTS = "/api/v2/agents?per_page=100";
const GROUPS = "/api/v2/groups?per_page=100";

/** The search request for `query` (the conditions, unquoted), as the client encodes it. */
function searchPath(query: string, page = 1): string {
  return `/api/v2/search/tickets?${String(new URLSearchParams({ query: `"${query}"`, page: String(page) }))}`;
}

/** The list request with these parameters, in the order the client sends them. */
function listPath(params: Record<string, string | number>): string {
  const query = new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  );
  return `/api/v2/tickets?${String(query)}`;
}

const wrapped = (text: string) => `${OPEN}${text}${CLOSE}`;

/** A ticket of the fixture schema: categorised, created and updated on 2026-01-02. */
function ticket(id: number, over: Record<string, unknown> = {}) {
  return {
    ...rawTicket,
    id,
    subject: `Sprocket report ${id}`,
    created_at: "2026-01-02T10:00:00Z",
    updated_at: "2026-01-02T11:30:00Z",
    ...over,
  };
}

/** The same, with the category's last level empty. */
function uncategorised(id: number, over: Record<string, unknown> = {}) {
  return ticket(id, { custom_fields: { ...rawTicket.custom_fields, cf_model: null }, ...over });
}

function tickets(from: number, count: number, make: typeof ticket = ticket) {
  return Array.from({ length: count }, (_, i) => make(from + i));
}

const dir = mkdtempSync(join(tmpdir(), "freshdesk-mcp-list-tickets-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let mock: MockAgent;
let servers: McpServer[];
let fileCount = 0;
let stderr: MockInstance<typeof process.stderr.write>;

beforeEach(() => {
  stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  mock = mockDispatcher();
  servers = [];
});

afterEach(async () => {
  vi.restoreAllMocks();
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

/** A session on a server from the real registry, built as cli.ts builds it; its schema not loaded. */
async function cold(team: unknown = {}): Promise<Desk> {
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

const DESCRIPTION_FIELD = {
  id: 1016,
  name: "description",
  label: "Description",
  type: "default_description",
  default: true,
};

/** How `detail: true` cuts a text value. */
const DETAIL_CUT = { cap: DETAIL_VALUE_CAP, rest: "get_ticket returns more of the text" };

function queueSchema(fields: unknown = schemaFieldsPayload) {
  reply(FIELDS, fields);
  reply(AGENTS, agentPages.flat());
  reply(GROUPS, groupPages.flat());
}

/**
 * A session whose schema is cached, the MockAgent's count back at 0: what
 * follows counts the requests of `list_tickets` alone.
 */
async function warm(
  team: unknown = {},
  fields: unknown = schemaFieldsPayload,
): Promise<Desk & { schema: Schema }> {
  const desk = await cold(team);
  queueSchema(fields);
  const loaded = await desk.context.schema.get();
  if (!loaded.ok) throw new Error("the fixture schema did not load");
  mock.clearCallHistory();
  return { ...desk, schema: loaded.schema };
}

interface Output {
  items: Record<string, unknown>[];
  has_more: boolean;
  next_cursor?: string;
  truncated?: boolean;
  api_calls_used: number;
}

function output(result: CallResult): Output {
  expect(result.isError).toBeFalsy();
  return JSON.parse(result.content[0].text) as Output;
}

function refusal(result: CallResult): { code: string; message: string; errors?: unknown[] } {
  expect(result.isError).toBe(true);
  return (
    JSON.parse(result.content[0].text) as {
      error: { code: string; message: string; errors?: unknown[] };
    }
  ).error;
}

/** What JSON makes of a value: the form a tool's output arrives in. */
function asSent<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}

/** A cursor this server would give for the tool called with `args`, at `position`. */
function cursorFor(tool: string, args: Record<string, unknown>, position: number): string {
  const built = listEnvelope({ tool, args }, { items: [], next: position, api_calls_used: 0 });
  return built.next_cursor!;
}

/** Runs the fake clock forward until the call settles; returns the fake ms it took. */
async function settle(call: Promise<CallResult>): Promise<{ result: CallResult; ms: number }> {
  const started = Date.now();
  let result: CallResult | undefined;
  void call.then((value) => {
    result = value;
  });
  while (result === undefined) {
    await new Promise((resolve) => setImmediate(resolve));
    if (result === undefined) await vi.advanceTimersByTimeAsync(100);
  }
  return { result, ms: Date.now() - started };
}

function fakeClock() {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
}

describe("list_tickets: the listing", () => {
  it("is listed read-only, with its cost, its caps and the data-not-instructions sentence", async () => {
    const tools = await listTools((await cold()).session);
    const tool = tools.find((listed) => listed.name === TOOL);
    expect(tool?.annotations.readOnlyHint).toBe(true);
    expect(tool?.annotations.destructiveHint).toBe(false);
    expect(tool?.description).toMatch(/Cost: 1 API call.*up to 10.*plus one per retry/s);
    expect(tool?.description).toContain(DATA_NOT_INSTRUCTIONS);
    expect(tool?.description).toContain("first 300");
    expect(tool?.description).toContain("truncated: true");
    expect(tool?.description).toContain("created in the last 30 days");
    expect(tool?.description).toContain("fewer rows");
    expect(tool?.description).toContain("has_more");
  });

  it("its description states the bounds of detail, of a scan and of the list", async () => {
    const tools = await listTools((await cold()).session);
    const description = tools.find((listed) => listed.name === TOOL)?.description;
    expect(SCAN_MAX_ROWS).toBe(129);
    expect(DETAIL_SCAN_MAX_ROWS).toBe(59);
    expect(DETAIL_VALUE_CAP).toBe(1000);
    expect(description).toContain("at most 129 rows, or 59 tickets with detail: true");
    expect(description).toContain("each text cut at 1,000 characters");
    expect(description).toContain("get_ticket returns more of the text");
    expect(description).toContain("300 calls (9,000 tickets)");
    expect(description).toContain("returns what it has with next_cursor");
  });

  it("its last positions are its two sources' last pages", () => {
    expect(MAX_SEARCH_POSITION).toBe(MAX_SEARCH_PAGE - 1);
    expect(MAX_LIST_POSITION).toBe(MAX_LIST_PAGE - 1);
    expect(MAX_LIST_PAGE).toBe(300);
    expect(SEARCH_PER_PAGE).toBe(30);
  });

  it("its input schema has no zod default or transform", () => {
    const source = readFileSync(
      new URL("../../../src/tools/toolsets/core/list-tickets.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("z.object(");
    expect(source).not.toContain(".default(");
    expect(source).not.toContain(".transform(");
  });
});

describe("list_tickets: the nine filters", () => {
  const cases: [string, TicketFilters][] = [
    ["status", { status: "open" }],
    ["priority", { priority: "High" }],
    ["group", { group: "Spanner Desk" }],
    ["agent", { agent: 502 }],
    ["type", { type: "incident" }],
    ["tag", { tag: "sprocket" }],
    ["uncategorized", { uncategorized: true }],
    ["updated_since", { updated_since: "2026-01-02T04:04:05+01:00" }],
    ["created_between", { created_between: { from: "2026-01-02", to: "2026-01-03" } }],
  ];

  it.each(cases)("%s sends the request T-043 builds and returns T-042's rows", async (_, args) => {
    const { session, context, schema } = await warm();
    const built = buildTicketQuery(context, schema, args);
    if (!built.ok) throw new Error("the fixture filter did not build");
    const row = uncategorised(4301);
    const expected =
      built.endpoint === "search"
        ? searchPath(built.query)
        : listPath({
            per_page: args.uncategorized === true ? SCAN_PER_PAGE : LIST_ROWS,
            page: 1,
            ...built.list,
          });
    reply(expected, built.endpoint === "search" ? found([row]) : [row]);

    const result = output(await callTool(session, TOOL, args));

    expect(paths()).toEqual([expected]);
    expect(result.items).toEqual([asSent(ticketRow(context, schema, row))]);
    expect(result.has_more).toBe(false);
    expect(result).not.toHaveProperty("next_cursor");
    expect(result).not.toHaveProperty("truncated");
  });

  it("status goes to search, at this URL", async () => {
    const { session } = await warm();
    const url = "/api/v2/search/tickets?query=%22status%3A2%22&page=1";
    reply(url, found([ticket(4301)]));
    const result = output(await callTool(session, TOOL, { status: "Open" }));
    expect(paths()).toEqual([url]);
    expect(result.items[0]).toMatchObject({
      id: 4301,
      subject: wrapped("Sprocket report 4301"),
      status: "Open",
      priority: "High",
      category: { Product: "Gadgets > Sprockets > Blue sprocket" },
      updated: "2026-01-02T11:30:00.000Z",
      agent: "Juniper Vantablack",
      group: "Spanner Desk",
    });
  });

  it("updated_since alone goes to the list endpoint, at this URL", async () => {
    const { session } = await warm();
    const url = "/api/v2/tickets?per_page=30&page=1&updated_since=2026-01-02T03%3A04%3A05Z";
    reply(url, [ticket(4301)]);
    const result = output(await callTool(session, TOOL, { updated_since: "2026-01-02T03:04:05Z" }));
    expect(paths()).toEqual([url]);
    expect(result.items.map((item) => item.id)).toEqual([4301]);
  });

  it("no filter is the list endpoint with no window parameter", async () => {
    const { session } = await warm();
    reply(listPath({ per_page: LIST_ROWS, page: 1 }), [ticket(4301), ticket(4302)]);
    const result = output(await callTool(session, TOOL, {}));
    expect(result.items.map((item) => item.id)).toEqual([4301, 4302]);
  });

  it("several filters are one search, joined by AND", async () => {
    const { session } = await warm();
    reply(searchPath("status:2 AND priority:3 AND tag:'sprocket'"), found([ticket(4301)]));
    const args = { status: 2, priority: "high", tag: "sprocket" };
    expect(output(await callTool(session, TOOL, args)).items).toHaveLength(1);
  });

  it("a field the team hides is absent from the rows", async () => {
    const { session } = await warm({ fields: { Group: { hidden: true } } });
    reply(searchPath("status:2"), found([ticket(4301)]));
    const [row] = output(await callTool(session, TOOL, { status: 2 })).items;
    expect(row).not.toHaveProperty("group");
    expect(row).toHaveProperty("agent");
  });
});

describe("list_tickets: detail", () => {
  it("detail: true returns the full labelled ticket", async () => {
    const { session, context, schema } = await warm();
    const full = ticket(4301);
    reply(searchPath("status:2"), found([full]));
    const result = output(await callTool(session, TOOL, { status: 2, detail: true }));
    expect(result.items).toEqual([asSent(ticketDetail(context, schema, full, DETAIL_CUT))]);
    expect(result.items[0]).toMatchObject({
      id: 4301,
      fields: {
        Subject: wrapped("Sprocket report 4301"),
        Status: "Open",
        Type: "Incident",
        Shelf: "North > Bottom",
        Hobby: wrapped("Kite flying"),
      },
    });
  });

  it("a 10,000-character description comes back cut at DETAIL_VALUE_CAP, with the marker", async () => {
    const { session } = await warm({}, [...schemaFieldsPayload, DESCRIPTION_FIELD]);
    const long = "s".repeat(10_000);
    const full = ticket(4301, {
      description: `<div>${long}</div>`,
      description_text: long,
      custom_fields: { ...rawTicket.custom_fields, cf_hobby: "k".repeat(1001) },
    });
    reply(searchPath("status:2"), found([full]));
    const result = output(await callTool(session, TOOL, { status: 2, detail: true }));
    const fields = result.items[0]?.fields as Record<string, unknown>;
    expect(fields.Description).toBe(
      `${wrapped("s".repeat(1000))}\n[… 9000 more characters not shown; get_ticket returns more of the text]`,
    );
    expect(fields.Hobby).toBe(
      `${wrapped("k".repeat(1000))}\n[… 1 more characters not shown; get_ticket returns more of the text]`,
    );
  });

  it("a text value of exactly DETAIL_VALUE_CAP characters is whole", async () => {
    const { session } = await warm();
    const hobby = "k".repeat(DETAIL_VALUE_CAP);
    const full = ticket(4301, { custom_fields: { ...rawTicket.custom_fields, cf_hobby: hobby } });
    reply(searchPath("status:2"), found([full]));
    const result = output(await callTool(session, TOOL, { status: 2, detail: true }));
    expect((result.items[0]?.fields as Record<string, unknown>).Hobby).toBe(wrapped(hobby));
  });

  it("detail: false returns rows", async () => {
    const { session } = await warm();
    reply(searchPath("status:2"), found([ticket(4301)]));
    const result = output(await callTool(session, TOOL, { status: 2, detail: false }));
    expect(result.items[0]).not.toHaveProperty("fields");
    expect(result.items[0]).toHaveProperty("category");
  });
});

describe("list_tickets: filters refused", () => {
  it("an unknown status name is validation, nothing sent", async () => {
    const { session } = await warm();
    const error = refusal(await callTool(session, TOOL, { status: "Levitating" }));
    expect(error.code).toBe("validation");
    expect(JSON.stringify(error.errors)).toContain("Valid status names");
    expect(sent()).toBe(0);
  });

  it("every bad filter is reported at once, nothing sent", async () => {
    const { session } = await warm();
    const args = {
      priority: "Colossal",
      tag: "it's",
      updated_since: "2026-01-02",
      created_between: { from: "2026-01-03", to: "2026-01-02" },
    };
    const error = refusal(await callTool(session, TOOL, args));
    expect(error.code).toBe("validation");
    expect(error.errors).toHaveLength(4);
    expect(sent()).toBe(0);
  });

  it("uncategorized with no category field to check is validation, nothing sent", async () => {
    const { session } = await warm({ uncategorised_fields: ["No such field"] });
    const error = refusal(await callTool(session, TOOL, { uncategorized: true }));
    expect(error.code).toBe("validation");
    expect(sent()).toBe(0);
  });
});

describe("list_tickets: the local checks (matchesLocal)", () => {
  it("created_between: the search asks exactly the days; a ticket outside them is still absent", async () => {
    const { session } = await warm();
    const args = { status: 2, created_between: { from: "2026-01-02", to: "2026-01-03" } };
    reply(
      searchPath("status:2 AND created_at:>'2026-01-02' AND created_at:<'2026-01-03'"),
      found([
        ticket(4301, { created_at: "2026-01-01T23:59:59Z" }),
        ticket(4302, { created_at: "2026-01-02T00:00:00Z" }),
        ticket(4303, { created_at: "2026-01-03T23:59:59Z" }),
        ticket(4304, { created_at: "2026-01-04T00:00:00Z" }),
        ticket(4305, { created_at: undefined }),
      ]),
    );
    const result = output(await callTool(session, TOOL, args));
    expect(result.items.map((item) => item.id)).toEqual([4302, 4303]);
    expect(result.has_more).toBe(false);
  });

  it("updated_since beside a search filter: a ticket updated before the instant is absent", async () => {
    const { session } = await warm();
    const args = { tag: "sprocket", updated_since: "2026-01-02T12:00:00Z" };
    reply(
      searchPath("tag:'sprocket' AND updated_at:>'2026-01-01'"),
      found([
        ticket(4301, { updated_at: "2026-01-01T18:00:00Z" }),
        ticket(4302, { updated_at: "2026-01-02T11:59:59Z" }),
        ticket(4303, { updated_at: "2026-01-02T12:00:00Z" }),
      ]),
    );
    const result = output(await callTool(session, TOOL, args));
    expect(result.items.map((item) => item.id)).toEqual([4303]);
  });

  it("uncategorized beside a search filter drops a categorised ticket", async () => {
    const { session } = await warm();
    reply(searchPath("status:2"), found([ticket(4301), uncategorised(4302), ticket(4303)]));
    const result = output(await callTool(session, TOOL, { status: 2, uncategorized: true }));
    expect(result.items.map((item) => item.id)).toEqual([4302]);
  });

  it("uncategorized alone drops a categorised ticket from the list page", async () => {
    const { session } = await warm();
    reply(listPath({ per_page: SCAN_PER_PAGE, page: 1 }), [
      ticket(4301),
      uncategorised(4302),
      uncategorised(4303, { custom_fields: { ...rawTicket.custom_fields, cf_model: "" } }),
    ]);
    const result = output(await callTool(session, TOOL, { uncategorized: true }));
    expect(result.items.map((item) => item.id)).toEqual([4302, 4303]);
  });

  it("uncategorized: false is no filter", async () => {
    const { session } = await warm();
    reply(listPath({ per_page: LIST_ROWS, page: 1 }), [ticket(4301), uncategorised(4302)]);
    const result = output(await callTool(session, TOOL, { uncategorized: false }));
    expect(result.items.map((item) => item.id)).toEqual([4301, 4302]);
  });

  it("a search page that loses rows to the check is short, and still says has_more", async () => {
    const { session } = await warm();
    const args = { status: 2, uncategorized: true };
    reply(
      searchPath("status:2"),
      found([uncategorised(4301), ...tickets(4302, SEARCH_PER_PAGE - 1)], SEARCH_PER_PAGE * 2),
    );
    const first = output(await callTool(session, TOOL, args));
    expect(first.items.map((item) => item.id)).toEqual([4301]);
    expect(first.has_more).toBe(true);
    expect(first.next_cursor).toBe(cursorFor(TOOL, args, 1));

    // A page with nothing left after the check is empty, not the end.
    reply(searchPath("status:2", 2), found(tickets(4401, SEARCH_PER_PAGE), SEARCH_PER_PAGE * 3));
    const second = output(await callTool(session, TOOL, { ...args, cursor: first.next_cursor }));
    expect(second.items).toEqual([]);
    expect(second.has_more).toBe(true);
    expect(second.next_cursor).toBe(cursorFor(TOOL, args, 2));
  });
});

describe("list_tickets: paging", () => {
  it("a search of two pages: next_cursor, then the rest", async () => {
    const { session } = await warm();
    const args = { status: "Open" };
    reply(searchPath("status:2"), found(tickets(4301, SEARCH_PER_PAGE), SEARCH_PER_PAGE + 1));
    const first = output(await callTool(session, TOOL, args));
    expect(first.items).toHaveLength(SEARCH_PER_PAGE);
    expect(first.has_more).toBe(true);

    reply(searchPath("status:2", 2), found([ticket(4400)], SEARCH_PER_PAGE + 1));
    const second = output(await callTool(session, TOOL, { ...args, cursor: first.next_cursor }));
    expect(second.items.map((item) => item.id)).toEqual([4400]);
    expect(second.has_more).toBe(false);
    expect(second).not.toHaveProperty("next_cursor");
    expect(sent()).toBe(2);
  });

  it("a search whose total is exactly one page has no next_cursor", async () => {
    const { session } = await warm();
    reply(searchPath("status:2"), found(tickets(4301, SEARCH_PER_PAGE)));
    const result = output(await callTool(session, TOOL, { status: 2 }));
    expect(result.has_more).toBe(false);
  });

  it("a list of two pages: next_cursor while Freshdesk links a next page", async () => {
    const { session } = await warm();
    const args = { updated_since: "2026-01-02T03:04:05Z" };
    const since = { updated_since: "2026-01-02T03:04:05Z" };
    reply(listPath({ per_page: LIST_ROWS, page: 1, ...since }), tickets(4301, LIST_ROWS), {
      next: true,
    });
    const first = output(await callTool(session, TOOL, args));
    expect(first.items).toHaveLength(LIST_ROWS);
    expect(first.next_cursor).toBe(cursorFor(TOOL, args, 1));

    reply(listPath({ per_page: LIST_ROWS, page: 2, ...since }), [ticket(4400)]);
    const second = output(await callTool(session, TOOL, { ...args, cursor: first.next_cursor }));
    expect(second.items.map((item) => item.id)).toEqual([4400]);
    expect(second.has_more).toBe(false);
    expect(sent()).toBe(2);
  });
});

describe("list_tickets: the uncategorized scan", () => {
  const page = (n: number) => listPath({ per_page: SCAN_PER_PAGE, page: n });

  it("reads list pages until the list ends, each request counted", async () => {
    const { session } = await warm();
    reply(page(1), [uncategorised(4301), ...tickets(4302, 3)], { next: true });
    reply(page(2), [...tickets(4401, 2), uncategorised(4403)]);
    const result = output(await callTool(session, TOOL, { uncategorized: true }));
    expect(result.items.map((item) => item.id)).toEqual([4301, 4403]);
    expect(result.has_more).toBe(false);
    expect(result).not.toHaveProperty("truncated");
    expect(paths()).toEqual([page(1), page(2)]);
    expect(result.api_calls_used).toBe(2);
  });

  it("stops once it holds a page of rows, and the cursor resumes at the next list page", async () => {
    const { session } = await warm();
    const args = { uncategorized: true };
    reply(page(1), tickets(4301, LIST_ROWS, uncategorised), { next: true });
    const first = output(await callTool(session, TOOL, args));
    expect(first.items).toHaveLength(LIST_ROWS);
    expect(first.next_cursor).toBe(cursorFor(TOOL, args, 1));
    expect(sent()).toBe(1);

    reply(page(2), [uncategorised(4400)]);
    const second = output(await callTool(session, TOOL, { ...args, cursor: first.next_cursor }));
    expect(second.items.map((item) => item.id)).toEqual([4400]);
    expect(second.has_more).toBe(false);
  });

  it("with updated_since it scans the list from that instant", async () => {
    const { session } = await warm();
    const since = "2026-01-02T03:04:05Z";
    const url = listPath({ per_page: SCAN_PER_PAGE, page: 1, updated_since: since });
    reply(url, [ticket(4301), uncategorised(4302)]);
    const args = { uncategorized: true, updated_since: since };
    const result = output(await callTool(session, TOOL, args));
    expect(result.items.map((item) => item.id)).toEqual([4302]);
    expect(paths()).toEqual([url]);
  });

  it("scans at most SCAN_PAGES list pages a call, then gives the cursor of the next", async () => {
    const { session } = await warm();
    const args = { uncategorized: true };
    fakeClock();
    try {
      for (let n = 1; n <= SCAN_PAGES + 1; n++) reply(page(n), [ticket(4300 + n)], { next: true });
      const { result } = await settle(callTool(session, TOOL, args));
      const first = output(result);
      expect(first.items).toEqual([]);
      expect(first.has_more).toBe(true);
      expect(first.next_cursor).toBe(cursorFor(TOOL, args, SCAN_PAGES));
      expect(first.api_calls_used).toBe(SCAN_PAGES);
      expect(sent()).toBe(SCAN_PAGES);
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts no list page after SCAN_START_MS: slow pages end the call early, not in an error", async () => {
    const { session } = await warm();
    const args = { uncategorized: true };
    fakeClock();
    try {
      // 8 s a page: the second ends at 16 s, past SCAN_START_MS, so no third.
      for (let n = 1; n <= 4; n++)
        reply(page(n), [uncategorised(4300 + n)], { next: true }).delay(8000);
      const { result, ms } = await settle(callTool(session, TOOL, args));
      const first = output(result);
      expect(first.items.map((item) => item.id)).toEqual([4301, 4302]);
      expect(first.next_cursor).toBe(cursorFor(TOOL, args, 2));
      expect(ms).toBeGreaterThanOrEqual(SCAN_START_MS);
      expect(ms).toBeLessThan(30_000);
      expect(sent()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a later page Freshdesk refuses fails the call: no partial list", async () => {
    const { session } = await warm();
    reply(page(1), [uncategorised(4301)], { next: true });
    reply(page(2), { code: "access_denied", message: "no" }, { status: 403 });
    const result = await callTool(session, TOOL, { uncategorized: true });
    expect(refusal(result).code).toBe("forbidden");
    expect(result.content[0].text).not.toContain("4301");
    expect(sent()).toBe(2);
  });

  const LOW = { "x-ratelimit-total": "100", "x-ratelimit-remaining": "10" };
  const HIGH = { "x-ratelimit-total": "100", "x-ratelimit-remaining": "90" };

  it("a later page the limiter refuses: the rows so far, the cursor at that page, and the next call starts there", async () => {
    const { session } = await warm();
    const args = { uncategorized: true };
    // Page 1's response says 10 of 100 calls are left: page 2 is refused unsent.
    reply(page(1), [uncategorised(4301), ticket(4302)], { next: true, headers: LOW });
    const first = output(await callTool(session, TOOL, args));
    expect(first.items.map((item) => item.id)).toEqual([4301]);
    expect(first.has_more).toBe(true);
    expect(first.next_cursor).toBe(cursorFor(TOOL, args, 1));
    expect(first).not.toHaveProperty("truncated");
    expect(sent()).toBe(1);
    expect(first.api_calls_used).toBe(sent());

    // A cheap call's response restores the budget.
    reply(searchPath("status:2"), found([]), { headers: HIGH });
    output(await callTool(session, TOOL, { status: 2 }));
    mock.clearCallHistory();
    reply(page(2), [uncategorised(4401)]);
    const second = output(await callTool(session, TOOL, { ...args, cursor: first.next_cursor }));
    expect(second.items.map((item) => item.id)).toEqual([4401]);
    expect(second.has_more).toBe(false);
    expect(paths()).toEqual([page(2)]);
  });

  it("a later page sent once, then refused by the limiter on its retry, is counted", async () => {
    const { session } = await warm();
    const args = { uncategorized: true };
    reply(page(1), [uncategorised(4301)], { next: true });
    reply(page(2), { message: "busy" }, { status: 503, headers: LOW });
    const result = output(await callTool(session, TOOL, args));
    expect(result.items.map((item) => item.id)).toEqual([4301]);
    expect(result.next_cursor).toBe(cursorFor(TOOL, args, 1));
    expect(sent()).toBe(2);
    expect(result.api_calls_used).toBe(sent());
  });

  it("the first page refused by the limiter fails the call", async () => {
    const { session } = await warm();
    reply(searchPath("status:2"), found([]), { headers: LOW });
    output(await callTool(session, TOOL, { status: 2 }));
    const cursor = cursorFor(TOOL, { uncategorized: true }, 4);
    const error = refusal(await callTool(session, TOOL, { uncategorized: true, cursor }));
    expect(error.code).toBe("rate_limited");
    expect(sent()).toBe(1);
  });

  it("Freshdesk's 429 on a later page: the limiter holds the retry, so the rows so far come back, the 429 counted", async () => {
    const { session } = await warm();
    const args = { uncategorized: true };
    reply(page(1), [uncategorised(4301)], { next: true });
    reply(page(2), { message: "slow down" }, { status: 429, headers: { "retry-after": "60" } });
    const result = output(await callTool(session, TOOL, args));
    expect(result.items.map((item) => item.id)).toEqual([4301]);
    expect(result.next_cursor).toBe(cursorFor(TOOL, args, 1));
    expect(sent()).toBe(2);
    expect(result.api_calls_used).toBe(sent());
  });

  it("holding 29 rows it reads one more page: at most SCAN_MAX_ROWS rows", async () => {
    const { session } = await warm();
    reply(
      page(1),
      [...tickets(4301, LIST_ROWS - 1, uncategorised), ...tickets(4401, SCAN_PER_PAGE - 29)],
      { next: true },
    );
    reply(page(2), tickets(4501, SCAN_PER_PAGE, uncategorised), { next: true });
    const result = output(await callTool(session, TOOL, { uncategorized: true }));
    expect(result.items).toHaveLength(SCAN_MAX_ROWS);
    expect(result.has_more).toBe(true);
    expect(sent()).toBe(2);
  });

  it("with detail: true it reads pages of 30: at most DETAIL_SCAN_MAX_ROWS tickets", async () => {
    const { session } = await warm();
    const args = { uncategorized: true, detail: true };
    const small = (n: number) => listPath({ per_page: DETAIL_SCAN_PER_PAGE, page: n });
    reply(small(1), [...tickets(4301, LIST_ROWS - 1, uncategorised), ticket(4401)], {
      next: true,
    });
    reply(small(2), tickets(4501, DETAIL_SCAN_PER_PAGE, uncategorised), { next: true });
    const result = output(await callTool(session, TOOL, args));
    expect(DETAIL_SCAN_PER_PAGE).toBe(30);
    expect(result.items).toHaveLength(DETAIL_SCAN_MAX_ROWS);
    expect(result.items[0]).toHaveProperty("fields");
    expect(result.next_cursor).toBe(cursorFor(TOOL, args, 2));
    expect(paths()).toEqual([small(1), small(2)]);
  });
});

describe("list_tickets: the cost class", () => {
  /** A cheap call whose response says 10 of 100 calls are left: under the 20% reserve. */
  async function drained(session: Session) {
    reply(searchPath("status:2"), found([]), {
      headers: { "x-ratelimit-total": "100", "x-ratelimit-remaining": "10" },
    });
    output(await callTool(session, TOOL, { status: 2 }));
    mock.clearCallHistory();
  }

  it("the uncategorized scan is expensive: refused below the reserve, nothing sent", async () => {
    const { session } = await warm();
    await drained(session);
    const error = refusal(await callTool(session, TOOL, { uncategorized: true }));
    expect(error.code).toBe("rate_limited");
    expect(sent()).toBe(0);
  });

  it("a search, a plain list and uncategorized beside a search filter are cheap: sent below the reserve", async () => {
    const { session } = await warm();
    await drained(session);
    reply(searchPath("status:2"), found([]));
    reply(listPath({ per_page: LIST_ROWS, page: 1 }), []);
    reply(searchPath("status:2"), found([]));
    output(await callTool(session, TOOL, { status: 2 }));
    output(await callTool(session, TOOL, {}));
    output(await callTool(session, TOOL, { status: 2, uncategorized: true }));
    expect(sent()).toBe(3);
  });
});

describe("list_tickets: truncated", () => {
  it("a search total over the 300-result cap says truncated: true on every page", async () => {
    const { session } = await warm();
    const args = { status: 2 };
    const cap = MAX_SEARCH_PAGE * SEARCH_PER_PAGE;
    reply(searchPath("status:2"), found(tickets(4301, SEARCH_PER_PAGE), cap + 1));
    const first = output(await callTool(session, TOOL, args));
    expect(first.truncated).toBe(true);
    expect(first.has_more).toBe(true);

    reply(searchPath("status:2", MAX_SEARCH_PAGE), found(tickets(4401, SEARCH_PER_PAGE), cap + 1));
    const cursor = cursorFor(TOOL, args, MAX_SEARCH_POSITION);
    const last = output(await callTool(session, TOOL, { ...args, cursor }));
    expect(last.items).toHaveLength(SEARCH_PER_PAGE);
    expect(last.truncated).toBe(true);
    expect(last.has_more).toBe(false);
    expect(last).not.toHaveProperty("next_cursor");
  });

  it("a search total of exactly the cap is not truncated", async () => {
    const { session } = await warm();
    const args = { status: 2 };
    const cap = MAX_SEARCH_PAGE * SEARCH_PER_PAGE;
    reply(searchPath("status:2", MAX_SEARCH_PAGE), found(tickets(4401, SEARCH_PER_PAGE), cap));
    const cursor = cursorFor(TOOL, args, MAX_SEARCH_POSITION);
    const last = output(await callTool(session, TOOL, { ...args, cursor }));
    expect(last).not.toHaveProperty("truncated");
    expect(last.has_more).toBe(false);
  });

  it("a dated search over the cap is truncated, whatever the local check keeps", async () => {
    const { session } = await warm();
    const args = { status: 2, created_between: { from: "2026-01-02", to: "2026-01-02" } };
    reply(
      searchPath("status:2 AND created_at:>'2026-01-02' AND created_at:<'2026-01-02'"),
      found([ticket(4301), ticket(4302, { created_at: "2026-01-03T00:00:00Z" })], 301),
    );
    const result = output(await callTool(session, TOOL, args));
    expect(result.items.map((item) => item.id)).toEqual([4301]);
    expect(result.truncated).toBe(true);
    expect(result.has_more).toBe(true);
  });

  it("a list cut at Freshdesk's last page says truncated: true and gives no cursor", async () => {
    const { session } = await warm();
    reply(listPath({ per_page: LIST_ROWS, page: MAX_LIST_PAGE }), [ticket(4301)], { next: true });
    const cursor = cursorFor(TOOL, {}, MAX_LIST_POSITION);
    const result = output(await callTool(session, TOOL, { cursor }));
    expect(result.items.map((item) => item.id)).toEqual([4301]);
    expect(result.truncated).toBe(true);
    expect(result.has_more).toBe(false);
    expect(result).not.toHaveProperty("next_cursor");
  });

  it("a scan cut at Freshdesk's last list page says truncated: true", async () => {
    const { session } = await warm();
    const args = { uncategorized: true };
    reply(listPath({ per_page: SCAN_PER_PAGE, page: MAX_LIST_PAGE }), [ticket(4301)], {
      next: true,
    });
    const cursor = cursorFor(TOOL, args, MAX_LIST_POSITION);
    const result = output(await callTool(session, TOOL, { ...args, cursor }));
    expect(result.items).toEqual([]);
    expect(result.truncated).toBe(true);
    expect(result.has_more).toBe(false);
  });

  it("a full last page with no Link is truncated too: the list and the scan", async () => {
    const { session } = await warm();
    reply(listPath({ per_page: LIST_ROWS, page: MAX_LIST_PAGE }), tickets(4301, LIST_ROWS));
    const listed = output(
      await callTool(session, TOOL, { cursor: cursorFor(TOOL, {}, MAX_LIST_POSITION) }),
    );
    expect(listed.items).toHaveLength(LIST_ROWS);
    expect(listed.truncated).toBe(true);
    expect(listed.has_more).toBe(false);

    const args = { uncategorized: true };
    reply(listPath({ per_page: SCAN_PER_PAGE, page: MAX_LIST_PAGE }), tickets(4401, SCAN_PER_PAGE));
    const cursor = cursorFor(TOOL, args, MAX_LIST_POSITION);
    const scanned = output(await callTool(session, TOOL, { ...args, cursor }));
    expect(scanned.truncated).toBe(true);
    expect(scanned.has_more).toBe(false);
  });

  it("a last page one short of full, with no Link, is the end: not truncated", async () => {
    const { session } = await warm();
    reply(listPath({ per_page: LIST_ROWS, page: MAX_LIST_PAGE }), tickets(4301, LIST_ROWS - 1));
    const result = output(
      await callTool(session, TOOL, { cursor: cursorFor(TOOL, {}, MAX_LIST_POSITION) }),
    );
    expect(result).not.toHaveProperty("truncated");
    expect(result.has_more).toBe(false);
  });

  it("a full page before the last, with no Link, is the end: not truncated", async () => {
    const { session } = await warm();
    reply(listPath({ per_page: LIST_ROWS, page: 1 }), tickets(4301, LIST_ROWS));
    const result = output(await callTool(session, TOOL, {}));
    expect(result).not.toHaveProperty("truncated");
    expect(result.has_more).toBe(false);
  });
});

describe("list_tickets: the cursor", () => {
  it("a cursor from another call is refused, nothing sent", async () => {
    const { session } = await cold();
    for (const cursor of [
      cursorFor("list_agents", {}, 0),
      cursorFor(TOOL, { status: 5 }, 1),
      cursorFor(TOOL, { status: 2, detail: true }, 1),
      cursorFor(TOOL, {}, 1),
    ]) {
      const error = refusal(await callTool(session, TOOL, { status: 2, cursor }));
      expect(error.code).toBe("validation");
    }
    expect(sent()).toBe(0);
  });

  it("a search cursor over the arguments as sent, at its maxPosition, is accepted", async () => {
    const args = { status: 2, detail: false };
    const { session } = await warm();
    reply(searchPath("status:2", MAX_SEARCH_PAGE), found([ticket(4301)], 271));
    const cursor = cursorFor(TOOL, args, MAX_SEARCH_POSITION);
    const result = output(await callTool(session, TOOL, { ...args, cursor }));
    expect(result.items.map((item) => item.id)).toEqual([4301]);
    expect(result.api_calls_used).toBe(sent());
  });

  it("a list cursor over the arguments as sent, at its maxPosition, is accepted", async () => {
    const args = { updated_since: "2026-01-02T03:04:05Z", uncategorized: false };
    const { session } = await warm();
    reply(
      listPath({ per_page: LIST_ROWS, page: MAX_LIST_PAGE, updated_since: args.updated_since }),
      [ticket(4301)],
    );
    const cursor = cursorFor(TOOL, args, MAX_LIST_POSITION);
    const result = output(await callTool(session, TOOL, { ...args, cursor }));
    expect(result.items.map((item) => item.id)).toEqual([4301]);
    expect(result.api_calls_used).toBe(sent());
  });

  it.each([
    ["status", { status: 2 }],
    ["priority", { priority: 3 }],
    ["group", { group: 703 }],
    ["agent", { agent: 502 }],
    ["type", { type: "Incident" }],
    ["tag", { tag: "sprocket" }],
    ["created_between", { created_between: { from: "2026-01-02", to: "2026-01-03" } }],
  ])("%s is a search filter: a cursor at position 10 is refused, nothing sent", async (_, args) => {
    expect(MAX_SEARCH_POSITION).toBe(9);
    const cursor = cursorFor(TOOL, args, 10);
    const error = refusal(await callTool((await cold()).session, TOOL, { ...args, cursor }));
    expect(error.code).toBe("validation");
    expect(error.message).toContain("points past the last position");
    expect(sent()).toBe(0);
  });

  it.each([
    ["a search", { status: 2 }, MAX_SEARCH_POSITION],
    ["a search with a date", { tag: "sprocket", updated_since: "2026-01-02T03:04:05Z" }, 9],
    ["a list", {}, MAX_LIST_POSITION],
    ["a scan", { uncategorized: true, updated_since: "2026-01-02T03:04:05Z" }, 299],
  ])("%s cursor at maxPosition + 1 is refused, nothing sent", async (_, args, max) => {
    const cursor = cursorFor(TOOL, args, max + 1);
    const error = refusal(await callTool((await cold()).session, TOOL, { ...args, cursor }));
    expect(error.code).toBe("validation");
    expect(error.message).toContain("points past the last position");
    expect(sent()).toBe(0);
  });
});

describe("list_tickets: api_calls_used", () => {
  it("equals the MockAgent count, a retried request included", async () => {
    const { session } = await warm();
    reply(searchPath("status:2"), { message: "busy" }, { status: 503 });
    reply(searchPath("status:2"), found([ticket(4301)]));
    const result = output(await callTool(session, TOOL, { status: 2 }));
    expect(sent()).toBe(2);
    expect(result.api_calls_used).toBe(sent());
  });

  it("on a cold schema it equals the MockAgent count: the schema's load is in it", async () => {
    const { session } = await cold();
    queueSchema();
    reply(listPath({ per_page: LIST_ROWS, page: 1 }), [ticket(4301)]);
    const first = output(await callTool(session, TOOL, {}));
    expect(sent()).toBe(4);
    expect(first.api_calls_used).toBe(sent());

    reply(listPath({ per_page: LIST_ROWS, page: 1 }), [ticket(4301)]);
    const second = output(await callTool(session, TOOL, {}));
    expect(second.api_calls_used).toBe(1);
    expect(sent()).toBe(5);
  });
});

describe("list_tickets: errors", () => {
  it("Freshdesk's 400 to a search comes back as validation", async () => {
    const { session } = await warm();
    reply(
      searchPath("status:2"),
      {
        description: "Validation failed",
        errors: [{ field: "query", message: "bad", code: "invalid_value" }],
      },
      { status: 400 },
    );
    expect(refusal(await callTool(session, TOOL, { status: 2 })).code).toBe("validation");
  });

  it("a failed schema load fails the call, no ticket request sent", async () => {
    const { session } = await cold();
    reply(FIELDS, { code: "access_denied", message: "no" }, { status: 403 });
    const error = refusal(await callTool(session, TOOL, { status: 2 }));
    expect(error.code).toBe("forbidden");
    expect(paths().some((path) => path.includes("/tickets"))).toBe(false);
  });
});

describe("list_tickets: stderr", () => {
  it("no stderr line contains a fixture body string", async () => {
    const { session } = await warm();
    reply(searchPath("tag:'sprocket'"), found([ticket(4301)]));
    reply(listPath({ per_page: LIST_ROWS, page: 1 }), [ticket(4302)]);
    output(await callTool(session, TOOL, { tag: "sprocket", detail: true }));
    output(await callTool(session, TOOL, {}));

    const written = stderr.mock.calls.map((call) => String(call[0]));
    // Positive control: the spy sees the client's lines, one per request.
    expect(written).toContainEqual(expect.stringMatching(/^GET \/search\/tickets 200 \d+ms\n$/));
    expect(written).toContainEqual(expect.stringMatching(/^GET \/tickets 200 \d+ms\n$/));
    const lines = written.join("\n");
    for (const text of ["Sprocket report", "sprocket", "Kite flying", "Blue sprocket"]) {
      expect(lines).not.toContain(text);
    }
  });
});

describe("list_tickets: one 30 s deadline per call", () => {
  it("slow requests end the call at 30 s as network, with no request after", async () => {
    const { session } = await cold();
    fakeClock();
    try {
      // Each request takes 9 s, under one attempt's 10 s: the search would end
      // at 36 s, so with 30 s of its own, after the schema's load, it would succeed.
      reply(FIELDS, schemaFieldsPayload).delay(9000);
      reply(AGENTS, agentPages.flat()).delay(9000);
      reply(GROUPS, groupPages.flat()).delay(9000);
      reply(searchPath("status:2"), found([ticket(4301)])).delay(9000);

      const { result, ms } = await settle(callTool(session, TOOL, { status: 2 }));

      expect(refusal(result).code).toBe("network");
      expect(ms).toBeLessThanOrEqual(30_000);
      expect(sent()).toBe(4);
      await vi.advanceTimersByTimeAsync(120_000);
      expect(sent()).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });
});
