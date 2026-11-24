import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../../src/config.js";
import { createServer } from "../../../src/server.js";
import { createContext } from "../../../src/tools/context.js";
import { NAME_CAP, OPEN } from "../../../src/tools/format.js";
import { listEnvelope } from "../../../src/tools/list.js";
import { MAX_POSITION as AGENTS_MAX } from "../../../src/tools/toolsets/core/list-agents.js";
import { MAX_POSITION as GROUPS_MAX } from "../../../src/tools/toolsets/core/list-groups.js";
import { agentPages, groupPages } from "../../fixtures/agents-groups.js";
import {
  type CallResult,
  callTool,
  listTools,
  open,
  type Session,
} from "../../support/mcp-session.js";
import { type MockAgent, mockDispatcher } from "../../support/mock-dispatcher.js";

const DOMAIN = "acme.freshdesk.com";
const ORIGIN = `https://${DOMAIN}`;
const JSON_TYPE = { "content-type": "application/json" };

const TOOLS = {
  list_agents: { first: "/api/v2/agents?per_page=100", pages: agentPages, max: AGENTS_MAX },
  list_groups: { first: "/api/v2/groups?per_page=100", pages: groupPages, max: GROUPS_MAX },
} as const;
type ToolName = keyof typeof TOOLS;
const NAMES = Object.keys(TOOLS) as ToolName[];

const dir = mkdtempSync(join(tmpdir(), "freshdesk-mcp-agents-groups-"));
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
  for (const server of servers) await server.close();
  await mock.close();
});

/** A session on a server from the real registry, built as cli.ts builds it. */
async function session(): Promise<Session> {
  const path = join(dir, `team-${++fileCount}.json`);
  writeFileSync(path, JSON.stringify({}));
  const config = loadConfig({
    FRESHDESK_DOMAIN: DOMAIN,
    FRESHDESK_API_KEY: "k3y-Secret-Value-123",
    FRESHDESK_MCP_CONFIG: path,
  });
  const server = createServer(createContext(config, mock));
  servers.push(server);
  return open(server);
}

/** The path of the tool's page `n` (1-based). */
function pathOf(tool: ToolName, n: number): string {
  const { first } = TOOLS[tool];
  return n === 1 ? first : `${first}&page=${n}`;
}

/** Queue page `n`; it links to page `n + 1` when `more`. */
function page(tool: ToolName, n: number, body: unknown, more: boolean, status = 200) {
  mock
    .get(ORIGIN)
    .intercept({ path: pathOf(tool, n), method: "GET" })
    .reply(status, body as object, {
      headers: {
        ...JSON_TYPE,
        ...(more ? { link: `<${ORIGIN}${pathOf(tool, n + 1)}>; rel="next"` } : {}),
      },
    });
}

/** Queue the fixture's two pages. */
function queueFixture(tool: ToolName) {
  const { pages } = TOOLS[tool];
  page(tool, 1, pages[0], true);
  page(tool, 2, pages[1], false);
}

function sent(): number {
  return mock.getCallHistory()?.calls().length ?? 0;
}

interface Envelope {
  items: Record<string, unknown>[];
  has_more: boolean;
  next_cursor?: string;
  truncated?: boolean;
  api_calls_used: number;
}

function envelope(result: CallResult): Envelope {
  expect(result.isError).toBeFalsy();
  return JSON.parse(result.content[0].text) as Envelope;
}

function refusal(result: CallResult): { code: string; message: string } {
  expect(result.isError).toBe(true);
  return (JSON.parse(result.content[0].text) as { error: { code: string; message: string } }).error;
}

/** A cursor this server would give for `tool` called with `args`, at `position`. */
function cursorFor(tool: string, args: Record<string, unknown>, position: number): string {
  const built = listEnvelope({ tool, args }, { items: [], next: position, api_calls_used: 0 });
  return built.next_cursor!;
}

describe("list_agents, list_groups: the listing", () => {
  it.each(NAMES)("%s is listed read-only, with its cost in the description", async (name) => {
    const tools = await listTools(await session());
    const tool = tools.find((listed) => listed.name === name);
    expect(tool?.annotations.readOnlyHint).toBe(true);
    expect(tool?.annotations.destructiveHint).toBe(false);
    expect(tool?.description).toMatch(/Cost: 1 API call per 100 .*at most 10/s);
  });
});

