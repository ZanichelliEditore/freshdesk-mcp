import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../../src/config.js";
import { createServer } from "../../../src/server.js";
import { createContext } from "../../../src/tools/context.js";
import { CLOSE, NAME_CAP, OPEN, TEXT_CAP } from "../../../src/tools/format.js";
import { listEnvelope } from "../../../src/tools/list.js";
import {
  FOLDER_CAP,
  MAX_POSITION,
  PAGE_SIZE,
  RESPONSE_CAP,
} from "../../../src/tools/toolsets/core/canned.js";
import { DATA_NOT_INSTRUCTIONS } from "../../../src/tools/toolsets/index.js";
import { cannedFolderPages, cannedFolderView, cannedResponseView } from "../../fixtures/canned.js";
import {
  type CallResult,
  callTool,
  listTools,
  open,
  type Session,
} from "../../support/mcp-session.js";
import { type MockAgent, mockDispatcher } from "../../support/mock-dispatcher.js";

// Every name, title and text here is invented (test/fixtures/canned.ts).

const DOMAIN = "acme.freshdesk.com";
const ORIGIN = `https://${DOMAIN}`;
const JSON_TYPE = { "content-type": "application/json" };

const FOLDERS = "/api/v2/canned_response_folders?per_page=100";
const folderView = (id: number) => `/api/v2/canned_response_folders/${id}`;
const RESPONSE = "/api/v2/canned_responses/3601";
/** Budget headers below the default reserve of 20 %. */
const LOW = { "x-ratelimit-total": "100", "x-ratelimit-remaining": "10" };

const dir = mkdtempSync(join(tmpdir(), "freshdesk-mcp-canned-"));
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

function reply(path: string, body: unknown, status = 200, headers: Record<string, string> = {}) {
  mock
    .get(ORIGIN)
    .intercept({ path, method: "GET" })
    .reply(status, body as object, { headers: { ...JSON_TYPE, ...headers } });
}

/** A folder's view (`GET /canned_response_folders/{id}`) with these responses. */
function viewOf(id: number, responses: { id: number; title: string }[] = []) {
  return { ...cannedFolderView, id, canned_responses: responses };
}

function sent(): number {
  return mock.getCallHistory()?.calls().length ?? 0;
}

function ok<T = Record<string, unknown>>(result: CallResult): T {
  expect(result.isError).toBeFalsy();
  return JSON.parse(result.content[0].text) as T;
}

function refusal(result: CallResult): { code: string; message: string } {
  expect(result.isError).toBe(true);
  return (JSON.parse(result.content[0].text) as { error: { code: string; message: string } }).error;
}

/** A cursor this server would give for `tool` called with `args`, at `position`. */
function cursorFor(tool: string, args: Record<string, unknown>, position: number): string {
  return listEnvelope({ tool, args }, { items: [], next: position, api_calls_used: 0 })
    .next_cursor!;
}

const wrapped = (text: string) => `${OPEN}${text}${CLOSE}`;

/**
 * Runs a call on a fake clock until it settles: the list's requests are
 * `expensive`, paced at 2 a second.
 */
async function paced(call: () => Promise<CallResult>): Promise<CallResult> {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  try {
    let result: CallResult | undefined;
    void call().then((value) => {
      result = value;
    });
    while (result === undefined) {
      await new Promise((resolve) => setImmediate(resolve));
      if (result === undefined) await vi.advanceTimersByTimeAsync(100);
    }
    return result;
  } finally {
    vi.useRealTimers();
  }
}

const list = (args: Record<string, unknown> = {}) =>
  paced(async () => callTool(await session(), "list_canned_responses", args));

interface Folder {
  id: number;
  name: string;
  personal: boolean | null;
  responses: { id: number; title: string; shared: null }[];
}

interface Envelope {
  items: Folder[];
  has_more: boolean;
  next_cursor?: string;
  truncated?: boolean;
  api_calls_used: number;
}

/** `count` folders from the fixture's first, ids from 5001. */
function folders(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    ...cannedFolderPages[0][0],
    id: 5001 + i,
    name: `Shelf ${i + 1}`,
  }));
}

