import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpClient } from "../../../src/client/http.js";
import { RateLimiter } from "../../../src/client/rate-limit.js";
import {
  getArticle,
  getCategory,
  getFolder,
  listArticles,
  listCategories,
  listFolders,
  MAX_TERM_LENGTH,
  searchArticles,
} from "../../../src/client/resources/solutions.js";
import {
  articlePages,
  articleView,
  categoryPages,
  folderPages,
  folderView,
  searchHits,
} from "../../fixtures/solutions.js";
import { type MockAgent, mockDispatcher } from "../../support/mock-dispatcher.js";

const DOMAIN = "acme.freshdesk.com";
const ORIGIN = `https://${DOMAIN}`;
const JSON_TYPE = { "content-type": "application/json" };
/** Put in malformed bodies: no error message may quote it. */
const CANARY = "Canary-Body-Text-5523";

const CATEGORIES = "/api/v2/solutions/categories";
const FOLDERS = "/api/v2/solutions/categories/3101/folders";
const ARTICLES = "/api/v2/solutions/folders/3201/articles";
const ARTICLE = "/api/v2/solutions/articles/3301";
const SEARCH = "/api/v2/search/solutions";

let mock: MockAgent;
let http: HttpClient;

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  mock = mockDispatcher();
  http = new HttpClient({
    domain: DOMAIN,
    apiKey: "k3y-Secret-Value-123",
    dispatcher: mock,
    limiter: new RateLimiter({ reserve_pct: 20, floor_pct: 5, pacing_rps: 2 }),
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await mock.close();
});

/** Queue one reply to `GET <pathname>`, whatever its query. */
function reply(pathname: string, status: number, body: unknown, next?: string) {
  mock
    .get(ORIGIN)
    .intercept({ path: (path: string) => path.split("?")[0] === pathname, method: "GET" })
    .reply(status, body as object, {
      headers: { ...JSON_TYPE, ...(next === undefined ? {} : { link: `<${next}>; rel="next"` }) },
    });
}

function urls(): URL[] {
  return mock
    .getCallHistory()!
    .calls()
    .map((call) => new URL(call.fullUrl));
}

function ok<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error("expected a success");
  return result as Extract<T, { ok: true }>;
}

function failure<T extends { ok: boolean }>(result: T) {
  if (result.ok) throw new Error("expected an error");
  return (result as unknown as { error: { code: string; message: string } }).error;
}

/** A local `validation` naming the parameter, with no request sent. */
function expectRefused(result: { ok: boolean }, name: string) {
  expect(failure(result)).toEqual({
    code: "validation",
    http_status: null,
    message: `Not sent: ${name} is not a valid value.`,
    retryable: false,
  });
  expect(result).not.toHaveProperty("attempts");
  expect(urls()).toHaveLength(0);
}

/** A `server` error with fixed text: nothing from the body. */
function expectMalformed(result: { ok: boolean }, noun: string) {
  const error = failure(result);
  expect(error).toEqual({
    code: "server",
    http_status: 200,
    message: `Freshdesk sent ${noun} in an unexpected shape (HTTP 200).`,
    retryable: false,
  });
  expect(JSON.stringify(result)).not.toContain(CANARY);
}

const pageUrl = (path: string, n: number) => `${ORIGIN}${path}?per_page=100&page=${n}`;

const BAD_IDS = [0, -1, 1.5, Number.NaN, 2 ** 53, "3101", null];

describe("listCategories", () => {
  it("follows two pages and returns every category's id and name, nothing else", async () => {
    reply(CATEGORIES, 200, categoryPages[0], pageUrl(CATEGORIES, 2));
    reply(CATEGORIES, 200, categoryPages[1]);

    const result = ok(await listCategories(http));

    expect(result.items).toEqual([
      { id: 3101, name: "Widget Basics" },
      { id: 3102, name: "Sprocket Care" },
      { id: 3103, name: "Spanner Lore" },
    ]);
    expect(JSON.stringify(result)).not.toContain("visible_in_portals");
    expect(result).toMatchObject({ truncated: false, attempts: 2 });
    expect(urls().map((url) => url.href)).toEqual([
      `${ORIGIN}${CATEGORIES}?per_page=100`,
      pageUrl(CATEGORIES, 2),
    ]);
  });

  it("stops at its cap of 10 pages with truncated: true", async () => {
    for (let n = 1; n <= 10; n += 1) {
      reply(CATEGORIES, 200, categoryPages[1], pageUrl(CATEGORIES, n + 1));
    }

    const result = ok(await listCategories(http));

    expect(result.items).toHaveLength(10);
    expect(result).toMatchObject({ truncated: true, attempts: 10 });
    expect(urls()).toHaveLength(10);
    expect(urls().map((url) => url.href)).not.toContain(pageUrl(CATEGORIES, 11));
  });

  it("passes the deadline on: one already passed sends nothing and is network", async () => {
    reply(CATEGORIES, 200, categoryPages[1]);

    expect(failure(await listCategories(http, Date.now() - 1))).toMatchObject({
      code: "network",
      http_status: null,
    });
    expect(urls()).toHaveLength(0);
  });
});

