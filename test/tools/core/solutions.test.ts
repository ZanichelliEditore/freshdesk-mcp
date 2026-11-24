import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../../src/config.js";
import { createServer } from "../../../src/server.js";
import { createContext } from "../../../src/tools/context.js";
import { CLOSE, NAME_CAP, OPEN } from "../../../src/tools/format.js";
import { listEnvelope } from "../../../src/tools/list.js";
import {
  ARTICLE_CAP,
  HIT_CAP,
  MAX_LISTS,
  MAX_POSITION,
  PAGE_SIZE,
} from "../../../src/tools/toolsets/core/solutions.js";
import { DATA_NOT_INSTRUCTIONS } from "../../../src/tools/toolsets/index.js";
import {
  articlePages,
  articleView,
  categoryPages,
  folderPages,
  searchHits,
} from "../../fixtures/solutions.js";
import {
  type CallResult,
  callTool,
  listTools,
  open,
  type Session,
} from "../../support/mcp-session.js";
import { type MockAgent, mockDispatcher } from "../../support/mock-dispatcher.js";

// Every name, title and text here is invented (test/fixtures/solutions.ts).

const DOMAIN = "acme.freshdesk.com";
const ORIGIN = `https://${DOMAIN}`;
const JSON_TYPE = { "content-type": "application/json" };

const TERM = "squeak";
const SEARCH = `/api/v2/search/solutions?term=${TERM}`;
const CATEGORIES = "/api/v2/solutions/categories?per_page=100";
const foldersOf = (id: number) => `/api/v2/solutions/categories/${id}/folders?per_page=100`;
const articlesOf = (id: number) => `/api/v2/solutions/folders/${id}/articles?per_page=100`;
const ARTICLE = "/api/v2/solutions/articles/3301";

const dir = mkdtempSync(join(tmpdir(), "freshdesk-mcp-solutions-"));
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

function reply(path: string, body: unknown, status = 200) {
  mock
    .get(ORIGIN)
    .intercept({ path, method: "GET" })
    .reply(status, body as object, { headers: JSON_TYPE });
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

interface Envelope {
  items: Record<string, unknown>[];
  has_more: boolean;
  next_cursor?: string;
  truncated?: boolean;
  api_calls_used: number;
}

/** `count` search hits from the fixture's first, ids from 4001. */
function hits(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    ...structuredClone(searchHits[0]),
    id: 4001 + i,
    title: `Squeak note ${i + 1}`,
  }));
}

