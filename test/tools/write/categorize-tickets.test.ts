// T-073 (SPEC §8.2, §9, C1, C8; PLAN OD-13, OD-15): `categorize_tickets`, on
// a server from the real registry with `write` enabled, through the core's
// `categorize_tickets` entry. MockAgent only: no write reaches a real account
// before T-076. Every name, label and choice here is invented.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../../src/config.js";
import { createServer } from "../../../src/server.js";
import { createContext } from "../../../src/tools/context.js";
import { PREVIEW_CAP } from "../../../src/tools/preview.js";
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

const DOMAIN = "acme.freshdesk.com";
const ORIGIN = `https://${DOMAIN}`;
const JSON_TYPE = { "content-type": "application/json" };
const TOOL = "categorize_tickets";

const FIELDS = "/api/v2/ticket_fields";
const AGENTS = "/api/v2/agents?per_page=100";
const GROUPS = "/api/v2/groups?per_page=100";
const ticketPath = (id: number) => `/api/v2/tickets/${id}`;

/** Fast pacing, so the expensive reads of a test do not wait 500 ms each. */
const FAST = { toolsets: ["core", "write"], limits: { pacing_rps: 1000 } };

const IDS = [4242, 4243, 4244] as const;
const ticketOf = (id: number) => ({ ...rawTicket, id });

/** The change asked for each ticket: a type by label, the nested field by label, as a path. */
const CHANGE = { Type: "Question", Shelf: "South > Middle" };
const ITEMS = IDS.map((ticket_id) => ({ ticket_id, fields: CHANGE }));

const dir = mkdtempSync(join(tmpdir(), "freshdesk-mcp-categorize-"));
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
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const server of servers) await server.close();
  await mock.close();
});

function reply(
  path: string,
  body: unknown,
  method = "GET",
  status = 200,
  headers: Record<string, string> = {},
) {
  return mock
    .get(ORIGIN)
    .intercept({ path, method })
    .reply(status, body as object, { headers: { ...JSON_TYPE, ...headers } });
}

/** Every request MockAgent saw, as `METHOD path`. */
function sent(): string[] {
  return (mock.getCallHistory()?.calls() ?? []).map((call) => `${call.method} ${call.path}`);
}

/** The PUTs sent, as `[path, body]`. */
function puts(): [string, unknown][] {
  return (mock.getCallHistory()?.calls() ?? [])
    .filter((call) => call.method === "PUT")
    .map((call) => [call.path, JSON.parse(call.body as string)]);
}

/** A session on a server from the real registry, built as cli.ts builds it; its schema not loaded. */
async function cold(team: unknown = FAST): Promise<Session> {
  const path = join(dir, `team-${++fileCount}.json`);
  writeFileSync(path, JSON.stringify(team));
  const config = loadConfig({
    FRESHDESK_DOMAIN: DOMAIN,
    FRESHDESK_API_KEY: "k3y-Secret-Value-123",
    FRESHDESK_MCP_CONFIG: path,
  });
  const server = createServer(createContext(config, mock));
  servers.push(server);
  return open(server);
}

/** A session whose schema is cached, MockAgent's history cleared: what follows is the tool's alone. */
async function warm(team: unknown = FAST): Promise<Session> {
  const session = await cold(team);
  reply(FIELDS, schemaFieldsPayload);
  reply(AGENTS, agentPages.flat());
  reply(GROUPS, groupPages.flat());
  expect((await callTool(session, "get_ticket_schema", {})).isError).toBeFalsy();
  mock.clearCallHistory();
  return session;
}

function output(result: CallResult): Record<string, unknown> {
  expect(result.isError).toBeFalsy();
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
}

interface SentError {
  code: string;
  http_status: number | null;
  message: string;
  errors?: { field?: string; code?: string; message: string }[];
}

function failure(result: CallResult): SentError {
  expect(result.isError).toBe(true);
  return (JSON.parse(result.content[0]!.text) as { error: SentError }).error;
}

interface Preview {
  preview_id: string | null;
  tickets: { ticket_id: number; changes: { field: string; current: unknown; new: unknown }[] }[];
  not_previewed: { ticket_id: number; code: string }[];
  api_calls_used: number;
}