describe("listFolders", () => {
  it("follows two pages of a category's folders: ids, names and visibility, nothing else", async () => {
    reply(FOLDERS, 200, folderPages[0], pageUrl(FOLDERS, 2));
    reply(FOLDERS, 200, folderPages[1]);

    const result = ok(await listFolders(http, 3101));

    expect(result.items).toEqual([
      { id: 3201, name: "Getting Started", visibility: 1 },
      { id: 3202, name: "Squeaks and Rattles", visibility: 3 },
      { id: 3203, name: "Oiling Schedules", visibility: 1 },
    ]);
    expect(result).toMatchObject({ truncated: false, attempts: 2 });
    expect(urls().map((url) => url.pathname)).toEqual([FOLDERS, FOLDERS]);
  });

  it.each([
    ["missing", undefined],
    ["not a number", CANARY],
    ["not whole", 1.5],
    ["null", null],
  ])("gives visibility: null when it is %s", async (_label, visibility) => {
    const page = structuredClone(folderPages[1]) as Record<string, unknown>[];
    page[0]!.visibility = visibility;
    reply(FOLDERS, 200, page);

    const result = ok(await listFolders(http, 3101));

    expect(result.items).toEqual([{ id: 3203, name: "Oiling Schedules", visibility: null }]);
    expect(JSON.stringify(result)).not.toContain(CANARY);
  });

  it.each(BAD_IDS)("refuses the category id %s with nothing sent", async (id) => {
    expectRefused(await listFolders(http, id as number), "category id");
  });

  it("returns a 404 as not_found", async () => {
    reply("/api/v2/solutions/categories/3999/folders", 404, { message: CANARY });

    expect(failure(await listFolders(http, 3999)).code).toBe("not_found");
  });
});

describe("listArticles", () => {
  it("follows two pages of a folder's articles: ids, titles, status and updated_at, nothing else", async () => {
    reply(ARTICLES, 200, articlePages[0], pageUrl(ARTICLES, 2));
    reply(ARTICLES, 200, articlePages[1]);

    const result = ok(await listArticles(http, 3201));

    expect(result.items).toEqual([
      { id: 3301, title: "Fitting a new sprocket", status: 2, updated_at: "2026-01-03T10:00:00Z" },
      { id: 3302, title: "Quieting a squeak", status: 1, updated_at: "2026-01-03T10:00:00Z" },
      { id: 3303, title: "Storing spanners", status: 2, updated_at: "2026-01-03T10:00:00Z" },
    ]);
    expect(result).toMatchObject({ truncated: false, attempts: 2 });
    expect(urls().map((url) => url.pathname)).toEqual([ARTICLES, ARTICLES]);
  });

  it.each([
    ["missing", undefined],
    ["not a date-time", CANARY],
    ["a date-time with no zone", "2026-01-03T10:00:00"],
    ["null", null],
  ])("gives updated_at: null when it is %s", async (_label, updated) => {
    const page = structuredClone(articlePages[1]) as Record<string, unknown>[];
    page[0]!.updated_at = updated;
    reply(ARTICLES, 200, page);

    const result = ok(await listArticles(http, 3201));

    expect(result.items).toEqual([
      { id: 3303, title: "Storing spanners", status: 2, updated_at: null },
    ]);
    expect(JSON.stringify(result)).not.toContain(CANARY);
  });

  it.each(BAD_IDS)("refuses the folder id %s with nothing sent", async (id) => {
    expectRefused(await listArticles(http, id as number), "folder id");
  });

  it("returns a 404 as not_found", async () => {
    reply("/api/v2/solutions/folders/3999/articles", 404, { message: CANARY });

    expect(failure(await listArticles(http, 3999)).code).toBe("not_found");
  });
});