describe("the listing", () => {
  it("lists the three tools read-only, with a cost; only get_solution_article carries the data note", async () => {
    const tools = await listTools(await session());
    for (const name of ["search_solutions", "get_solution_article", "list_solution_tree"]) {
      const tool = tools.find((listed) => listed.name === name);
      expect(tool?.annotations.readOnlyHint).toBe(true);
      expect(tool?.annotations.destructiveHint).toBe(false);
      expect(tool?.description).toContain("Cost: ");
      expect(tool?.description).toMatch(/draft.*must not be quoted to a customer/s);
      expect(tool?.description.includes(DATA_NOT_INSTRUCTIONS)).toBe(
        name === "get_solution_article",
      );
    }
  });

  it("list_solution_tree has no cursor argument; search_solutions has one", async () => {
    const tools = (await listTools(await session())) as unknown as {
      name: string;
      inputSchema: { properties?: Record<string, unknown> };
    }[];
    const schema = (name: string) => tools.find((tool) => tool.name === name)?.inputSchema;
    expect(Object.keys(schema("list_solution_tree")?.properties ?? {})).not.toContain("cursor");
    expect(Object.keys(schema("search_solutions")?.properties ?? {})).toContain("cursor");
  });

  it("the tools' file has no zod default or transform", () => {
    const source = readFileSync(
      new URL("../../../src/tools/toolsets/core/solutions.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("z.object(");
    expect(source).not.toContain(".default(");
    expect(source).not.toContain(".transform(");
  });

  it("the description's numbers are the constants", async () => {
    const tools = await listTools(await session());
    const text = (name: string) => tools.find((tool) => tool.name === name)?.description ?? "";
    expect(text("search_solutions")).toContain(`${PAGE_SIZE} a call`);
    expect(text("search_solutions")).toContain(`first ${HIT_CAP} hits`);
    expect(text("get_solution_article")).toContain(`${ARTICLE_CAP.toLocaleString("en-US")}`);
    expect(text("list_solution_tree")).toContain(`at most ${MAX_LISTS} lists`);
  });
});

describe("search_solutions", () => {
  it("returns the envelope with the hits' ids, titles, status and visibility by name", async () => {
    reply(SEARCH, searchHits);
    const result = ok<Envelope>(
      await callTool(await session(), "search_solutions", { term: TERM }),
    );
    expect(result).toEqual({
      items: [
        {
          id: 3302,
          title: "Quieting a squeak",
          status: "published",
          visibility: "all users",
          updated_at: "2026-01-03T10:00:00Z",
        },
        {
          id: 3304,
          title: "Squeak after oiling",
          status: "published",
          visibility: "agents only",
          updated_at: "2026-01-03T10:00:00Z",
        },
      ],
      has_more: false,
      api_calls_used: 1,
    });
    // The intercept is on SEARCH, term included: a reply means it was sent so.
    expect(sent()).toBe(1);
    expect(result.api_calls_used).toBe(sent());
  });

  it.each([
    [1, "all users"],
    [2, "logged-in users"],
    [3, "agents only"],
    [4, "selected companies"],
    [5, null],
    [0, null],
    [null, null],
  ])("folder_visibility %j is named %j", async (visibility, name) => {
    reply(SEARCH, [{ ...searchHits[0], folder_visibility: visibility }]);
    const result = ok<Envelope>(
      await callTool(await session(), "search_solutions", { term: TERM }),
    );
    expect(result.items[0].visibility).toBe(name);
  });

  it.each([
    [1, "draft"],
    [2, "published"],
    [3, null],
  ])("status %j is named %j", async (status, name) => {
    reply(SEARCH, [{ ...searchHits[0], status }]);
    const result = ok<Envelope>(
      await callTool(await session(), "search_solutions", { term: TERM }),
    );
    expect(result.items[0].status).toBe(name);
  });

  it("a title loses its HTML tag and is cut at the name cap, not wrapped", async () => {
    const long = "T".repeat(NAME_CAP + 5);
    reply(SEARCH, [
      { ...searchHits[0], title: "<b>Quieting</b> a squeak" },
      { ...searchHits[1], title: long },
    ]);
    const response = await callTool(await session(), "search_solutions", { term: TERM });
    const [tagged, cut] = ok<Envelope>(response).items;
    expect(tagged.title).toBe("Quieting a squeak");
    expect(cut.title).toBe(`${"T".repeat(NAME_CAP)}…`);
    expect(response.content[0].text).not.toContain(OPEN);
  });

  it(`pages the hits ${PAGE_SIZE} a call; the search runs again for the next page`, async () => {
    reply(SEARCH, hits(PAGE_SIZE + 3));
    reply(SEARCH, hits(PAGE_SIZE + 3));
    const open = await session();
    const first = ok<Envelope>(await callTool(open, "search_solutions", { term: TERM }));
    expect(first.items.map((item) => item.id)).toEqual(
      Array.from({ length: PAGE_SIZE }, (_, i) => 4001 + i),
    );
    expect(first.has_more).toBe(true);
    expect(first.truncated).toBeUndefined();

    const second = ok<Envelope>(
      await callTool(open, "search_solutions", { term: TERM, cursor: first.next_cursor }),
    );
    expect(second.items.map((item) => item.id)).toEqual([
      4001 + PAGE_SIZE,
      4002 + PAGE_SIZE,
      4003 + PAGE_SIZE,
    ]);
    expect(second.has_more).toBe(false);
    expect(second.next_cursor).toBeUndefined();
    expect(second.api_calls_used).toBe(1);
    expect(sent()).toBe(2);
  });

  it(`hits past the first ${HIT_CAP} are cut: truncated: true, the last page has no more`, async () => {
    reply(SEARCH, hits(HIT_CAP + 1));
    const cursor = cursorFor("search_solutions", { term: TERM }, MAX_POSITION);
    const result = ok<Envelope>(
      await callTool(await session(), "search_solutions", { term: TERM, cursor }),
    );
    expect(result.items).toHaveLength(PAGE_SIZE);
    expect(result.items.at(-1)?.id).toBe(4000 + HIT_CAP);
    expect(result.truncated).toBe(true);
    expect(result.has_more).toBe(false);
  });

  it("MAX_POSITION is the last page of the hit cap", () => {
    expect(MAX_POSITION).toBe(HIT_CAP / PAGE_SIZE - 1);
  });

  it("a cursor from another call is isError validation, nothing sent", async () => {
    const cursor = cursorFor("search_solutions", { term: "oil" }, 1);
    const error = refusal(
      await callTool(await session(), "search_solutions", { term: TERM, cursor }),
    );
    expect(error.code).toBe("validation");
    expect(sent()).toBe(0);
  });

  it("a cursor at maxPosition is accepted", async () => {
    reply(SEARCH, searchHits);
    const cursor = cursorFor("search_solutions", { term: TERM }, MAX_POSITION);
    const result = ok<Envelope>(
      await callTool(await session(), "search_solutions", { term: TERM, cursor }),
    );
    expect(result.items).toEqual([]);
    expect(result.has_more).toBe(false);
    expect(result.api_calls_used).toBe(sent());
  });

  it("a cursor at maxPosition + 1 is isError validation, nothing sent", async () => {
    const cursor = cursorFor("search_solutions", { term: TERM }, MAX_POSITION + 1);
    const error = refusal(
      await callTool(await session(), "search_solutions", { term: TERM, cursor }),
    );
    expect(error.code).toBe("validation");
    expect(error.message).toContain("points past the last position");
    expect(sent()).toBe(0);
  });

  it("a blank term is isError validation, nothing sent", async () => {
    expect(refusal(await callTool(await session(), "search_solutions", { term: "  " })).code).toBe(
      "validation",
    );
    expect(sent()).toBe(0);
  });

  it("a client error is isError with its code", async () => {
    reply(SEARCH, { message: "denied" }, 403);
    expect(refusal(await callTool(await session(), "search_solutions", { term: TERM })).code).toBe(
      "forbidden",
    );
  });
});

describe("get_solution_article", () => {
  it("returns the plain text inside <ticket_content>, no HTML tag, the title through the name helper", async () => {
    reply(ARTICLE, { ...articleView, title: "<i>Fitting</i> a new sprocket" });
    const response = await callTool(await session(), "get_solution_article", { article_id: 3301 });
    expect(ok(response)).toEqual({
      id: 3301,
      title: "Fitting a new sprocket",
      status: "published",
      updated_at: "2026-01-03T10:00:00Z",
      text: wrapped("Line the teeth up first, then turn gently."),
      api_calls_used: 1,
    });
    expect(response.content[0].text).not.toContain("<p>");
    expect(response.content[0].text).not.toContain("<i>");
  });

  it("a draft says status: draft", async () => {
    reply(ARTICLE, { ...articleView, status: 1 });
    const result = ok(
      await callTool(await session(), "get_solution_article", { article_id: 3301 }),
    );
    expect(result.status).toBe("draft");
  });

  it(`a text over ${ARTICLE_CAP} characters is cut, the marker after the block`, async () => {
    reply(ARTICLE, { ...articleView, description_text: "x".repeat(ARTICLE_CAP + 7) });
    const result = ok(
      await callTool(await session(), "get_solution_article", { article_id: 3301 }),
    );
    expect(result.text).toBe(
      `${wrapped("x".repeat(ARTICLE_CAP))}\n[… 7 more characters not shown]`,
    );
  });

  it("an empty article gives text: null", async () => {
    reply(ARTICLE, { ...articleView, description_text: null });
    const result = ok(
      await callTool(await session(), "get_solution_article", { article_id: 3301 }),
    );
    expect(result.text).toBeNull();
  });

  it("an unknown article is isError not_found", async () => {
    reply(ARTICLE, { message: "gone" }, 404);
    expect(
      refusal(await callTool(await session(), "get_solution_article", { article_id: 3301 })).code,
    ).toBe("not_found");
  });

  it.each([[0], [-3], [1.5], ["3301"]])("article_id %j is refused, nothing sent", async (id) => {
    const result = await callTool(await session(), "get_solution_article", { article_id: id });
    expect(result.isError).toBe(true);
    expect(sent()).toBe(0);
  });
});

describe("list_solution_tree", () => {
  /** The fixture tree: two categories; the first has two folders, the second none. */
  function queueTree() {
    reply(CATEGORIES, categoryPages[0]);
    reply(foldersOf(3101), folderPages[0]);
    reply(foldersOf(3102), []);
    reply(articlesOf(3201), articlePages[0]);
    reply(articlesOf(3202), articlePages[1]);
  }

  it("returns the fixture tree, names through the name helper, api_calls_used the MockAgent count", async () => {
    queueTree();
    const result = ok(await callTool(await session(), "list_solution_tree", {}));
    expect(result).toEqual({
      categories: [
        {
          id: 3101,
          name: "Widget Basics",
          folders: [
            {
              id: 3201,
              name: "Getting Started",
              visibility: "all users",
              articles: [
                {
                  id: 3301,
                  title: "Fitting a new sprocket",
                  status: "published",
                  updated_at: "2026-01-03T10:00:00Z",
                },
                {
                  id: 3302,
                  title: "Quieting a squeak",
                  status: "draft",
                  updated_at: "2026-01-03T10:00:00Z",
                },
              ],
            },
            {
              id: 3202,
              name: "Squeaks and Rattles",
              visibility: "agents only",
              articles: [
                {
                  id: 3303,
                  title: "Storing spanners",
                  status: "published",
                  updated_at: "2026-01-03T10:00:00Z",
                },
              ],
            },
          ],
        },
        { id: 3102, name: "Sprocket Care", folders: [] },
      ],
      truncated: false,
      api_calls_used: 5,
    });
    expect(result.api_calls_used).toBe(sent());
  });

  it("a folder name and an article title lose their HTML tag", async () => {
    reply(CATEGORIES, [categoryPages[0][0]]);
    reply(foldersOf(3101), [{ ...folderPages[0][0], name: "<b>Getting</b> Started" }]);
    reply(articlesOf(3201), [{ ...articlePages[0][0], title: "Fitting <em>a new</em> sprocket" }]);
    const response = await callTool(await session(), "list_solution_tree", {});
    const result = ok<{
      categories: { folders: { name: string; articles: { title: string }[] }[] }[];
    }>(response);
    const [folder] = result.categories[0].folders;
    expect(folder.name).toBe("Getting Started");
    expect(folder.articles[0].title).toBe("Fitting a new sprocket");
    expect(response.content[0].text).not.toContain(OPEN);
  });

  it(`stops at ${MAX_LISTS} lists with truncated: true; the folders not read have articles: null`, async () => {
    // One category with MAX_LISTS folders: 1 + 1 + MAX_LISTS lists would be needed.
    const folders = Array.from({ length: MAX_LISTS }, (_, i) => ({
      ...folderPages[0][0],
      id: 5001 + i,
      name: `Shelf ${i + 1}`,
    }));
    reply(CATEGORIES, [categoryPages[0][0]]);
    reply(foldersOf(3101), folders);
    for (let i = 0; i < MAX_LISTS - 2; i += 1) reply(articlesOf(5001 + i), []);
    const result = ok<{
      categories: { folders: { id: number; articles: unknown[] | null }[] }[];
      truncated: boolean;
      api_calls_used: number;
    }>(await callTool(await session(), "list_solution_tree", {}));
    const read = result.categories[0].folders.filter((folder) => folder.articles !== null);
    const unread = result.categories[0].folders.filter((folder) => folder.articles === null);
    expect(read).toHaveLength(MAX_LISTS - 2);
    expect(unread.map((folder) => folder.id)).toEqual([5001 + MAX_LISTS - 2, 5001 + MAX_LISTS - 1]);
    expect(result.truncated).toBe(true);
    expect(sent()).toBe(MAX_LISTS);
    expect(result.api_calls_used).toBe(sent());
  });

  it("a category whose folders were not read has folders: null", async () => {
    const categories = Array.from({ length: MAX_LISTS + 1 }, (_, i) => ({
      ...categoryPages[0][0],
      id: 6001 + i,
      name: `Topic ${i + 1}`,
    }));
    reply(CATEGORIES, categories);
    for (let i = 0; i < MAX_LISTS - 1; i += 1) reply(foldersOf(6001 + i), []);
    const result = ok<{
      categories: { id: number; folders: unknown[] | null }[];
      truncated: boolean;
    }>(await callTool(await session(), "list_solution_tree", {}));
    expect(result.categories.filter((category) => category.folders === null)).toHaveLength(2);
    expect(result.truncated).toBe(true);
    expect(sent()).toBe(MAX_LISTS);
  });

  it("a list a source cap cut says truncated: true", async () => {
    // Categories on 10 linked pages: listAll's cap cuts the 11th.
    for (let n = 1; n <= 10; n += 1) {
      const path = n === 1 ? CATEGORIES : `${CATEGORIES}&page=${n}`;
      mock
        .get(ORIGIN)
        .intercept({ path, method: "GET" })
        .reply(200, [] as object, {
          headers: { ...JSON_TYPE, link: `<${ORIGIN}${CATEGORIES}&page=${n + 1}>; rel="next"` },
        });
    }
    const result = ok<{ categories: unknown[]; truncated: boolean; api_calls_used: number }>(
      await callTool(await session(), "list_solution_tree", {}),
    );
    expect(result.categories).toEqual([]);
    expect(result.truncated).toBe(true);
    expect(result.api_calls_used).toBe(sent());
  });

  it("a client error is isError with its code", async () => {
    reply(CATEGORIES, { message: "denied" }, 403);
    expect(refusal(await callTool(await session(), "list_solution_tree", {})).code).toBe(
      "forbidden",
    );
  });
});
