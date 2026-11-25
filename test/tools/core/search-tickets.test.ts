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
  MAX_QUERY_LENGTH,
  MAX_SEARCH_PAGE,
  MAX_SEARCH_POSITION,
  SEARCH_PER_PAGE,
} from "../../../src/client/resources/search.js";
import { loadConfig } from "../../../src/config.js";
import type { Schema } from "../../../src/schema/index.js";
import { createServer } from "../../../src/server.js";
import { type AppContext, createContext } from "../../../src/tools/context.js";
import { CLOSE, OPEN } from "../../../src/tools/format.js";
import { listEnvelope } from "../../../src/tools/list.js";
import { ticketRow } from "../../../src/tools/rows.js";
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

// Every name, address, label and text here is invented.

const DOMAIN = "acme.freshdesk.com";
const ORIGIN = `https://${DOMAIN}`;
const JSON_TYPE = { "content-type": "application/json" };
const TOOL = "search_tickets";

const FIELDS = "/api/v2/ticket_fields";
const AGENTS = "/api/v2/agents?per_page=100";
const GROUPS = "/api/v2/groups?per_page=100";

const QUERY = "status:2 AND cf_model:'Blue sprocket'";
const CAP = MAX_SEARCH_PAGE * SEARCH_PER_PAGE;

/** The search request for `query` (the conditions, unquoted), as the client encodes it. */
function searchPath(query: string, page = 1): string {
  return `/api/v2/search/tickets?${String(new URLSearchParams({ query: `"${query}"`, page: String(page) }))}`;
}

const wrapped = (text: string) => `${OPEN}${text}${CLOSE}`;

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

function tickets(from: number, count: number) {
  return Array.from({ length: count }, (_, i) => ticket(from + i));
}

const dir = mkdtempSync(join(tmpdir(), "freshdesk-mcp-search-tickets-"));
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