describe("the lists: a malformed item on page 2", () => {
  const cases = [
    {
      noun: "solution categories",
      path: CATEGORIES,
      pages: categoryPages,
      call: () => listCategories(http),
      key: "name",
    },
    {
      noun: "solution folders",
      path: FOLDERS,
      pages: folderPages,
      call: () => listFolders(http, 3101),
      key: "name",
    },
    {
      noun: "solution articles",
      path: ARTICLES,
      pages: articlePages,
      call: () => listArticles(http, 3201),
      key: "title",
    },
  ];

  it.each(cases)("$noun: a wrong id is server, with no body text", async (c) => {
    const pages = structuredClone(c.pages) as Record<string, unknown>[][];
    pages[1]![0]!.id = CANARY;
    reply(c.path, 200, pages[0], pageUrl(c.path, 2));
    reply(c.path, 200, pages[1]);

    expectMalformed(await c.call(), c.noun);
  });

  it.each(cases)("$noun: a missing name or title is server, with no body text", async (c) => {
    const pages = structuredClone(c.pages) as Record<string, unknown>[][];
    pages[1]![0]!.description = CANARY;
    delete pages[1]![0]![c.key];
    reply(c.path, 200, pages[0], pageUrl(c.path, 2));
    reply(c.path, 200, pages[1]);

    expectMalformed(await c.call(), c.noun);
  });

  it.each(cases)("$noun: a body that is not a list is server", async (c) => {
    reply(c.path, 200, { results: CANARY });

    expectMalformed(await c.call(), c.noun);
  });
});

describe("getArticle", () => {
  it("returns id, title, the plain text, status and updated_at, nothing else", async () => {
    reply(ARTICLE, 200, articleView);

    const result = ok(await getArticle(http, 3301));

    expect(result.article).toEqual({
      id: 3301,
      title: "Fitting a new sprocket",
      text: "Line the teeth up first, then turn gently.",
      status: 2,
      updated_at: "2026-01-03T10:00:00Z",
      folder_id: 3201,
    });
    expect(JSON.stringify(result)).not.toContain("<p>");
    expect(result.attempts).toBe(1);
    const sent = urls();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.pathname).toBe(ARTICLE);
    expect(sent[0]!.search).toBe("");
  });

  it("gives text: null for an empty article (description_text null)", async () => {
    reply(ARTICLE, 200, { ...articleView, description: "", description_text: null });

    expect(ok(await getArticle(http, 3301)).article.text).toBeNull();
  });

  it("gives updated_at: null when it is not a date-time", async () => {
    reply(ARTICLE, 200, { ...articleView, updated_at: CANARY });

    const result = ok(await getArticle(http, 3301));

    expect(result.article.updated_at).toBeNull();
    expect(JSON.stringify(result)).not.toContain(CANARY);
  });

  it.each([[undefined], [null], ["3201"], [0], [-2], [1.5], [2 ** 53]])(
    "gives folder_id: null when it is %j",
    async (folderId) => {
      reply(ARTICLE, 200, { ...articleView, folder_id: folderId });

      expect(ok(await getArticle(http, 3301)).article.folder_id).toBeNull();
    },
  );

  it.each(BAD_IDS)("refuses the id %s with nothing sent", async (id) => {
    expectRefused(await getArticle(http, id as number), "id");
  });

  it("returns a 404 as not_found, with its attempts", async () => {
    reply("/api/v2/solutions/articles/3999", 404, { message: CANARY });

    const result = await getArticle(http, 3999);

    expect(failure(result).code).toBe("not_found");
    expect(result).toMatchObject({ ok: false, attempts: 1 });
    expect(JSON.stringify(result)).not.toContain(CANARY);
  });

  it.each([
    ["a missing text", { description_text: undefined, description: CANARY }],
    ["a text that is not a string", { description_text: [CANARY] }],
    ["a status that is not a whole number", { status: CANARY }],
    ["a missing title", { title: undefined, description_text: CANARY }],
  ])("refuses %s as server, with no body text", async (_label, edit) => {
    reply(ARTICLE, 200, { ...articleView, ...edit });

    const result = await getArticle(http, 3301);

    expectMalformed(result, "a solution article");
    expect(result).toMatchObject({ attempts: 1 });
  });

  it("passes the deadline on: one already passed sends nothing and is network", async () => {
    reply(ARTICLE, 200, articleView);

    expect(failure(await getArticle(http, 3301, Date.now() - 1))).toMatchObject({
      code: "network",
      http_status: null,
    });
    expect(urls()).toHaveLength(0);
  });
});