describe("list_agents: the items", () => {
  it("returns the envelope with the fixture's ids, names and work emails, nothing else", async () => {
    queueFixture("list_agents");
    const result = envelope(await callTool(await session(), "list_agents", {}));
    expect(result).toEqual({
      items: [
        { id: 501, name: "Quill Ottersby", email: "quill@example.com" },
        { id: 502, name: "Juniper Vantablack", email: "juniper@example.com" },
        { id: 503, name: "Ferro Lumen", email: "ferro@example.com" },
      ],
      has_more: false,
      api_calls_used: 2,
    });
    expect(result.api_calls_used).toBe(sent());
  });

  it("leaves out an agent's phone even when Freshdesk sends one", async () => {
    const [agent] = structuredClone(agentPages[0]) as {
      contact: Record<string, unknown>;
      [key: string]: unknown;
    }[];
    agent.contact.phone = "+1 555 0100";
    agent.contact.mobile = "+1 555 0101";
    page("list_agents", 1, [agent], false);
    const response = await callTool(await session(), "list_agents", {});
    const [item] = envelope(response).items;
    expect(Object.keys(item).sort()).toEqual(["email", "id", "name"]);
    expect(response.content[0].text).not.toContain("555");
  });
});

describe("list_groups: the items", () => {
  it("returns the envelope with the fixture's ids and names, nothing else", async () => {
    queueFixture("list_groups");
    const result = envelope(await callTool(await session(), "list_groups", {}));
    expect(result).toEqual({
      items: [
        { id: 701, name: "Sprocket Desk" },
        { id: 702, name: "Widget Desk" },
        { id: 703, name: "Spanner Desk" },
      ],
      has_more: false,
      api_calls_used: 2,
    });
    expect(result.api_calls_used).toBe(sent());
  });
});

describe("list_agents, list_groups: names", () => {
  const long = "N".repeat(NAME_CAP + 20);

  function named(tool: ToolName, names: string[]) {
    const [template] = structuredClone(TOOLS[tool].pages[0]) as Record<string, unknown>[];
    return names.map((name, i) => {
      const item = structuredClone(template);
      item.id = 900 + i;
      if (tool === "list_agents") (item.contact as Record<string, unknown>).name = name;
      else item.name = name;
      return item;
    });
  }

  it.each(NAMES)(
    "%s: a name loses its HTML tag, one over the cap is cut, none is wrapped",
    async (tool) => {
      page(tool, 1, named(tool, ["<b>Bold</b> Name", long]), false);
      const response = await callTool(await session(), tool, {});
      const [tagged, cut] = envelope(response).items;
      expect(tagged.name).toBe("Bold Name");
      expect(cut.name).toBe(`${"N".repeat(NAME_CAP)}…`);
      expect(response.content[0].text).not.toContain(OPEN);
    },
  );

  it("list_agents: no fixture name is inside <ticket_content>", async () => {
    queueFixture("list_agents");
    const response = await callTool(await session(), "list_agents", {});
    expect(response.content[0].text).not.toContain(OPEN);
  });
});

describe("list_agents, list_groups: the cap", () => {
  it.each(NAMES)("%s: a list cut at 10 pages says truncated: true", async (tool) => {
    for (let n = 1; n <= 10; n += 1) page(tool, n, TOOLS[tool].pages[0], true);
    const result = envelope(await callTool(await session(), tool, {}));
    expect(result.truncated).toBe(true);
    expect(result.has_more).toBe(false);
    expect(result.items).toHaveLength(20);
    expect(result.api_calls_used).toBe(10);
    expect(result.api_calls_used).toBe(sent());
  });
});

describe("list_agents, list_groups: errors", () => {
  it.each(NAMES)("%s: a client error comes back as isError with its code", async (tool) => {
    page(tool, 1, { message: "denied" }, false, 403);
    expect(refusal(await callTool(await session(), tool, {})).code).toBe("forbidden");
  });

  it.each(NAMES)("%s: a page in the wrong shape comes back as isError server", async (tool) => {
    page(tool, 1, [{ id: "not a number" }], false);
    expect(refusal(await callTool(await session(), tool, {})).code).toBe("server");
  });
});

describe("list_agents, list_groups: the cursor", () => {
  it.each(NAMES)("%s: a cursor from another call is refused, nothing sent", async (tool) => {
    const other = NAMES.find((name) => name !== tool)!;
    const cursor = cursorFor(other, {}, 0);
    const error = refusal(await callTool(await session(), tool, { cursor }));
    expect(error.code).toBe("validation");
    expect(sent()).toBe(0);
  });

  it.each(NAMES)("%s: a cursor at the tool's maxPosition is accepted", async (tool) => {
    queueFixture(tool);
    const cursor = cursorFor(tool, {}, TOOLS[tool].max);
    const result = envelope(await callTool(await session(), tool, { cursor }));
    expect(result.items).toHaveLength(3);
    expect(result.api_calls_used).toBe(sent());
  });

  it.each(NAMES)("%s: a cursor at maxPosition + 1 is refused, nothing sent", async (tool) => {
    const cursor = cursorFor(tool, {}, TOOLS[tool].max + 1);
    const error = refusal(await callTool(await session(), tool, { cursor }));
    expect(error.code).toBe("validation");
    expect(error.message).toContain("points past the last position");
    expect(sent()).toBe(0);
  });
});