interface Applied {
  results: { ticket_id: number; result: string; error?: SentError }[];
  written: number;
  refused: number;
  not_attempted: number;
  api_calls_used: number;
  note?: string;
}

/** A preview of `items`, every ticket answered: its id. */
async function previewed(
  session: Session,
  items: readonly { ticket_id: number; fields: Record<string, unknown> }[] = ITEMS,
): Promise<string> {
  for (const item of items) reply(ticketPath(item.ticket_id), ticketOf(item.ticket_id));
  const preview = output(await callTool(session, TOOL, { items })) as unknown as Preview;
  expect(preview.preview_id).toEqual(expect.any(String));
  mock.clearCallHistory();
  return preview.preview_id!;
}

describe("categorize_tickets: the listing", () => {
  it("is listed only with write, destructive, saying preview, confirm, the cap and not attempted", async () => {
    const tools = await listTools(await cold());
    const tool = tools.find((listed) => listed.name === TOOL);
    expect(tool?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    const description = tool?.description ?? "";
    for (const said of ["preview_id", "confirm: true", "50", "not attempted", "Cost:"]) {
      expect(description).toContain(said);
    }
    const without = await listTools(await cold({ toolsets: ["core"] }));
    expect(without.map((listed) => listed.name)).not.toContain(TOOL);
  });
});

describe("categorize_tickets: the preview", () => {
  it("sends GETs only, one per ticket, and returns current → new and a preview_id", async () => {
    const session = await warm();
    for (const id of IDS) reply(ticketPath(id), ticketOf(id));
    const preview = output(await callTool(session, TOOL, { items: ITEMS })) as unknown as Preview;
    expect(sent()).toEqual(IDS.map((id) => `GET ${ticketPath(id)}`));
    expect(preview.preview_id).toEqual(expect.any(String));
    expect(preview.not_previewed).toEqual([]);
    expect(preview.tickets.map((row) => row.ticket_id)).toEqual([...IDS]);
    expect(preview.tickets[0]!.changes).toEqual([
      { field: "Type", current: "Incident", new: "Question" },
      { field: "Shelf", current: "North > Bottom", new: "South > Middle" },
    ]);
    expect(preview.api_calls_used).toBe(3);
  });

  it("a cold schema is loaded first and counted", async () => {
    const session = await cold();
    reply(FIELDS, schemaFieldsPayload);
    reply(AGENTS, agentPages.flat());
    reply(GROUPS, groupPages.flat());
    reply(ticketPath(4242), ticketOf(4242));
    const preview = output(
      await callTool(session, TOOL, { items: [ITEMS[0]] }),
    ) as unknown as Preview;
    expect(preview.api_calls_used).toBe(4);
    expect(sent().filter((line) => !line.startsWith("GET "))).toEqual([]);
  });

  it.each([
    ["status by label", { Status: "Open" }],
    ["priority by API name", { priority: 1 }],
    ["group by API name", { group: "Widget Desk" }],
    ["agent by label", { Agent: "Ferro Lumen" }],
    ["the requester", { requester: 9002 }],
  ])("%s is field_not_writable, nothing sent", async (_label, fields) => {
    const session = await warm();
    const error = failure(
      await callTool(session, TOOL, {
        items: [{ ticket_id: 4242, fields: { ...CHANGE, ...fields } }],
      }),
    );
    expect(error.code).toBe("validation");
    expect(error.http_status).toBeNull();
    expect(error.errors?.map((item) => item.code)).toEqual(["field_not_writable"]);
    expect(sent()).toEqual([]);
  });

  it("an unknown or ambiguous field name is refused, nothing sent", async () => {
    const session = await warm();
    const error = failure(
      await callTool(session, TOOL, {
        items: [
          { ticket_id: 4242, fields: { Flavour: "Mint", product: "Gadgets" } },
          { ticket_id: 4243, fields: { Flavour: "Mint" } },
        ],
      }),
    );
    // "product" is one field's API name and another's label; each key is listed once.
    expect(error.errors?.map((item) => item.code)).toEqual(["unknown_field", "ambiguous_field"]);
    expect(sent()).toEqual([]);
  });

  it("cap + 1 items are refused with nothing sent, the schema not loaded", async () => {
    const session = await cold();
    const items = Array.from({ length: PREVIEW_CAP + 1 }, (_, i) => ({
      ticket_id: i + 1,
      fields: CHANGE,
    }));
    const error = failure(await callTool(session, TOOL, { items }));
    expect(error.code).toBe("validation");
    expect(error.message).toContain(String(PREVIEW_CAP));
    expect(sent()).toEqual([]);
    const confirmed = failure(
      await callTool(session, TOOL, { items, confirm: true, preview_id: "1.x.y" }),
    );
    expect(confirmed.message).toContain(String(PREVIEW_CAP));
    expect(sent()).toEqual([]);
  });

  it("no items, a ticket named twice, or a ticket with no field are refused, nothing sent", async () => {
    const session = await cold();
    for (const items of [
      [],
      [ITEMS[0], { ticket_id: 4242, fields: { Type: "Incident" } }],
      [{ ticket_id: 4242, fields: {} }],
    ]) {
      expect(failure(await callTool(session, TOOL, { items })).code).toBe("validation");
    }
    expect(sent()).toEqual([]);
  });

  it("a ticket that cannot be read is listed not previewed with its code, the rest previewed", async () => {
    const session = await warm();
    reply(ticketPath(4242), ticketOf(4242));
    reply(ticketPath(4243), { code: "not_found" }, "GET", 404);
    reply(ticketPath(4244), ticketOf(4244));
    const preview = output(await callTool(session, TOOL, { items: ITEMS })) as unknown as Preview;
    expect(preview.tickets.map((row) => row.ticket_id)).toEqual([4242, 4244]);
    expect(preview.not_previewed).toEqual([{ ticket_id: 4243, code: "not_found" }]);
  });

  it("cut by the deadline: the tickets not read are not previewed, the preview_id covers those read", async () => {
    const session = await warm();
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    mock
      .get(ORIGIN)
      .intercept({ path: ticketPath(4242) })
      .reply(answersAfter(5_000, ticketOf(4242)));
    mock
      .get(ORIGIN)
      .intercept({ path: ticketPath(4243) })
      .reply(silentFor(30_000));
    const preview = output(await callTool(session, TOOL, { items: ITEMS })) as unknown as Preview;
    expect(sent()).toEqual([`GET ${ticketPath(4242)}`, `GET ${ticketPath(4243)}`]);
    expect(preview.tickets.map((row) => row.ticket_id)).toEqual([4242]);
    expect(preview.not_previewed).toEqual([
      { ticket_id: 4243, code: "not_read" },
      { ticket_id: 4244, code: "not_read" },
    ]);
    mock.clearCallHistory();

    const refused = failure(
      await callTool(session, TOOL, {
        items: [ITEMS[1]],
        confirm: true,
        preview_id: preview.preview_id,
      }),
    );
    expect(refused.code).toBe("validation");
    expect(sent()).toEqual([]);

    reply(ticketPath(4242), ticketOf(4242), "PUT");
    const applied = output(
      await callTool(session, TOOL, {
        items: [ITEMS[0]],
        confirm: true,
        preview_id: preview.preview_id,
      }),
    ) as unknown as Applied;
    expect(applied.results).toEqual([{ ticket_id: 4242, result: "written" }]);
  });

  it("cut by the budget: below the reserve the next read is not sent, the rest not previewed", async () => {
    const session = await warm();
    reply(ticketPath(4242), ticketOf(4242), "GET", 200, {
      "x-ratelimit-total": "100",
      "x-ratelimit-remaining": "10",
    });
    const preview = output(await callTool(session, TOOL, { items: ITEMS })) as unknown as Preview;
    expect(sent()).toEqual([`GET ${ticketPath(4242)}`]);
    expect(preview.tickets.map((row) => row.ticket_id)).toEqual([4242]);
    expect(preview.not_previewed).toEqual([
      { ticket_id: 4243, code: "not_read" },
      { ticket_id: 4244, code: "not_read" },
    ]);
    expect(preview.preview_id).toEqual(expect.any(String));
  });

  it("nothing read: no preview_id", async () => {
    const session = await warm();
    for (const id of IDS) reply(ticketPath(id), { code: "not_found" }, "GET", 404);
    const preview = output(await callTool(session, TOOL, { items: ITEMS })) as unknown as Preview;
    expect(preview.preview_id).toBeNull();
    expect(preview.tickets).toEqual([]);
  });
});

describe("categorize_tickets: the confirm", () => {
  it("sends one PUT per ticket, the previewed fields as ids and choices, and a per-ticket result", async () => {
    const session = await warm();
    const id = await previewed(session);
    for (const ticket of IDS) reply(ticketPath(ticket), ticketOf(ticket), "PUT");
    const applied = output(
      await callTool(session, TOOL, { items: ITEMS, confirm: true, preview_id: id }),
    ) as unknown as Applied;
    expect(sent()).toEqual(IDS.map((ticket) => `PUT ${ticketPath(ticket)}`));
    for (const [, body] of puts()) {
      expect(body).toEqual({
        type: "Question",
        custom_fields: { cf_shelf: "South", cf_tier: "Middle" },
      });
    }
    expect(applied.results).toEqual(
      IDS.map((ticket) => ({ ticket_id: ticket, result: "written" })),
    );
    expect(applied).toMatchObject({ written: 3, refused: 0, not_attempted: 0, api_calls_used: 3 });
    expect(applied.note).toBeUndefined();
  });

  it("any subset of the previewed tickets, in any order, writes only those", async () => {
    const session = await warm();
    const id = await previewed(session);
    reply(ticketPath(4244), ticketOf(4244), "PUT");
    reply(ticketPath(4242), ticketOf(4242), "PUT");
    const applied = output(
      await callTool(session, TOOL, {
        items: [ITEMS[2], ITEMS[0]],
        confirm: true,
        preview_id: id,
      }),
    ) as unknown as Applied;
    expect(sent()).toEqual([`PUT ${ticketPath(4244)}`, `PUT ${ticketPath(4242)}`]);
    expect(applied.written).toBe(2);
  });

  it("a ticket added is refused with 0 PUTs", async () => {
    const session = await warm();
    const id = await previewed(session, ITEMS.slice(0, 2));
    const error = failure(
      await callTool(session, TOOL, { items: ITEMS, confirm: true, preview_id: id }),
    );
    expect(error.code).toBe("validation");
    expect(error.http_status).toBeNull();
    expect(sent()).toEqual([]);
  });

  it("a field changed, dropped or added is refused with 0 PUTs", async () => {
    const session = await warm();
    const id = await previewed(session);
    for (const fields of [
      { Type: "Incident", Shelf: "South > Middle" },
      { Type: "Question" },
      { ...CHANGE, Hobby: "Chess" },
    ]) {
      const items = [{ ticket_id: 4242, fields }, ITEMS[1]];
      const error = failure(
        await callTool(session, TOOL, { items, confirm: true, preview_id: id }),
      );
      expect(error.code).toBe("validation");
    }
    expect(sent()).toEqual([]);
  });

  it("an item key other than ticket_id and fields is refused, nothing sent", async () => {
    const session = await warm();
    const id = await previewed(session);
    const items = [{ ...ITEMS[0], private: false }];
    const result = await callTool(session, TOOL, { items, confirm: true, preview_id: id });
    expect(result.isError).toBe(true);
    expect(sent()).toEqual([]);
  });

  it("confirm without a preview_id, or a preview_id without confirm: true, is refused", async () => {
    const session = await warm();
    const id = await previewed(session);
    const none = failure(await callTool(session, TOOL, { items: ITEMS, confirm: true }));
    expect(none.message).toContain("preview_id");
    const unconfirmed = failure(await callTool(session, TOOL, { items: ITEMS, preview_id: id }));
    expect(unconfirmed.message).toContain("confirm: true");
    expect(sent()).toEqual([]);
  });

  it("a ticket Freshdesk refuses is refused with its code; the others are written", async () => {
    const session = await warm();
    const id = await previewed(session);
    reply(ticketPath(4242), ticketOf(4242), "PUT");
    reply(ticketPath(4243), { code: "not_found" }, "PUT", 404);
    reply(ticketPath(4244), ticketOf(4244), "PUT");
    const applied = output(
      await callTool(session, TOOL, { items: ITEMS, confirm: true, preview_id: id }),
    ) as unknown as Applied;
    expect(applied.results.map((row) => row.result)).toEqual(["written", "refused", "written"]);
    expect(applied.results[1]!.error?.code).toBe("not_found");
    expect(applied).toMatchObject({ written: 2, refused: 1, not_attempted: 0 });
  });

  it("a value the core refuses is refused per ticket, its field error kept, nothing sent for it", async () => {
    const session = await warm();
    const items = [{ ticket_id: 4242, fields: { Type: "Not a type" } }];
    const id = await previewed(session, items);
    const applied = output(
      await callTool(session, TOOL, { items, confirm: true, preview_id: id }),
    ) as unknown as Applied;
    expect(applied.results[0]!.result).toBe("refused");
    expect(applied.results[0]!.error?.errors?.[0]?.code).toBe("invalid_choice");
    expect(sent()).toEqual([]);
  });

  it("cut by the deadline: the rest not attempted; the same preview_id then writes only those", async () => {
    const session = await warm();
    const id = await previewed(session);
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    // 12 s, then 9 s: 9 s left, under the 10 s a write needs; the third is not sent.
    mock
      .get(ORIGIN)
      .intercept({ path: ticketPath(4242), method: "PUT" })
      .reply(answersAfter(12_000, ticketOf(4242)));
    mock
      .get(ORIGIN)
      .intercept({ path: ticketPath(4243), method: "PUT" })
      .reply(answersAfter(9_000, ticketOf(4243)));
    const applied = output(
      await callTool(session, TOOL, { items: ITEMS, confirm: true, preview_id: id }),
    ) as unknown as Applied;
    expect(sent()).toEqual([`PUT ${ticketPath(4242)}`, `PUT ${ticketPath(4243)}`]);
    expect(applied.results).toEqual([
      { ticket_id: 4242, result: "written" },
      { ticket_id: 4243, result: "written" },
      { ticket_id: 4244, result: "not_attempted" },
    ]);
    expect(applied).toMatchObject({ written: 2, refused: 0, not_attempted: 1 });
    expect(applied.note).toContain("preview_id");
    mock.clearCallHistory();

    reply(ticketPath(4244), ticketOf(4244), "PUT");
    const again = output(
      await callTool(session, TOOL, { items: [ITEMS[2]], confirm: true, preview_id: id }),
    ) as unknown as Applied;
    expect(sent()).toEqual([`PUT ${ticketPath(4244)}`]);
    expect(again.results).toEqual([{ ticket_id: 4244, result: "written" }]);
  });

  it("cut by the budget: a write the limiter refuses and every one after it are not attempted", async () => {
    const session = await warm();
    const id = await previewed(session);
    reply(ticketPath(4242), ticketOf(4242), "PUT", 200, {
      "x-ratelimit-total": "100",
      "x-ratelimit-remaining": "0",
    });
    const applied = output(
      await callTool(session, TOOL, { items: ITEMS, confirm: true, preview_id: id }),
    ) as unknown as Applied;
    expect(sent()).toEqual([`PUT ${ticketPath(4242)}`]);
    expect(applied.results.map((row) => row.result)).toEqual([
      "written",
      "not_attempted",
      "not_attempted",
    ]);
  });

  it("writes the fields as previewed: the PUT body is the previewed change, for each ticket", async () => {
    const session = await warm();
    const items = [
      { ticket_id: 4242, fields: { Type: "Question" } },
      { ticket_id: 4243, fields: { cf_shelf: "North > Top", Hobby: "Chess" } },
    ];
    const id = await previewed(session, items);
    reply(ticketPath(4242), ticketOf(4242), "PUT");
    reply(ticketPath(4243), ticketOf(4243), "PUT");
    await callTool(session, TOOL, { items, confirm: true, preview_id: id });
    expect(puts()).toEqual([
      [ticketPath(4242), { type: "Question" }],
      [
        ticketPath(4243),
        { custom_fields: { cf_shelf: "North", cf_tier: "Top", cf_hobby: "Chess" } },
      ],
    ]);
  });
});
