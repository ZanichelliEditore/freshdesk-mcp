import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
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

// Every name, address, label and text here is invented.

const DOMAIN = "acme.freshdesk.com";
const ORIGIN = `https://${DOMAIN}`;
const JSON_TYPE = { "content-type": "application/json" };
const TOOL = "triage_queue";

const FIELDS = "/api/v2/ticket_fields";
const AGENTS = "/api/v2/agents?per_page=100";
const GROUPS = "/api/v2/groups?per_page=100";

const QUERY = "status:2 OR status:3";
const CAP = MAX_SEARCH_PAGE * SEARCH_PER_PAGE;
const STATS = { reply_signals: true };
/** Budget headers below and above the default reserve of 20 %. */
const LOW = { "x-ratelimit-total": "100", "x-ratelimit-remaining": "10" };
const HIGH = { "x-ratelimit-total": "100", "x-ratelimit-remaining": "90" };

/** The fake clock's time at the start of every call. */
const NOW = Date.parse("2026-01-10T12:00:00Z");

function searchPath(page = 1): string {
  return `/api/v2/search/tickets?${String(new URLSearchParams({ query: `"${QUERY}"`, page: String(page) }))}`;
}

function viewPath(id: number): string {
  return `/api/v2/tickets/${id}?include=stats`;
}

const wrapped = (text: string) => `${OPEN}${text}${CLOSE}`;

function ticket(id: number, over: Record<string, unknown> = {}) {
  return {
    ...rawTicket,
    id,
    subject: `Sprocket report ${id}`,
    created_at: "2026-01-07T07:48:00Z",
    updated_at: "2026-01-09T11:30:00Z",
    fr_due_by: "2026-01-08T10:00:00+01:00",
    due_by: "2026-01-12T10:00:00Z",
    fr_escalated: true,
    is_escalated: false,
    nr_escalated: false,
    ...over,
  };
}

function tickets(from: number, count: number) {
  return Array.from({ length: count }, (_, i) => ticket(from + i));
}

/** An open ticket, a pending one and a resolved one, as search might return them. */
const OPEN_TICKET = ticket(4301);
const PENDING_TICKET = ticket(4302, {
  status: 3,
  priority: 1,
  created_at: "2026-01-10T11:18:00Z",
  fr_due_by: null,
  due_by: "2026-01-09T12:00:00Z",
  fr_escalated: false,
  is_escalated: true,
});
const RESOLVED_TICKET = ticket(4303, { status: 4 });