function reply(path: string, body: unknown, status = 200) {
  return mock
    .get(ORIGIN)
    .intercept({ path, method: "GET" })
    .reply(status, body as object, { headers: JSON_TYPE });
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

function queueSchema() {
  reply(FIELDS, schemaFieldsPayload);
  reply(AGENTS, agentPages.flat());
  reply(GROUPS, groupPages.flat());
}

/** A session whose schema is cached, the MockAgent's count back at 0. */
async function warm(team: unknown = {}): Promise<Desk & { schema: Schema }> {
  const desk = await cold(team);
  queueSchema();
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

interface Refusal {
  code: string;
  message: string;
  http_status: number | null;
  errors?: unknown[];
  note?: string;
}

function refusal(result: CallResult): Refusal {
  expect(result.isError).toBe(true);
  return (JSON.parse(result.content[0].text) as { error: Refusal }).error;
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

describe("search_tickets: the listing", () => {
  it("is listed read-only, with its cost and the data-not-instructions sentence", async () => {
    const tools = await listTools((await cold()).session);
    const tool = tools.find((listed) => listed.name === TOOL);
    expect(tool?.annotations.readOnlyHint).toBe(true);
    expect(tool?.annotations.destructiveHint).toBe(false);
    expect(tool?.description).toMatch(/Cost: 1 API call.*plus one per retry/s);
    expect(tool?.description).toContain(DATA_NOT_INSTRUCTIONS);
  });

  it("its description names the 300-result cap, no full text and how the query is written", async () => {
    const tools = await listTools((await cold()).session);
    const description = tools.find((listed) => listed.name === TOOL)?.description;
    expect(CAP).toBe(300);
    expect(description).toContain("first 300");
    expect(description).toContain("truncated: true");
    expect(description).toContain("no full text");
    expect(description).toContain("it is refused and no search is sent");
    expect(description).toContain(
      "a nested (dependent) field, at any level, is not searchable (Freshdesk answers 400)",
    );
    expect(description).toContain("plain dropdown");
    expect(description).toContain("single quotes");
    expect(description).toContain('no double quote (") and no backslash (\\)');
    expect(description).toContain(`${MAX_QUERY_LENGTH - 2} characters`);
    expect(description).toContain("has_more");
    // T-055, measured 2026-11-24: the day given is kept, and it is the UTC day.
    expect(description).toContain(
      "on created_at, :> and :< keep the day given (inclusive) and the day is the UTC day (measured 2026-11-24)",
    );
    expect(description).toContain(
      "for any other date field (updated_at, due_by, fr_due_by, custom dates) the rule is not measured, so widen the range by a day",
    );
    // Widening is advised for the unmeasured fields only.
    expect(description?.match(/widen/gi)).toHaveLength(1);
  });

  it("its input schema has no zod default or transform", () => {
    const source = readFileSync(
      new URL("../../../src/tools/toolsets/core/search-tickets.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("z.object(");
    expect(source).not.toContain(".default(");
    expect(source).not.toContain(".transform(");
  });
});

describe("search_tickets: the query", () => {
  it("reaches /search/tickets unchanged, at this URL", async () => {
    const { session } = await warm();
    const url =
      "/api/v2/search/tickets?query=%22status%3A2+AND+cf_model%3A%27Blue+sprocket%27%22&page=1";
    expect(searchPath(QUERY)).toBe(url);
    reply(url, found([ticket(4301)]));
    output(await callTool(session, TOOL, { query: QUERY }));
    expect(paths()).toEqual([url]);
  });

  it.each([
    ["spaces at both ends", "  status:2  "],
    ["lower-case operators and parentheses", "(status:2 or status:3) and priority:>2"],
    ["a field the team hides", "group_id:703"],
    ["a name that is no field", "no_such_field:'x'"],
    ["non-ASCII text", "tag:'caffè ☕'"],
  ])("%s is sent as written", async (_, query) => {
    const { session } = await warm({ fields: { Group: { hidden: true } } });
    reply(searchPath(query), found([]));
    const result = output(await callTool(session, TOOL, { query }));
    expect(paths()).toEqual([searchPath(query)]);
    expect(result.items).toEqual([]);
  });

  it.each([
    ["a double quote", `status:2 AND tag:"sprocket"`],
    ["a backslash", "tag:'sprocket\\'"],
    ["an empty query", ""],
    ["a blank query", "   "],
    ["a query over the length limit", `tag:'${"s".repeat(MAX_QUERY_LENGTH)}'`],
  ])("%s is validation naming the parameter, nothing sent", async (_, query) => {
    const { session } = await warm();
    const error = refusal(await callTool(session, TOOL, { query }));
    expect(error.code).toBe("validation");
    expect(error.http_status).toBeNull();
    expect(error.message).toContain("query");
    expect(error.message).not.toContain("sprocket");
    expect(sent()).toBe(0);
  });

  it("a refused query on a cold schema sends the schema's 3 requests and no search", async () => {
    const { session } = await cold();
    queueSchema();
    const error = refusal(await callTool(session, TOOL, { query: 'tag:"sprocket"' }));
    expect(error.code).toBe("validation");
    expect(error.message).toContain("query");
    expect(sent()).toBe(3);
    expect(paths().some((path) => path.includes("/search/"))).toBe(false);
  });

  it("the longest query the client takes is sent", async () => {
    const { session } = await warm();
    const query = `tag:'${"s".repeat(MAX_QUERY_LENGTH - 2 - 6)}'`;
    expect(query).toHaveLength(MAX_QUERY_LENGTH - 2);
    reply(searchPath(query), found([]));
    output(await callTool(session, TOOL, { query }));
    expect(sent()).toBe(1);
  });

  it("a call without a query is refused, nothing sent", async () => {
    const { session } = await warm();
    const result = await callTool(session, TOOL, {});
    expect(result.isError).toBe(true);
    expect(sent()).toBe(0);
  });
});

describe("search_tickets: the rows, in the list envelope", () => {
  it("each result is T-042's row", async () => {
    const { session, context, schema } = await warm();
    const results = [ticket(4301), ticket(4302, { priority: 1, responder_id: null })];
    reply(searchPath(QUERY), found(results));
    const result = output(await callTool(session, TOOL, { query: QUERY }));
    expect(result).toEqual({
      items: results.map((row) => asSent(ticketRow(context, schema, row))),
      has_more: false,
      api_calls_used: 1,
    });
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

  it("no result is an empty list, not an error", async () => {
    const { session } = await warm();
    reply(searchPath(QUERY), found([]));
    expect(output(await callTool(session, TOOL, { query: QUERY }))).toEqual({
      items: [],
      has_more: false,
      api_calls_used: 1,
    });
  });

  it("a field the team hides is absent from the rows, though the query may name it", async () => {
    const { session } = await warm({ fields: { Group: { hidden: true } } });
    reply(searchPath("group_id:703"), found([ticket(4301)]));
    const [row] = output(await callTool(session, TOOL, { query: "group_id:703" })).items;
    expect(row).not.toHaveProperty("group");
    expect(row).toHaveProperty("agent");
  });
});

describe("search_tickets: paging", () => {
  it("two pages: next_cursor, then the rest", async () => {
    const { session } = await warm();
    const args = { query: QUERY };
    reply(searchPath(QUERY), found(tickets(4301, SEARCH_PER_PAGE), SEARCH_PER_PAGE + 1));
    const first = output(await callTool(session, TOOL, args));
    expect(first.items).toHaveLength(SEARCH_PER_PAGE);
    expect(first.has_more).toBe(true);
    expect(first.next_cursor).toBe(cursorFor(TOOL, args, 1));
    expect(first).not.toHaveProperty("truncated");

    reply(searchPath(QUERY, 2), found([ticket(4400)], SEARCH_PER_PAGE + 1));
    const second = output(await callTool(session, TOOL, { ...args, cursor: first.next_cursor }));
    expect(second.items.map((item) => item.id)).toEqual([4400]);
    expect(second.has_more).toBe(false);
    expect(second).not.toHaveProperty("next_cursor");
    expect(paths()).toEqual([searchPath(QUERY), searchPath(QUERY, 2)]);
  });

  it("a total of exactly one page has no next_cursor", async () => {
    const { session } = await warm();
    reply(searchPath(QUERY), found(tickets(4301, SEARCH_PER_PAGE)));
    const result = output(await callTool(session, TOOL, { query: QUERY }));
    expect(result.has_more).toBe(false);
    expect(result).not.toHaveProperty("next_cursor");
  });

  it("has_more is the total's, not the row count's: a short page before the end still has more", async () => {
    const { session } = await warm();
    reply(searchPath(QUERY), found([ticket(4301)], SEARCH_PER_PAGE + 1));
    const result = output(await callTool(session, TOOL, { query: QUERY }));
    expect(result.items).toHaveLength(1);
    expect(result.has_more).toBe(true);
  });
});

describe("search_tickets: truncated", () => {
  it("a total over the 300-result cap says truncated: true on every page", async () => {
    const { session } = await warm();
    const args = { query: QUERY };
    reply(searchPath(QUERY), found(tickets(4301, SEARCH_PER_PAGE), CAP + 1));
    const first = output(await callTool(session, TOOL, args));
    expect(first.truncated).toBe(true);
    expect(first.has_more).toBe(true);

    reply(searchPath(QUERY, MAX_SEARCH_PAGE), found(tickets(4401, SEARCH_PER_PAGE), CAP + 1));
    const cursor = cursorFor(TOOL, args, MAX_SEARCH_POSITION);
    const last = output(await callTool(session, TOOL, { ...args, cursor }));
    expect(last.items).toHaveLength(SEARCH_PER_PAGE);
    expect(last.truncated).toBe(true);
    expect(last.has_more).toBe(false);
    expect(last).not.toHaveProperty("next_cursor");
  });

  it("a total of exactly the cap is not truncated", async () => {
    const { session } = await warm();
    const args = { query: QUERY };
    reply(searchPath(QUERY), found(tickets(4301, SEARCH_PER_PAGE), CAP));
    expect(output(await callTool(session, TOOL, args))).not.toHaveProperty("truncated");

    reply(searchPath(QUERY, MAX_SEARCH_PAGE), found(tickets(4401, SEARCH_PER_PAGE), CAP));
    const cursor = cursorFor(TOOL, args, MAX_SEARCH_POSITION);
    const last = output(await callTool(session, TOOL, { ...args, cursor }));
    expect(last).not.toHaveProperty("truncated");
    expect(last.has_more).toBe(false);
  });
});

describe("search_tickets: the cursor", () => {
  it("a cursor from another call is refused, nothing sent", async () => {
    const { session } = await cold();
    for (const cursor of [
      cursorFor("list_tickets", { query: QUERY }, 1),
      cursorFor(TOOL, { query: "status:3" }, 1),
      cursorFor(TOOL, { query: `${QUERY} ` }, 1),
      cursorFor(TOOL, {}, 1),
    ]) {
      const error = refusal(await callTool(session, TOOL, { query: QUERY, cursor }));
      expect(error.code).toBe("validation");
      expect(error.message).toContain("belongs to another call");
    }
    expect(sent()).toBe(0);
  });

  it("a cursor over the arguments as sent, at maxPosition, is accepted", async () => {
    const args = { query: QUERY };
    const { session } = await warm();
    reply(searchPath(QUERY, MAX_SEARCH_PAGE), found([ticket(4301)], 271));
    const cursor = cursorFor(TOOL, args, MAX_SEARCH_POSITION);
    const result = output(await callTool(session, TOOL, { ...args, cursor }));
    expect(result.items.map((item) => item.id)).toEqual([4301]);
    expect(paths()).toEqual([searchPath(QUERY, MAX_SEARCH_PAGE)]);
    expect(result.api_calls_used).toBe(sent());
  });

  it("a cursor at maxPosition + 1 is refused, nothing sent", async () => {
    expect(MAX_SEARCH_POSITION).toBe(9);
    const args = { query: QUERY };
    const cursor = cursorFor(TOOL, args, MAX_SEARCH_POSITION + 1);
    const error = refusal(await callTool((await cold()).session, TOOL, { ...args, cursor }));
    expect(error.code).toBe("validation");
    expect(error.message).toContain("points past the last position");
    expect(sent()).toBe(0);
  });

  it("a cursor that is not one of this server's is refused before the query is looked at", async () => {
    const { session } = await cold();
    const error = refusal(await callTool(session, TOOL, { query: 'a"b', cursor: "7" }));
    expect(error.message).toContain("cursor");
    expect(sent()).toBe(0);
  });
});

describe("search_tickets: api_calls_used", () => {
  it("equals the MockAgent count, a retried request included", async () => {
    const { session } = await warm();
    reply(searchPath(QUERY), { message: "busy" }, 503);
    reply(searchPath(QUERY), found([ticket(4301)]));
    const result = output(await callTool(session, TOOL, { query: QUERY }));
    expect(sent()).toBe(2);
    expect(result.api_calls_used).toBe(sent());
  });

  it("on a cold schema it equals the MockAgent count: the schema's load is in it", async () => {
    const { session } = await cold();
    queueSchema();
    reply(searchPath(QUERY), found([ticket(4301)]));
    const first = output(await callTool(session, TOOL, { query: QUERY }));
    expect(sent()).toBe(4);
    expect(first.api_calls_used).toBe(sent());

    reply(searchPath(QUERY), found([ticket(4301)]));
    const second = output(await callTool(session, TOOL, { query: QUERY }));
    expect(second.api_calls_used).toBe(1);
    expect(sent()).toBe(5);
  });
});

describe("search_tickets: errors", () => {
  it("Freshdesk's 400 comes back as validation with its errors[], wrapped by the registry", async () => {
    const { session } = await warm();
    const query = "cf_category.cf_model:'Blue sprocket'";
    reply(
      searchPath(query),
      {
        description: "Validation failed",
        errors: [
          {
            field: "cf_category.cf_model",
            message: "Unexpected/invalid field in request",
            code: "invalid_field",
          },
        ],
      },
      400,
    );
    const error = refusal(await callTool(session, TOOL, { query }));
    expect(error.code).toBe("validation");
    expect(error.http_status).toBe(400);
    expect(error.errors).toEqual([
      {
        field: "cf_category.cf_model",
        message: wrapped("Unexpected/invalid field in request"),
        code: "invalid_field",
      },
    ]);
    expect(error.note).toBe(DATA_NOT_INSTRUCTIONS);
    expect(sent()).toBe(1);
  });

  it("a failed schema load fails the call, no search sent", async () => {
    const { session } = await cold();
    reply(FIELDS, { code: "access_denied", message: "no" }, 403);
    const error = refusal(await callTool(session, TOOL, { query: QUERY }));
    expect(error.code).toBe("forbidden");
    expect(paths().some((path) => path.includes("/search/"))).toBe(false);
  });

  it("a body in another shape is server, quoting nothing from it", async () => {
    const { session } = await warm();
    reply(searchPath(QUERY), { total: "many", results: "Sprocket secrets" });
    const error = refusal(await callTool(session, TOOL, { query: QUERY }));
    expect(error.code).toBe("server");
    expect(error.message).not.toContain("Sprocket");
  });
});

describe("search_tickets: stderr", () => {
  it("no stderr line contains the query or a fixture body string", async () => {
    const { session } = await warm();
    reply(searchPath(QUERY), found([ticket(4301)]));
    output(await callTool(session, TOOL, { query: QUERY }));

    const written = stderr.mock.calls.map((call) => String(call[0]));
    // Positive control: the spy sees the client's line.
    expect(written).toContainEqual(expect.stringMatching(/^GET \/search\/tickets 200 \d+ms\n$/));
    const lines = written.join("\n");
    for (const text of ["Sprocket report", "sprocket", "cf_model", "Kite flying"]) {
      expect(lines).not.toContain(text);
    }
  });
});

describe("search_tickets: one 30 s deadline per call", () => {
  it("slow requests end the call at 30 s as network, with no request after", async () => {
    const { session } = await cold();
    // The clock of test/support/slow-replies.ts: real I/O is not charged as fake time.
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    try {
      // Each request takes 9 s, under one attempt's 10 s: the search, sent at
      // 27 s, is still silent at 30 s; with 30 s of its own it would be retried.
      const intercept = (path: string) => mock.get(ORIGIN).intercept({ path, method: "GET" });
      intercept(FIELDS).reply(answersAfter(9000, schemaFieldsPayload));
      intercept(AGENTS).reply(answersAfter(9000, agentPages.flat()));
      intercept(GROUPS).reply(answersAfter(9000, groupPages.flat()));
      intercept(searchPath(QUERY)).reply(silentFor(3000));

      const before = Date.now();
      const result = await callTool(session, TOOL, { query: QUERY });
      const ms = Date.now() - before;

      expect(refusal(result).code).toBe("network");
      expect(ms).toBeGreaterThanOrEqual(30_000);
      expect(sent()).toBe(4);
      // No retry: a backoff (500 ms first) would have sent one by now.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect(sent()).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });
});