describe("getCategory", () => {
  const CATEGORY = "/api/v2/solutions/categories/3101";

  it("returns id and name, nothing else (visible_in_portals dropped)", async () => {
    reply(CATEGORY, 200, categoryPages[0][0]);

    const result = ok(await getCategory(http, 3101));

    expect(result.category).toEqual({ id: 3101, name: "Widget Basics" });
    expect(result.attempts).toBe(1);
    expect(urls().map((url) => url.pathname + url.search)).toEqual([CATEGORY]);
  });

  it.each(BAD_IDS)("refuses the category id %s with nothing sent", async (id) => {
    expectRefused(await getCategory(http, id as number), "category id");
  });

  it("returns a 404 as not_found, with its attempts", async () => {
    reply(CATEGORY, 404, { message: CANARY });

    const result = await getCategory(http, 3101);

    expect(failure(result).code).toBe("not_found");
    expect(result).toMatchObject({ ok: false, attempts: 1 });
    expect(JSON.stringify(result)).not.toContain(CANARY);
  });

  it("refuses a missing name as server, with no body text and its attempts", async () => {
    reply(CATEGORY, 200, { ...categoryPages[0][0], name: undefined, description: CANARY });

    const result = await getCategory(http, 3101);

    expectMalformed(result, "a solution category");
    expect(result).toMatchObject({ attempts: 1 });
  });

  it("passes the deadline on: one already passed sends nothing and is network", async () => {
    reply(CATEGORY, 200, categoryPages[0][0]);

    expect(failure(await getCategory(http, 3101, Date.now() - 1))).toMatchObject({
      code: "network",
      http_status: null,
    });
    expect(urls()).toHaveLength(0);
  });

  it("given expensive is refused below the reserve, nothing sent; cheap unless given", async () => {
    mock
      .get(ORIGIN)
      .intercept({ path: ARTICLE, method: "GET" })
      .reply(200, articleView, {
        headers: { ...JSON_TYPE, "x-ratelimit-total": "100", "x-ratelimit-remaining": "10" },
      });
    ok(await getArticle(http, 3301));

    expect(failure(await getCategory(http, 3101, undefined, "expensive")).code).toBe(
      "rate_limited",
    );
    expect(urls()).toHaveLength(1);
    reply(CATEGORY, 200, categoryPages[0][0]);
    ok(await getCategory(http, 3101));
    expect(urls()).toHaveLength(2);
  });
});

describe("getFolder", () => {
  const FOLDER = "/api/v2/solutions/folders/3202";

  it("returns id, name and visibility, nothing else", async () => {
    reply(FOLDER, 200, folderView);

    const result = ok(await getFolder(http, 3202));

    expect(result.folder).toEqual({ id: 3202, name: "Squeaks and Rattles", visibility: 3 });
    expect(result.attempts).toBe(1);
    expect(urls().map((url) => url.pathname + url.search)).toEqual([FOLDER]);
  });

  it("gives visibility: null when it is not a whole number", async () => {
    reply(FOLDER, 200, { ...folderView, visibility: CANARY });

    const result = ok(await getFolder(http, 3202));

    expect(result.folder.visibility).toBeNull();
    expect(JSON.stringify(result)).not.toContain(CANARY);
  });

  it.each(BAD_IDS)("refuses the folder id %s with nothing sent", async (id) => {
    expectRefused(await getFolder(http, id as number), "folder id");
  });

  it("returns a 404 as not_found, with its attempts", async () => {
    reply(FOLDER, 404, { message: CANARY });

    const result = await getFolder(http, 3202);

    expect(failure(result).code).toBe("not_found");
    expect(result).toMatchObject({ ok: false, attempts: 1 });
    expect(JSON.stringify(result)).not.toContain(CANARY);
  });

  it("refuses a missing name as server, with no body text and its attempts", async () => {
    reply(FOLDER, 200, { ...folderView, name: undefined, description: CANARY });

    const result = await getFolder(http, 3202);

    expectMalformed(result, "a solution folder");
    expect(result).toMatchObject({ attempts: 1 });
  });

  it("passes the deadline on: one already passed sends nothing and is network", async () => {
    reply(FOLDER, 200, folderView);

    expect(failure(await getFolder(http, 3202, Date.now() - 1))).toMatchObject({
      code: "network",
      http_status: null,
    });
    expect(urls()).toHaveLength(0);
  });
});

describe("the lists: the cost class", () => {
  /** One article view whose response says 10 of 100 calls are left: under the 20% reserve. */
  async function drain() {
    mock
      .get(ORIGIN)
      .intercept({ path: ARTICLE, method: "GET" })
      .reply(200, articleView, {
        headers: { ...JSON_TYPE, "x-ratelimit-total": "100", "x-ratelimit-remaining": "10" },
      });
    ok(await getArticle(http, 3301));
  }

  const lists = [
    ["listCategories", (cost?: "expensive") => listCategories(http, undefined, cost), CATEGORIES],
    ["listFolders", (cost?: "expensive") => listFolders(http, 3101, undefined, cost), FOLDERS],
    ["listArticles", (cost?: "expensive") => listArticles(http, 3201, undefined, cost), ARTICLES],
  ] as const;

  it.each(lists)(
    "%s given expensive is refused below the reserve, nothing sent",
    async (_, call) => {
      await drain();

      expect(failure(await call("expensive")).code).toBe("rate_limited");
      expect(urls()).toHaveLength(1);
    },
  );

  it.each(lists)("%s is cheap unless given: sent below the reserve", async (_, call, path) => {
    await drain();
    reply(path, 200, []);

    ok(await call());
    expect(urls()).toHaveLength(2);
  });
});