describe("the listing", () => {
  it("lists both tools read-only, with a cost; only get_canned_response carries the data note", async () => {
    const tools = await listTools(await session());
    for (const name of ["list_canned_responses", "get_canned_response"]) {
      const tool = tools.find((listed) => listed.name === name);
      expect(tool?.annotations.readOnlyHint).toBe(true);
      expect(tool?.annotations.destructiveHint).toBe(false);
      expect(tool?.description).toContain("Cost: ");
      expect(tool?.description).toContain(
        "should not be reused as team guidance unless it is shared",
      );
      expect(tool?.description.includes(DATA_NOT_INSTRUCTIONS)).toBe(
        name === "get_canned_response",
      );
    }
  });

  it("the tools' file has no zod default or transform", () => {
    const source = readFileSync(
      new URL("../../../src/tools/toolsets/core/canned.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("z.object(");
    expect(source).not.toContain(".default(");
    expect(source).not.toContain(".transform(");
  });

  it("the description's numbers are the constants", async () => {
    const tools = await listTools(await session());
    const text = (name: string) => tools.find((tool) => tool.name === name)?.description ?? "";
    expect(text("list_canned_responses")).toContain(`${PAGE_SIZE} folders a call`);
    expect(text("list_canned_responses")).toContain(`first ${FOLDER_CAP} folders`);
    expect(text("list_canned_responses")).toContain(`first ${RESPONSE_CAP} titles`);
    expect(text("list_canned_responses")).toContain("expensive");
    expect(text("get_canned_response")).toContain(TEXT_CAP.toLocaleString("en-US"));
  });

  it("MAX_POSITION is the last page of the folder cap", () => {
    expect(MAX_POSITION).toBe(FOLDER_CAP / PAGE_SIZE - 1);
  });
});

describe("list_canned_responses", () => {
  it("returns the fixture's folders and titles in the envelope; api_calls_used is the MockAgent count", async () => {
    reply(FOLDERS, cannedFolderPages[0], 200, {
      link: `<${ORIGIN}${FOLDERS}&page=2>; rel="next"`,
    });
    reply(`${FOLDERS}&page=2`, cannedFolderPages[1]);
    reply(folderView(3501), cannedFolderView);
    reply(folderView(3502), viewOf(3502, [{ id: 3603, title: "Spanner sizes" }]));
    reply(folderView(3503), viewOf(3503));
    const result = ok<Envelope>(await list());
    expect(result).toEqual({
      items: [
        {
          id: 3501,
          name: "Sprocket Replies",
          personal: false,
          responses: [
            { id: 3601, title: "Sprocket on its way", shared: null },
            { id: 3602, title: "Oil before fitting", shared: null },
          ],
        },
        {
          id: 3502,
          name: "My Spanner Notes",
          personal: true,
          responses: [{ id: 3603, title: "Spanner sizes", shared: null }],
        },
        { id: 3503, name: "Widget Returns", personal: false, responses: [] },
      ],
      has_more: false,
      api_calls_used: 5,
    });
    expect(result.api_calls_used).toBe(sent());
  });

  it("a listed response's shared is null, unknown until viewed, even in a folder with personal: false", async () => {
    reply(FOLDERS, [cannedFolderPages[0][0]]);
    reply(folderView(3501), cannedFolderView);
    const [folder] = ok<Envelope>(await list()).items;
    expect(folder.personal).toBe(false);
    expect(folder.responses.map((response) => response.shared)).toEqual([null, null]);
  });

  it("the description says a listed response's sharing is unknown until viewed", async () => {
    const tools = await listTools(await session());
    expect(tools.find((tool) => tool.name === "list_canned_responses")?.description).toContain(
      "A listed response's sharing is unknown until viewed (shared: null); a folder's personal: false does not make it shared.",
    );
  });

  it("a folder's personal missing or unreadable is null", async () => {
    const unmarked: Record<string, unknown> = structuredClone(cannedFolderPages[0][0]);
    delete unmarked.personal;
    reply(FOLDERS, [unmarked, { ...cannedFolderPages[0][1], personal: "yes" }]);
    reply(folderView(3501), viewOf(3501));
    reply(folderView(3502), viewOf(3502));
    const result = ok<Envelope>(await list());
    expect(result.items.map((folder) => folder.personal)).toEqual([null, null]);
  });

  it("a folder name and a response title lose their HTML tag and are cut at the name cap, not wrapped", async () => {
    const long = "T".repeat(NAME_CAP + 5);
    reply(FOLDERS, [{ ...cannedFolderPages[0][0], name: "<b>Sprocket</b> Replies" }]);
    reply(
      folderView(3501),
      viewOf(3501, [
        { id: 3601, title: "Sprocket <em>on its</em> way" },
        { id: 3602, title: long },
      ]),
    );
    const response = await list();
    const [folder] = ok<Envelope>(response).items;
    expect(folder.name).toBe("Sprocket Replies");
    expect(folder.responses.map((item) => item.title)).toEqual([
      "Sprocket on its way",
      `${"T".repeat(NAME_CAP)}…`,
    ]);
    expect(response.content[0].text).not.toContain(OPEN);
    expect(response.content[0].text).not.toMatch(/<\/?(b|em)>/);
  });

  it(`gives ${PAGE_SIZE} folders a call; the next cursor gives the rest, the folder list read again`, async () => {
    const all = folders(PAGE_SIZE + 2);
    reply(FOLDERS, all);
    for (const folder of all.slice(0, PAGE_SIZE)) reply(folderView(folder.id), viewOf(folder.id));
    const first = ok<Envelope>(await list());
    expect(first.items.map((folder) => folder.id)).toEqual(
      all.slice(0, PAGE_SIZE).map((f) => f.id),
    );
    expect(first.has_more).toBe(true);
    expect(first.truncated).toBeUndefined();
    expect(first.api_calls_used).toBe(1 + PAGE_SIZE);
    expect(sent()).toBe(1 + PAGE_SIZE);

    reply(FOLDERS, all);
    for (const folder of all.slice(PAGE_SIZE)) reply(folderView(folder.id), viewOf(folder.id));
    const second = ok<Envelope>(await list({ cursor: first.next_cursor }));
    expect(second.items.map((folder) => folder.id)).toEqual([5001 + PAGE_SIZE, 5002 + PAGE_SIZE]);
    expect(second.has_more).toBe(false);
    expect(second.next_cursor).toBeUndefined();
    expect(second.api_calls_used).toBe(3);
    expect(sent()).toBe(1 + PAGE_SIZE + 3);
  });

  it(`folders past the first ${FOLDER_CAP} are cut: truncated: true, the last page has no more`, async () => {
    const all = folders(FOLDER_CAP + 1);
    reply(FOLDERS, all);
    const last = all.slice(FOLDER_CAP - PAGE_SIZE, FOLDER_CAP);
    for (const folder of last) reply(folderView(folder.id), viewOf(folder.id));
    const cursor = cursorFor("list_canned_responses", {}, MAX_POSITION);
    const result = ok<Envelope>(await list({ cursor }));
    expect(result.items.map((folder) => folder.id)).toEqual(last.map((folder) => folder.id));
    expect(result.truncated).toBe(true);
    expect(result.has_more).toBe(false);
    expect(result.api_calls_used).toBe(sent());
  });

  it(`exactly ${FOLDER_CAP} folders: the last page has no more and no truncated key`, async () => {
    const all = folders(FOLDER_CAP);
    reply(FOLDERS, all);
    for (const folder of all.slice(FOLDER_CAP - PAGE_SIZE)) {
      reply(folderView(folder.id), viewOf(folder.id));
    }
    const cursor = cursorFor("list_canned_responses", {}, MAX_POSITION);
    const result = ok<Envelope>(await list({ cursor }));
    expect(result.items).toHaveLength(PAGE_SIZE);
    expect(result.has_more).toBe(false);
    expect(result).not.toHaveProperty("truncated");
  });

  it(`a folder's titles past the first ${RESPONSE_CAP} are cut: truncated: true`, async () => {
    const many = Array.from({ length: RESPONSE_CAP + 1 }, (_, i) => ({
      id: 6001 + i,
      title: `Reply ${i + 1}`,
    }));
    reply(FOLDERS, [cannedFolderPages[0][0]]);
    reply(folderView(3501), viewOf(3501, many));
    const result = ok<Envelope>(await list());
    expect(result.items[0].responses).toHaveLength(RESPONSE_CAP);
    expect(result.items[0].responses.at(-1)?.id).toBe(6000 + RESPONSE_CAP);
    expect(result.truncated).toBe(true);
  });

  it(`a folder with exactly ${RESPONSE_CAP} titles: no truncated key`, async () => {
    const many = Array.from({ length: RESPONSE_CAP }, (_, i) => ({
      id: 6001 + i,
      title: `Reply ${i + 1}`,
    }));
    reply(FOLDERS, [cannedFolderPages[0][0]]);
    reply(folderView(3501), viewOf(3501, many));
    const result = ok<Envelope>(await list());
    expect(result.items[0].responses).toHaveLength(RESPONSE_CAP);
    expect(result).not.toHaveProperty("truncated");
  });

  it("a folder list the source's page cap cut says truncated: true", async () => {
    for (let n = 1; n <= 10; n += 1) {
      reply(n === 1 ? FOLDERS : `${FOLDERS}&page=${n}`, [], 200, {
        link: `<${ORIGIN}${FOLDERS}&page=${n + 1}>; rel="next"`,
      });
    }
    const result = ok<Envelope>(await list());
    expect(result.items).toEqual([]);
    expect(result.truncated).toBe(true);
    expect(result.api_calls_used).toBe(sent());
  });

  it("no folders: an empty list, one request", async () => {
    reply(FOLDERS, []);
    expect(ok<Envelope>(await list())).toEqual({ items: [], has_more: false, api_calls_used: 1 });
    expect(sent()).toBe(1);
  });

  it("a cursor from another call is isError validation, nothing sent", async () => {
    const cursor = cursorFor("list_solution_tree", {}, 1);
    const error = refusal(await list({ cursor }));
    expect(error.code).toBe("validation");
    expect(sent()).toBe(0);
  });

  it("a cursor at maxPosition is accepted", async () => {
    reply(FOLDERS, cannedFolderPages[0]);
    const cursor = cursorFor("list_canned_responses", {}, MAX_POSITION);
    const result = ok<Envelope>(await list({ cursor }));
    expect(result.items).toEqual([]);
    expect(result.has_more).toBe(false);
    expect(result.api_calls_used).toBe(sent());
  });

  it("a cursor at maxPosition + 1 is isError validation, nothing sent", async () => {
    const cursor = cursorFor("list_canned_responses", {}, MAX_POSITION + 1);
    const error = refusal(await list({ cursor }));
    expect(error.code).toBe("validation");
    expect(error.message).toContain("points past the last position");
    expect(sent()).toBe(0);
  });

  it("the folder list is expensive: below the reserve the first folder view is refused, nothing more sent", async () => {
    reply(FOLDERS, cannedFolderPages[0], 200, LOW);
    const error = refusal(await list());
    expect(error.code).toBe("rate_limited");
    expect(sent()).toBe(1);
  });

  it("the folder list's pages are expensive: below the reserve page 2 is refused, nothing more sent", async () => {
    reply(FOLDERS, cannedFolderPages[0], 200, {
      ...LOW,
      link: `<${ORIGIN}${FOLDERS}&page=2>; rel="next"`,
    });
    const error = refusal(await list());
    expect(error.code).toBe("rate_limited");
    expect(sent()).toBe(1);
  });

  it("the second folder view is expensive: below the reserve after the first it is refused", async () => {
    reply(FOLDERS, cannedFolderPages[0]);
    reply(folderView(3501), cannedFolderView, 200, LOW);
    const error = refusal(await list());
    expect(error.code).toBe("rate_limited");
    expect(sent()).toBe(2);
  });

  it("a folder's list failing fails the call: not_found", async () => {
    reply(FOLDERS, cannedFolderPages[0]);
    reply(folderView(3501), { message: "gone" }, 404);
    expect(refusal(await list()).code).toBe("not_found");
  });

  it("a client error is isError with its code", async () => {
    reply(FOLDERS, { message: "denied" }, 403);
    expect(refusal(await list()).code).toBe("forbidden");
  });
});

describe("get_canned_response", () => {
  it("returns the plain text inside <ticket_content>, no HTML tag, the title through the name helper", async () => {
    reply(RESPONSE, { ...cannedResponseView, title: "<b>Sprocket</b> on its way" });
    const response = await callTool(await session(), "get_canned_response", {
      canned_response_id: 3601,
    });
    expect(ok(response)).toEqual({
      id: 3601,
      title: "Sprocket on its way",
      folder_id: 3501,
      visibility: "all agents",
      shared: true,
      text: wrapped("Your new sprocket ships today.\nRegards, {{ticket.agent.name}}"),
      api_calls_used: 1,
    });
    expect(sent()).toBe(1);
    expect(response.content[0].text).not.toContain("<div");
    expect(response.content[0].text).not.toContain("<b>");
  });

  it.each([
    [0, "all agents"],
    [1, "personal"],
    [2, "selected groups"],
    [3, null],
    [-1, null],
    [null, null],
  ])("visibility %j is named %j, shared only for all agents", async (visibility, name) => {
    reply(RESPONSE, { ...cannedResponseView, visibility });
    const result = ok(
      await callTool(await session(), "get_canned_response", { canned_response_id: 3601 }),
    );
    expect(result.visibility).toBe(name);
    expect(result.shared).toBe(name === "all agents");
  });

  it("a missing visibility and folder_id give null, shared: false", async () => {
    const bare: Record<string, unknown> = structuredClone(cannedResponseView);
    delete bare.visibility;
    delete bare.folder_id;
    reply(RESPONSE, bare);
    const result = ok(
      await callTool(await session(), "get_canned_response", { canned_response_id: 3601 }),
    );
    expect(result.visibility).toBeNull();
    expect(result.folder_id).toBeNull();
    expect(result.shared).toBe(false);
  });

  it.each([
    ["Use <b>oil</b> sparingly.", "Use oil sparingly."],
    // Not tag-shaped: kept, `<` neutralised by untrusted as in any block.
    ["Torque < 5 Nm, then > 3 turns", "Torque ‹ 5 Nm, then > 3 turns"],
    // Entities are not decoded: `&lt;` is neutralised by untrusted, no tag forms.
    ["Write &lt;b&gt;bold&lt;/b&gt; here.", "Write ‹b&gt;bold‹/b&gt; here."],
  ])("the plain text %j comes back as %j inside the block", async (text, want) => {
    reply(RESPONSE, { ...cannedResponseView, content: text });
    const response = await callTool(await session(), "get_canned_response", {
      canned_response_id: 3601,
    });
    expect(ok(response).text).toBe(wrapped(want));
    expect(response.content[0].text).not.toMatch(/<\/?b>/);
  });

  it(`a text over ${TEXT_CAP} characters is cut, the marker after the block`, async () => {
    reply(RESPONSE, { ...cannedResponseView, content: "x".repeat(TEXT_CAP + 7) });
    const result = ok(
      await callTool(await session(), "get_canned_response", { canned_response_id: 3601 }),
    );
    expect(result.text).toBe(`${wrapped("x".repeat(TEXT_CAP))}\n[… 7 more characters not shown]`);
  });

  it("content null gives text: null", async () => {
    reply(RESPONSE, { ...cannedResponseView, content: null });
    const result = ok(
      await callTool(await session(), "get_canned_response", { canned_response_id: 3601 }),
    );
    expect(result.text).toBeNull();
  });

  it("an unknown id is isError not_found", async () => {
    reply(RESPONSE, { message: "gone" }, 404);
    expect(
      refusal(await callTool(await session(), "get_canned_response", { canned_response_id: 3601 }))
        .code,
    ).toBe("not_found");
    expect(sent()).toBe(1);
  });

  it.each([[0], [-3], [1.5], ["3601"], [Number.MAX_SAFE_INTEGER + 1]])(
    "canned_response_id %j is refused, nothing sent",
    async (id) => {
      const result = await callTool(await session(), "get_canned_response", {
        canned_response_id: id,
      });
      expect(result.isError).toBe(true);
      expect(sent()).toBe(0);
    },
  );
});