const dir = mkdtempSync(join(tmpdir(), "freshdesk-mcp-triage-queue-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let mock: MockAgent;
let servers: McpServer[];
let fileCount = 0;

beforeEach(() => {
  // From the start: the schema's cache takes a clock gone back as expired.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now: NOW });
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  mock = mockDispatcher();
  servers = [];
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const server of servers) await server.close();
  await mock.close();
});

function reply(path: string, body: unknown, status = 200, headers: Record<string, string> = {}) {
  return mock
    .get(ORIGIN)
    .intercept({ path, method: "GET" })
    .reply(status, body as object, { headers: { ...JSON_TYPE, ...headers } });
}

function found(results: unknown[], total = results.length) {
  return { total, results };
}

/** The view of `row` with `stats`; `stats` undefined leaves the key out. */
function view(row: { id: number }, stats?: unknown) {
  return reply(viewPath(row.id), stats === undefined ? row : { ...row, stats });
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

/** The fixture schema, its status field with Pending and Resolved too. */
const FIELDS_PAYLOAD = schemaFieldsPayload.map((field) =>
  field.type === "default_status"
    ? {
        ...field,
        choices: {
          "2": ["Open", "Being processed"],
          "3": ["Pending", "Awaiting your reply"],
          "4": ["Resolved", "This ticket is resolved"],
          "5": ["Closed", "This ticket is closed"],
        },
      }
    : field,
);

function queueSchema() {
  reply(FIELDS, FIELDS_PAYLOAD);
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

/**
 * One call under the fake clock, which reads NOW when the call starts and is
 * run forward until the call settles (the limiter's pacing waits on it).
 * Returns the fake ms the call took.
 */
async function timed(
  session: Session,
  args: Record<string, unknown> = {},
): Promise<{ result: CallResult; ms: number }> {
  vi.setSystemTime(NOW);
  const call = callTool(session, TOOL, args);
  let result: CallResult | undefined;
  let failed: unknown;
  call.then(
    (value) => {
      result = value;
    },
    (error: unknown) => {
      failed = error ?? new Error("the call was rejected");
    },
  );
  while (result === undefined && failed === undefined) {
    await new Promise((resolve) => setImmediate(resolve));
    if (result === undefined && failed === undefined) await vi.advanceTimersByTimeAsync(100);
  }
  const ms = Date.now() - NOW;
  if (result === undefined) throw failed;
  return { result, ms };
}

async function run(session: Session, args: Record<string, unknown> = {}): Promise<CallResult> {
  return (await timed(session, args)).result;
}

/** The one row of a call whose search returns `row` alone. */
async function rowOf(row: { id: number }, stats?: { stats: unknown }) {
  const { session } = await warm();
  reply(searchPath(), found([row]));
  if (stats !== undefined) view(row, stats.stats);
  const [item] = output(await run(session, stats === undefined ? {} : STATS)).items;
  return item!;
}

describe("triage_queue: the listing", () => {
  it("is listed read-only, with its cost and the data-not-instructions sentence", async () => {
    const tools = await listTools((await cold()).session);
    const tool = tools.find((listed) => listed.name === TOOL);
    expect(tool?.annotations.readOnlyHint).toBe(true);
    expect(tool?.annotations.destructiveHint).toBe(false);
    expect(tool?.description).toMatch(/Cost: 1 API call.*at most 31.*61 credits.*per retry/s);
    expect(tool?.description).toContain(DATA_NOT_INSTRUCTIONS);
  });

  it("its description states the order, the cap, what null means and the bound", async () => {
    const tools = await listTools((await cold()).session);
    const description = tools.find((listed) => listed.name === TOOL)?.description;
    expect(CAP).toBe(300);
    expect(description).toContain("resolution due time, earliest first");
    expect(description).toContain("within a page only");
    expect(description).toContain("first 300");
    expect(description).toContain("truncated: true");
    expect(description).toContain("null means unknown");
    expect(description).toContain("the first-response due time has passed");
    expect(description).toContain(
      "the customer's last message, the opening one when there was no later reply",
    );
    expect(description).toContain("reply_signals_incomplete: true");
    expect(description).toContain("call again later to read them");
    expect(description).toContain("a ticket an agent opened");
    expect(description).toContain("reply_signals: true");
    expect(description).toContain("has_more");
  });

  it("its input schema has no zod default or transform", () => {
    const source = readFileSync(
      new URL("../../../src/tools/toolsets/core/triage-queue.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("z.object(");
    expect(source).not.toContain(".default(");
    expect(source).not.toContain(".transform(");
  });
});

describe("triage_queue: open and pending tickets, with their signals", () => {
  it("asks search for status 2 or 3, at this URL", async () => {
    const { session } = await warm();
    const url = "/api/v2/search/tickets?query=%22status%3A2+OR+status%3A3%22&page=1";
    expect(searchPath()).toBe(url);
    reply(url, found([OPEN_TICKET]));
    output(await run(session));
    expect(paths()).toEqual([url]);
  });

  it("returns only the open and pending tickets, each on T-042's row with the signals", async () => {
    const { session, context, schema } = await warm();
    reply(searchPath(), found([OPEN_TICKET, RESOLVED_TICKET, PENDING_TICKET]));
    const result = output(await run(session));

    expect(result.items.map((item) => item.id)).toEqual([4302, 4301]);
    expect(result.items[1]).toEqual({
      ...(asSent(ticketRow(context, schema, OPEN_TICKET)) as object),
      created: "2026-01-07T07:48:00.000Z",
      age: "3 days 4 hours",
      first_response_due: "2026-01-08T09:00:00.000Z",
      first_response_overdue: true,
      resolution_due: "2026-01-12T10:00:00.000Z",
      resolution_overdue: false,
      first_response_escalated: true,
      resolution_escalated: false,
      next_response_escalated: false,
    });
    expect(result.items[1]).toMatchObject({
      subject: wrapped("Sprocket report 4301"),
      status: "Open",
      priority: "High",
    });
    expect(result.items[0]).toMatchObject({
      id: 4302,
      status: "Pending",
      priority: "Low",
      created: "2026-01-10T11:18:00.000Z",
      age: "42 minutes",
      first_response_due: null,
      first_response_overdue: null,
      resolution_due: "2026-01-09T12:00:00.000Z",
      resolution_overdue: true,
      first_response_escalated: false,
      resolution_escalated: true,
      next_response_escalated: false,
    });
    expect(result.has_more).toBe(false);
    expect(result.api_calls_used).toBe(1);
    expect(sent()).toBe(1);
  });

  it("without reply_signals no row has the reply keys and no ticket is viewed", async () => {
    for (const args of [{}, { reply_signals: false }]) {
      const { session } = await warm();
      reply(searchPath(), found([OPEN_TICKET, PENDING_TICKET]));
      const result = output(await run(session, args));
      for (const item of result.items) {
        expect(item).not.toHaveProperty("last_customer_reply");
        expect(item).not.toHaveProperty("since_last_customer_reply");
        expect(item).not.toHaveProperty("unanswered_customer_reply");
      }
      expect(paths()).toEqual([searchPath()]);
      expect(result.api_calls_used).toBe(1);
    }
  });

  it("no result is an empty list, not an error; with reply_signals too", async () => {
    const { session } = await warm();
    reply(searchPath(), found([]));
    reply(searchPath(), found([RESOLVED_TICKET]));
    const empty = { items: [], has_more: false, api_calls_used: 1 };
    expect(output(await run(session))).toEqual(empty);
    expect(output(await run(session, STATS))).toEqual(empty);
    expect(sent()).toBe(2);
  });
});

describe("triage_queue: the default order", () => {
  it("resolution due earliest first, a ticket with none last, ties by id", async () => {
    const { session } = await warm();
    reply(
      searchPath(),
      found([
        ticket(4305, { due_by: null }),
        ticket(4304, { due_by: "2026-01-12T10:00:00Z" }),
        ticket(4303, { due_by: "2026-01-12T11:00:00+01:00" }),
        ticket(4302, { due_by: "2026-01-20T10:00:00Z" }),
        ticket(4301, { due_by: "not a date" }),
        ticket(4306, { due_by: "2026-01-09T10:00:00Z" }),
      ]),
    );
    const result = output(await run(session));
    expect(result.items.map((item) => item.id)).toEqual([4306, 4303, 4304, 4302, 4301, 4305]);
  });
});

describe("triage_queue: ages in human form", () => {
  it.each([
    ["2026-01-10T12:00:00Z", "under a minute"],
    ["2026-01-10T11:59:01Z", "under a minute"],
    ["2026-01-10T11:59:00Z", "1 minute"],
    ["2026-01-10T10:59:00Z", "1 hour 1 minute"],
    ["2026-01-10T10:00:00Z", "2 hours"],
    ["2026-01-09T12:00:00Z", "1 day"],
    ["2026-01-09T10:30:00Z", "1 day 1 hour"],
    ["2026-01-08T11:00:00+02:00", "2 days 3 hours"],
    ["2024-12-06T12:00:00Z", "400 days"],
  ])("created %s is %s old", async (created_at, age) => {
    expect((await rowOf(ticket(4301, { created_at }))).age).toBe(age);
  });

  it.each([
    ["in the future", "2026-01-10T12:00:01Z", "2026-01-10T12:00:01.000Z"],
    ["without a zone", "2026-01-07T07:48:00", null],
    ["not a date", "last week", null],
    ["a number", 1767772080, null],
    ["missing", undefined, null],
  ])("a created_at %s gives no age, never a guess", async (_, created_at, created) => {
    const row = await rowOf(ticket(4301, { created_at }));
    expect(row.created).toBe(created);
    expect(row.age).toBeNull();
  });
});

describe("triage_queue: overdue and escalation flags", () => {
  it("a due time is overdue once it has passed, not at the instant itself", async () => {
    const atNow = await rowOf(
      ticket(4301, { fr_due_by: "2026-01-10T12:00:00Z", due_by: "2026-01-10T12:00:00.000Z" }),
    );
    expect(atNow.first_response_overdue).toBe(false);
    expect(atNow.resolution_overdue).toBe(false);
    const past = await rowOf(
      ticket(4301, { fr_due_by: "2026-01-10T11:59:59.999Z", due_by: "2026-01-10T12:59:59+01:00" }),
    );
    expect(past.first_response_overdue).toBe(true);
    expect(past.resolution_overdue).toBe(true);
  });

  it.each([["2026-01-08 10:00"], [null], [undefined], [17], ["2026-01-08T10:00:00"]])(
    "a due time of %j is null and its overdue flag null",
    async (due) => {
      const row = await rowOf(ticket(4301, { fr_due_by: due, due_by: due }));
      expect(row).toMatchObject({
        first_response_due: null,
        first_response_overdue: null,
        resolution_due: null,
        resolution_overdue: null,
      });
    },
  );

  it("an escalation flag that is not a boolean is null", async () => {
    const row = await rowOf(
      ticket(4301, { fr_escalated: "true", is_escalated: 1, nr_escalated: undefined }),
    );
    expect(row).toMatchObject({
      first_response_escalated: null,
      resolution_escalated: null,
      next_response_escalated: null,
    });
  });
});

describe("triage_queue: reply_signals, one view per row", () => {
  it("adds the last customer reply, the time since it and the unanswered flag", async () => {
    const { session } = await warm();
    reply(searchPath(), found([OPEN_TICKET, RESOLVED_TICKET, PENDING_TICKET]));
    view(OPEN_TICKET, {
      requester_responded_at: "2026-01-10T07:48:00+01:00",
      agent_responded_at: "2026-01-09T08:00:00Z",
    });
    view(PENDING_TICKET, {
      requester_responded_at: null,
      agent_responded_at: "2026-01-10T11:30:00Z",
    });
    const result = output(await run(session, STATS));

    expect(result.items.map((item) => item.id)).toEqual([4302, 4301]);
    expect(result.items[1]).toMatchObject({
      age: "3 days 4 hours",
      last_customer_reply: "2026-01-10T06:48:00.000Z",
      since_last_customer_reply: "5 hours 12 minutes",
      unanswered_customer_reply: true,
    });
    expect(result.items[0]).toMatchObject({
      age: "42 minutes",
      last_customer_reply: "2026-01-10T11:18:00.000Z",
      since_last_customer_reply: "42 minutes",
      unanswered_customer_reply: false,
    });
    // One view per returned row, none for the resolved ticket.
    expect(paths().sort()).toEqual([searchPath(), viewPath(4301), viewPath(4302)].sort());
    expect(result.api_calls_used).toBe(3);
  });

  it.each([
    ["the agent answered after it", "2026-01-10T08:00:00Z", "2026-01-10T09:00:00Z", false],
    ["the agent answered before it", "2026-01-10T08:00:00Z", "2026-01-10T07:59:59Z", true],
    [
      "the agent answered at the same instant",
      "2026-01-10T08:00:00Z",
      "2026-01-10T09:00:00+01:00",
      false,
    ],
    ["no agent has answered", "2026-01-10T08:00:00Z", null, true],
  ])("unanswered when %s", async (_, requester, agent, unanswered) => {
    const row = await rowOf(OPEN_TICKET, {
      stats: { requester_responded_at: requester, agent_responded_at: agent },
    });
    expect(row.unanswered_customer_reply).toBe(unanswered);
    expect(row.since_last_customer_reply).toBe("4 hours");
  });

  it.each([
    ["no agent has answered it: unanswered", null, true],
    ["an agent has answered it: not unanswered", "2026-01-08T09:00:00Z", false],
    ["the agent time is missing: unknown", undefined, null],
    ["the agent time is not a date: unknown", "soon", null],
  ])(
    "no later customer reply: the last message is the opening one; %s",
    async (_, agent, unanswered) => {
      const row = await rowOf(OPEN_TICKET, {
        stats: {
          requester_responded_at: null,
          ...(agent === undefined ? {} : { agent_responded_at: agent }),
        },
      });
      expect(row).toMatchObject({
        created: "2026-01-07T07:48:00.000Z",
        last_customer_reply: "2026-01-07T07:48:00.000Z",
        since_last_customer_reply: "3 days 4 hours",
        unanswered_customer_reply: unanswered,
      });
    },
  );

  it("no later customer reply and a created_at that cannot be read: no time, the flag still known", async () => {
    const row = await rowOf(ticket(4301, { created_at: "last week" }), {
      stats: { requester_responded_at: null, agent_responded_at: null },
    });
    expect(row).toMatchObject({
      last_customer_reply: null,
      since_last_customer_reply: null,
      unanswered_customer_reply: true,
    });
  });

  it.each([
    ["no stats key", undefined],
    ["stats null", null],
    ["stats a string", "2026-01-10T08:00:00Z"],
    ["stats a list", [{ requester_responded_at: null, agent_responded_at: null }]],
    ["stats without the two keys", { first_responded_at: null, resolved_at: null }],
    [
      "a customer time that is not a date",
      { requester_responded_at: "this morning", agent_responded_at: null },
    ],
    [
      "a customer time without a zone",
      { requester_responded_at: "2026-01-10T08:00:00", agent_responded_at: null },
    ],
    [
      "a customer time that is a number",
      { requester_responded_at: 1768032000, agent_responded_at: null },
    ],
  ])("%s: the three signals are null, the row is still returned", async (_, stats) => {
    const row = await rowOf(OPEN_TICKET, { stats });
    expect(row).toMatchObject({
      id: 4301,
      age: "3 days 4 hours",
      last_customer_reply: null,
      since_last_customer_reply: null,
      unanswered_customer_reply: null,
    });
  });

  it.each([
    ["missing", { requester_responded_at: "2026-01-10T08:00:00Z" }],
    ["not a date", { requester_responded_at: "2026-01-10T08:00:00Z", agent_responded_at: "soon" }],
    ["a boolean", { requester_responded_at: "2026-01-10T08:00:00Z", agent_responded_at: false }],
  ])("an agent time %s: the reply time is kept, unanswered is null", async (_, stats) => {
    const row = await rowOf(OPEN_TICKET, { stats });
    expect(row).toMatchObject({
      last_customer_reply: "2026-01-10T08:00:00.000Z",
      since_last_customer_reply: "4 hours",
      unanswered_customer_reply: null,
    });
  });

  it.each([
    ["no first response yet, the due time passed", null, "2026-01-08T10:00:00Z", true],
    [
      "a first response sent, the due time passed",
      "2026-01-09T08:00:00Z",
      "2026-01-08T10:00:00Z",
      false,
    ],
    ["no first response yet, the due time ahead", null, "2026-01-11T10:00:00Z", false],
    [
      "a first response sent, the due time ahead",
      "2026-01-09T08:00:00Z",
      "2026-01-11T10:00:00Z",
      false,
    ],
    [
      "a first response time that is not a date, the due time passed",
      "soon",
      "2026-01-08T10:00:00Z",
      null,
    ],
    [
      "a first response time that is not a date, the due time ahead",
      "soon",
      "2026-01-11T10:00:00Z",
      false,
    ],
    ["no first response yet, no due time", null, null, null],
  ])("first_response_overdue with reply_signals: %s", async (_, first, due, overdue) => {
    const row = await rowOf(ticket(4301, { fr_due_by: due }), {
      stats: { first_responded_at: first, requester_responded_at: null, agent_responded_at: null },
    });
    expect(row.first_response_overdue).toBe(overdue);
    // The resolution flag stays the date's.
    expect(row.resolution_overdue).toBe(false);
  });

  it.each([
    ["no stats", undefined],
    [
      "stats without first_responded_at",
      { requester_responded_at: null, agent_responded_at: null },
    ],
  ])(
    "first_response_overdue with reply_signals and %s: unknown once the due time passed",
    async (_, stats) => {
      expect((await rowOf(OPEN_TICKET, { stats })).first_response_overdue).toBeNull();
      const ahead = ticket(4301, { fr_due_by: "2026-01-11T10:00:00Z" });
      expect((await rowOf(ahead, { stats })).first_response_overdue).toBe(false);
    },
  );

  it("first_response_overdue without reply_signals is the date's alone", async () => {
    expect((await rowOf(OPEN_TICKET)).first_response_overdue).toBe(true);
  });

  it("a customer reply in the future keeps its time and gives no duration", async () => {
    const row = await rowOf(OPEN_TICKET, {
      stats: { requester_responded_at: "2026-01-10T12:00:01Z", agent_responded_at: null },
    });
    expect(row).toMatchObject({
      last_customer_reply: "2026-01-10T12:00:01.000Z",
      since_last_customer_reply: null,
      unanswered_customer_reply: true,
    });
  });

  it("a ticket the view no longer finds keeps its row, the three signals null", async () => {
    const { session } = await warm();
    reply(searchPath(), found([OPEN_TICKET, PENDING_TICKET]));
    reply(viewPath(4301), { message: "gone" }, 404);
    view(PENDING_TICKET, { requester_responded_at: null, agent_responded_at: null });
    const result = output(await run(session, STATS));
    expect(result.items.map((item) => item.id)).toEqual([4302, 4301]);
    expect(result.items[1]).toMatchObject({
      last_customer_reply: null,
      since_last_customer_reply: null,
      unanswered_customer_reply: null,
    });
    expect(result.items[0]!.unanswered_customer_reply).toBe(true);
    expect(result).not.toHaveProperty("reply_signals_incomplete");
    expect(sent()).toBe(3);
    expect(result.api_calls_used).toBe(sent());
  });

  it("a full page stays within the bound: 31 requests, paced, each view asked once", async () => {
    const { session } = await warm();
    const page = tickets(4301, SEARCH_PER_PAGE);
    reply(searchPath(), found(page, SEARCH_PER_PAGE + 5));
    for (const row of page) view(row, { requester_responded_at: null, agent_responded_at: null });
    const { result, ms } = await timed(session, STATS);
    const listed = output(result);
    expect(listed.items).toHaveLength(SEARCH_PER_PAGE);
    expect(sent()).toBe(1 + SEARCH_PER_PAGE);
    expect(sent()).toBe(31);
    expect(listed.api_calls_used).toBe(sent());
    expect(new Set(paths()).size).toBe(31);
    // Expensive: paced at the default 2 a second, so 30 views take 14.5 s or more.
    expect(ms).toBeGreaterThanOrEqual(14_500);
    expect(ms).toBeLessThan(30_000);
    expect(listed.has_more).toBe(true);
  });

  it("the reserve crossed after 2 views: every row comes back, the rest unviewed, and the result says so", async () => {
    const { session } = await warm();
    const page = tickets(4301, 5);
    const stats = {
      first_responded_at: null,
      requester_responded_at: "2026-01-10T08:00:00Z",
      agent_responded_at: null,
    };
    reply(searchPath(), found(page, SEARCH_PER_PAGE + 5), 200, HIGH);
    reply(viewPath(4301), { ...page[0], stats }, 200, HIGH);
    reply(viewPath(4302), { ...page[1], stats }, 200, LOW);
    const result = output(await run(session, STATS));

    expect(result.items.map((item) => item.id)).toEqual([4301, 4302, 4303, 4304, 4305]);
    for (const item of result.items.slice(0, 2)) {
      expect(item).toMatchObject({
        first_response_overdue: true,
        last_customer_reply: "2026-01-10T08:00:00.000Z",
        since_last_customer_reply: "4 hours",
        unanswered_customer_reply: true,
      });
    }
    for (const item of result.items.slice(2)) {
      expect(item).toMatchObject({
        age: "3 days 4 hours",
        resolution_overdue: false,
        // Its due time has passed, and whether a first response was sent is not known.
        first_response_overdue: null,
        last_customer_reply: null,
        since_last_customer_reply: null,
        unanswered_customer_reply: null,
      });
    }
    expect((result as unknown as Record<string, unknown>).reply_signals_incomplete).toBe(true);
    expect(paths()).toEqual([searchPath(), viewPath(4301), viewPath(4302)]);
    expect(sent()).toBe(3);
    expect(result.api_calls_used).toBe(sent());
    expect(result.has_more).toBe(true);
    expect(result.next_cursor).toBe(cursorFor(TOOL, STATS, 1));
  });

  it("the first view answered 404, a later one refused by the limiter: the partial return, every signal null", async () => {
    const { session } = await warm();
    const page = tickets(4301, 3);
    reply(searchPath(), found(page), 200, HIGH);
    reply(viewPath(4301), { message: "gone" }, 404, LOW);
    const result = output(await run(session, STATS));

    expect(result.items.map((item) => item.id)).toEqual([4301, 4302, 4303]);
    for (const item of result.items) {
      expect(item).toMatchObject({
        last_customer_reply: null,
        since_last_customer_reply: null,
        unanswered_customer_reply: null,
      });
    }
    expect((result as unknown as Record<string, unknown>).reply_signals_incomplete).toBe(true);
    expect(paths()).toEqual([searchPath(), viewPath(4301)]);
    expect(result.api_calls_used).toBe(sent());
  });

  it("a call whose views were all answered has no reply_signals_incomplete key", async () => {
    const { session } = await warm();
    reply(searchPath(), found([OPEN_TICKET]));
    view(OPEN_TICKET, { requester_responded_at: null, agent_responded_at: null });
    expect(output(await run(session, STATS))).not.toHaveProperty("reply_signals_incomplete");
    reply(searchPath(), found([OPEN_TICKET]));
    expect(output(await run(session))).not.toHaveProperty("reply_signals_incomplete");
  });

  it("the views are expensive: below the reserve the first view is refused and the call is rate_limited", async () => {
    const { session } = await warm();
    reply(searchPath(), found([OPEN_TICKET]), 200, LOW);
    const error = refusal(await run(session, STATS));
    expect(error.code).toBe("rate_limited");
    expect(error.http_status).toBeNull();
    expect(paths()).toEqual([searchPath()]);
    expect(sent()).toBe(1);

    // Without the signals the same budget serves the call: it is cheap.
    reply(searchPath(), found([OPEN_TICKET]), 200, LOW);
    expect(output(await run(session)).items).toHaveLength(1);
  });
});

describe("triage_queue: paging and truncated", () => {
  it("two pages: next_cursor, then the rest", async () => {
    const { session } = await warm();
    reply(searchPath(), found(tickets(4301, SEARCH_PER_PAGE), SEARCH_PER_PAGE + 1));
    const first = output(await run(session));
    expect(first.items).toHaveLength(SEARCH_PER_PAGE);
    expect(first.has_more).toBe(true);
    expect(first.next_cursor).toBe(cursorFor(TOOL, {}, 1));
    expect(first).not.toHaveProperty("truncated");

    reply(searchPath(2), found([ticket(4400)], SEARCH_PER_PAGE + 1));
    const second = output(await run(session, { cursor: first.next_cursor }));
    expect(second.items.map((item) => item.id)).toEqual([4400]);
    expect(second.has_more).toBe(false);
    expect(second).not.toHaveProperty("next_cursor");
    expect(paths()).toEqual([searchPath(), searchPath(2)]);
  });

  it("has_more is the total's: a page whose rows were all dropped still has more", async () => {
    const { session } = await warm();
    reply(searchPath(), found([RESOLVED_TICKET], SEARCH_PER_PAGE + 1));
    const result = output(await run(session));
    expect(result.items).toEqual([]);
    expect(result.has_more).toBe(true);
  });

  it("a total over the 300-result cap says truncated: true on every page", async () => {
    const { session } = await warm();
    reply(searchPath(), found(tickets(4301, SEARCH_PER_PAGE), CAP + 1));
    const first = output(await run(session));
    expect(first.truncated).toBe(true);
    expect(first.has_more).toBe(true);

    reply(searchPath(MAX_SEARCH_PAGE), found(tickets(4401, SEARCH_PER_PAGE), CAP + 1));
    const cursor = cursorFor(TOOL, {}, MAX_SEARCH_POSITION);
    const last = output(await run(session, { cursor }));
    expect(last.truncated).toBe(true);
    expect(last.has_more).toBe(false);
    expect(last).not.toHaveProperty("next_cursor");
  });

  it("a total of exactly the cap is not truncated", async () => {
    const { session } = await warm();
    reply(searchPath(), found(tickets(4301, SEARCH_PER_PAGE), CAP));
    expect(output(await run(session))).not.toHaveProperty("truncated");
  });
});

describe("triage_queue: the cursor", () => {
  it("a cursor from another call is refused, nothing sent", async () => {
    const { session } = await cold();
    for (const [args, cursor] of [
      [{}, cursorFor("search_tickets", {}, 1)],
      [{}, cursorFor(TOOL, STATS, 1)],
      [STATS, cursorFor(TOOL, {}, 1)],
      [STATS, cursorFor(TOOL, { reply_signals: false }, 1)],
      [{ reply_signals: false }, cursorFor(TOOL, {}, 1)],
    ] as const) {
      const error = refusal(await run(session, { ...args, cursor }));
      expect(error.code).toBe("validation");
      expect(error.message).toContain("belongs to another call");
    }
    expect(sent()).toBe(0);
  });

  it.each([[{}], [STATS], [{ reply_signals: false }]])(
    "a cursor over the arguments as sent (%j), at maxPosition, is accepted",
    async (args) => {
      const { session } = await warm();
      reply(searchPath(MAX_SEARCH_PAGE), found([RESOLVED_TICKET], 271));
      const cursor = cursorFor(TOOL, args, MAX_SEARCH_POSITION);
      const result = output(await run(session, { ...args, cursor }));
      expect(result.items).toEqual([]);
      expect(paths()).toEqual([searchPath(MAX_SEARCH_PAGE)]);
      expect(result.api_calls_used).toBe(sent());
    },
  );

  it("a cursor at maxPosition + 1 is refused, nothing sent", async () => {
    expect(MAX_SEARCH_POSITION).toBe(9);
    const cursor = cursorFor(TOOL, {}, MAX_SEARCH_POSITION + 1);
    const error = refusal(await run((await cold()).session, { cursor }));
    expect(error.code).toBe("validation");
    expect(error.message).toContain("points past the last position");
    expect(sent()).toBe(0);
  });

  it("an argument that is not the schema's is refused, nothing sent", async () => {
    const { session } = await warm();
    const result = await run(session, { reply_signals: "yes" });
    expect(result.isError).toBe(true);
    expect(sent()).toBe(0);
  });
});

describe("triage_queue: api_calls_used", () => {
  it("equals the MockAgent count, a retried search and a retried view included", async () => {
    const { session } = await warm();
    reply(searchPath(), { message: "busy" }, 503);
    reply(searchPath(), found([OPEN_TICKET]));
    reply(viewPath(4301), { message: "busy" }, 503);
    view(OPEN_TICKET, { requester_responded_at: null, agent_responded_at: null });
    const result = output(await run(session, STATS));
    expect(sent()).toBe(4);
    expect(result.api_calls_used).toBe(sent());
  });

  it("on a cold schema it equals the MockAgent count: the schema's load is in it", async () => {
    const { session } = await cold();
    queueSchema();
    reply(searchPath(), found([OPEN_TICKET]));
    const first = output(await run(session));
    expect(sent()).toBe(4);
    expect(first.api_calls_used).toBe(sent());
  });
});

describe("triage_queue: errors", () => {
  it("a client error on the search is isError", async () => {
    const { session } = await warm();
    reply(searchPath(), { code: "access_denied", message: "no" }, 403);
    const error = refusal(await run(session));
    expect(error.code).toBe("forbidden");
    expect(error.http_status).toBe(403);
    expect(sent()).toBe(1);
  });

  it("a 403 on a later view fails the call and stops the views, though one was answered", async () => {
    const { session } = await warm();
    const page = tickets(4301, 3);
    reply(searchPath(), found(page));
    view(page[0]!, { requester_responded_at: null, agent_responded_at: null });
    reply(viewPath(4302), { code: "access_denied", message: "no" }, 403);
    const error = refusal(await run(session, STATS));
    expect(error.code).toBe("forbidden");
    expect(error.http_status).toBe(403);
    expect(paths()).toEqual([searchPath(), viewPath(4301), viewPath(4302)]);
    expect(sent()).toBe(3);
  });

  it("a 429 on a later view, its retry refused by the limiter unsent: the partial return, the 429 counted", async () => {
    const { session } = await warm();
    const page = tickets(4301, 3);
    reply(searchPath(), found(page));
    view(page[0]!, { requester_responded_at: null, agent_responded_at: null });
    reply(viewPath(4302), { message: "slow down" }, 429, { "retry-after": "3600" });
    const result = output(await run(session, STATS));
    expect(result.items.map((item) => item.unanswered_customer_reply)).toEqual([true, null, null]);
    expect((result as unknown as Record<string, unknown>).reply_signals_incomplete).toBe(true);
    expect(paths()).toEqual([searchPath(), viewPath(4301), viewPath(4302)]);
    expect(result.api_calls_used).toBe(sent());
  });

  it("a failed schema load fails the call, no search sent", async () => {
    const { session } = await cold();
    reply(FIELDS, { code: "access_denied", message: "no" }, 403);
    const error = refusal(await run(session));
    expect(error.code).toBe("forbidden");
    expect(paths().some((path) => path.includes("/search/"))).toBe(false);
  });

  it("a search body in another shape is server, quoting nothing from it", async () => {
    const { session } = await warm();
    reply(searchPath(), { total: "many", results: "Sprocket secrets" });
    const error = refusal(await run(session));
    expect(error.code).toBe("server");
    expect(error.message).not.toContain("Sprocket");
  });
});

describe("triage_queue: one 30 s deadline per call", () => {
  it("slow views end the call at 30 s as network, with no request after", async () => {
    const { session } = await warm();
    const page = tickets(4301, 6);
    reply(searchPath(), found(page)).delay(2000);
    for (const row of page) {
      view(row, { requester_responded_at: null, agent_responded_at: null }).delay(9000);
    }
    const { result, ms } = await timed(session, STATS);
    expect(refusal(result).code).toBe("network");
    expect(ms).toBeLessThanOrEqual(30_100);
    // The search, three views answered at 9 s each, and the one cut at 30 s.
    expect(sent()).toBe(5);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sent()).toBe(5);
  });
});