describe("searchArticles", () => {
  it("sends the term percent-encoded, a space as +, and returns the hits' ids, titles, status, updated_at and folder visibility", async () => {
    reply(SEARCH, 200, searchHits);

    const result = ok(await searchArticles(http, "oil & squeak?"));

    expect(result.results).toEqual([
      {
        id: 3302,
        title: "Quieting a squeak",
        status: 2,
        updated_at: "2026-01-03T10:00:00Z",
        folder_visibility: 1,
      },
      {
        id: 3304,
        title: "Squeak after oiling",
        status: 2,
        updated_at: "2026-01-03T10:00:00Z",
        folder_visibility: 3,
      },
    ]);
    expect(result.attempts).toBe(1);
    const sent = urls();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.pathname).toBe(SEARCH);
    expect(sent[0]!.search).toBe("?term=oil+%26+squeak%3F");
    expect(sent[0]!.searchParams.get("term")).toBe("oil & squeak?");
  });

  it("sends a non-ASCII character UTF-8 percent-encoded", async () => {
    reply(SEARCH, 200, []);

    ok(await searchArticles(http, "ruota dentata è"));

    expect(urls()[0]!.search).toBe("?term=ruota+dentata+%C3%A8");
  });

  it.each([
    ["missing", undefined],
    ["not a number", CANARY],
    ["null", null],
  ])("gives folder_visibility: null when it is %s", async (_label, visibility) => {
    const hits = structuredClone(searchHits) as Record<string, unknown>[];
    hits[0]!.folder_visibility = visibility;
    reply(SEARCH, 200, hits);

    const result = ok(await searchArticles(http, "squeak"));

    expect(result.results.map((hit) => hit.folder_visibility)).toEqual([null, 3]);
    expect(JSON.stringify(result)).not.toContain(CANARY);
  });

  it("returns a 404 as not_found, with its attempts", async () => {
    reply(SEARCH, 404, { message: CANARY });

    const result = await searchArticles(http, "squeak");

    expect(failure(result).code).toBe("not_found");
    expect(result).toMatchObject({ ok: false, attempts: 1 });
    expect(JSON.stringify(result)).not.toContain(CANARY);
  });

  it("returns no hits as an empty list", async () => {
    reply(SEARCH, 200, []);

    expect(ok(await searchArticles(http, "nothing")).results).toEqual([]);
  });

  it(`accepts a term of ${MAX_TERM_LENGTH} characters`, async () => {
    reply(SEARCH, 200, []);

    ok(await searchArticles(http, "a".repeat(MAX_TERM_LENGTH)));
  });

  it.each(["", "   ", "a".repeat(MAX_TERM_LENGTH + 1), 42, null, ["oil"]])(
    "refuses the term %s with nothing sent",
    async (term) => {
      expectRefused(await searchArticles(http, term as string), "term");
    },
  );

  it("refuses a malformed hit as server, with no body text and its attempts", async () => {
    const hits = structuredClone(searchHits) as Record<string, unknown>[];
    hits[1]!.id = CANARY;
    reply(SEARCH, 200, hits);

    const result = await searchArticles(http, "squeak");

    expectMalformed(result, "solution search results");
    expect(result).toMatchObject({ attempts: 1 });
  });

  it("refuses a body that is not a list as server", async () => {
    reply(SEARCH, 200, { results: CANARY });

    expectMalformed(await searchArticles(http, "squeak"), "solution search results");
  });

  it("returns an HTTP failure with its attempts", async () => {
    reply(SEARCH, 400, { description: "Validation failed", errors: [] });

    const result = await searchArticles(http, "squeak");

    expect(failure(result).code).toBe("validation");
    expect(result).toMatchObject({ ok: false, attempts: 1 });
  });

  it("passes the deadline on: one already passed sends nothing and is network", async () => {
    reply(SEARCH, 200, searchHits);

    expect(failure(await searchArticles(http, "squeak", Date.now() - 1))).toMatchObject({
      code: "network",
      http_status: null,
    });
    expect(urls()).toHaveLength(0);
  });
});
