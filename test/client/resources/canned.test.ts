import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpClient } from "../../../src/client/http.js";
import { RateLimiter } from "../../../src/client/rate-limit.js";
import {
  getCannedResponse,
  listCannedFolders,
  listCannedResponses,
} from "../../../src/client/resources/canned.js";
import { cannedFolderPages, cannedFolderView, cannedResponseView } from "../../fixtures/canned.js";
import { type MockAgent, mockDispatcher } from "../../support/mock-dispatcher.js";

const DOMAIN = "acme.freshdesk.com";
const ORIGIN = `https://${DOMAIN}`;
const JSON_TYPE = { "content-type": "application/json" };
/** Put in malformed bodies: no error message may quote it. */
const CANARY = "Canary-Body-Text-6637";

const FOLDERS = "/api/v2/canned_response_folders";
const FOLDER = "/api/v2/canned_response_folders/3501";
const RESPONSE = "/api/v2/canned_responses/3601";

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
  expect(failure(result)).toEqual({
    code: "server",
    http_status: 200,
    message: `Freshdesk sent ${noun} in an unexpected shape (HTTP 200).`,
    retryable: false,
  });
  expect(JSON.stringify(result)).not.toContain(CANARY);
}

const pageUrl = (path: string, n: number) => `${ORIGIN}${path}?per_page=100&page=${n}`;

const BAD_IDS = [0, -1, 1.5, Number.NaN, 2 ** 53, "3501", null];

describe("listCannedFolders", () => {
  it("follows two pages and returns every folder's id, name and personal, nothing else", async () => {
    reply(FOLDERS, 200, cannedFolderPages[0], pageUrl(FOLDERS, 2));
    reply(FOLDERS, 200, cannedFolderPages[1]);

    const result = ok(await listCannedFolders(http));

    expect(result.items).toEqual([
      { id: 3501, name: "Sprocket Replies", personal: false },
      { id: 3502, name: "My Spanner Notes", personal: true },
      { id: 3503, name: "Widget Returns", personal: false },
    ]);
    expect(result).toMatchObject({ truncated: false, attempts: 2 });
    expect(urls().map((url) => url.href)).toEqual([
      `${ORIGIN}${FOLDERS}?per_page=100`,
      pageUrl(FOLDERS, 2),
    ]);
  });

  it("stops at its cap of 10 pages with truncated: true", async () => {
    for (let n = 1; n <= 10; n += 1) {
      reply(FOLDERS, 200, cannedFolderPages[1], pageUrl(FOLDERS, n + 1));
    }

    const result = ok(await listCannedFolders(http));

    expect(result.items).toHaveLength(10);
    expect(result).toMatchObject({ truncated: true, attempts: 10 });
    expect(urls().map((url) => url.href)).not.toContain(pageUrl(FOLDERS, 11));
  });

  it.each([
    ["missing", undefined],
    ["not a boolean", CANARY],
    ["a number", 1],
    ["null", null],
  ])("gives personal: null when it is %s", async (_label, personal) => {
    const page = structuredClone(cannedFolderPages[1]) as Record<string, unknown>[];
    page[0]!.personal = personal;
    reply(FOLDERS, 200, page);

    const result = ok(await listCannedFolders(http));

    expect(result.items).toEqual([{ id: 3503, name: "Widget Returns", personal: null }]);
    expect(JSON.stringify(result)).not.toContain(CANARY);
  });

  it("refuses a wrong id on page 2 as server, with no body text", async () => {
    const pages = structuredClone(cannedFolderPages) as Record<string, unknown>[][];
    pages[1]![0]!.id = CANARY;
    reply(FOLDERS, 200, pages[0], pageUrl(FOLDERS, 2));
    reply(FOLDERS, 200, pages[1]);

    expectMalformed(await listCannedFolders(http), "canned response folders");
  });

  it("refuses a missing name as server, with no body text", async () => {
    const page = structuredClone(cannedFolderPages[1]) as Record<string, unknown>[];
    delete page[0]!.name;
    page[0]!.created_at = CANARY;
    reply(FOLDERS, 200, page);

    expectMalformed(await listCannedFolders(http), "canned response folders");
  });

  it("refuses a body that is not a list as server", async () => {
    reply(FOLDERS, 200, { results: CANARY });

    expectMalformed(await listCannedFolders(http), "canned response folders");
  });

  it("returns a 404 as not_found", async () => {
    reply(FOLDERS, 404, { message: CANARY });

    const result = await listCannedFolders(http);

    expect(failure(result).code).toBe("not_found");
    expect(JSON.stringify(result)).not.toContain(CANARY);
  });

  it("passes the deadline on: one already passed sends nothing and is network", async () => {
    reply(FOLDERS, 200, cannedFolderPages[1]);

    expect(failure(await listCannedFolders(http, Date.now() - 1))).toMatchObject({
      code: "network",
      http_status: null,
    });
    expect(urls()).toHaveLength(0);
  });
});

describe("listCannedResponses", () => {
  it("returns a folder's responses' ids and titles, nothing else, in one request", async () => {
    reply(FOLDER, 200, cannedFolderView);

    const result = ok(await listCannedResponses(http, 3501));

    expect(result.responses).toEqual([
      { id: 3601, title: "Sprocket on its way" },
      { id: 3602, title: "Oil before fitting" },
    ]);
    expect(result.attempts).toBe(1);
    expect(urls().map((url) => url.pathname + url.search)).toEqual([FOLDER]);
  });

  it("returns an empty folder as an empty list", async () => {
    reply(FOLDER, 200, { ...cannedFolderView, canned_responses: [] });

    expect(ok(await listCannedResponses(http, 3501)).responses).toEqual([]);
  });

  it.each(BAD_IDS)("refuses the folder id %s with nothing sent", async (id) => {
    expectRefused(await listCannedResponses(http, id as number), "folder id");
  });

  it("returns a 404 as not_found, with its attempts", async () => {
    reply("/api/v2/canned_response_folders/3999", 404, { message: CANARY });

    const result = await listCannedResponses(http, 3999);

    expect(failure(result).code).toBe("not_found");
    expect(result).toMatchObject({ ok: false, attempts: 1 });
    expect(JSON.stringify(result)).not.toContain(CANARY);
  });

  it.each([
    ["a response with a wrong id", { canned_responses: [{ id: CANARY, title: "Oil" }] }],
    ["a response with no title", { canned_responses: [{ id: 3601, body: CANARY }] }],
    ["no response list", { canned_responses: undefined, name: CANARY }],
    ["a response list that is not a list", { canned_responses: CANARY }],
  ])("refuses %s as server, with no body text and its attempts", async (_label, edit) => {
    reply(FOLDER, 200, { ...cannedFolderView, ...edit });

    const result = await listCannedResponses(http, 3501);

    expectMalformed(result, "a canned response folder");
    expect(result).toMatchObject({ attempts: 1 });
  });

  it("refuses a body that is a list as server", async () => {
    reply(FOLDER, 200, [CANARY]);

    expectMalformed(await listCannedResponses(http, 3501), "a canned response folder");
  });

  it("passes the deadline on: one already passed sends nothing and is network", async () => {
    reply(FOLDER, 200, cannedFolderView);

    expect(failure(await listCannedResponses(http, 3501, Date.now() - 1))).toMatchObject({
      code: "network",
      http_status: null,
    });
    expect(urls()).toHaveLength(0);
  });
});

describe("getCannedResponse", () => {
  it("returns id, title, the plain-text content, folder_id and visibility, nothing else", async () => {
    reply(RESPONSE, 200, cannedResponseView);

    const result = ok(await getCannedResponse(http, 3601));

    expect(result.response).toEqual({
      id: 3601,
      title: "Sprocket on its way",
      text: "Your new sprocket ships today.\nRegards, {{ticket.agent.name}}",
      folder_id: 3501,
      visibility: 0,
    });
    expect(JSON.stringify(result)).not.toContain("<div");
    expect(JSON.stringify(result)).not.toContain("attachments");
    expect(result.attempts).toBe(1);
    expect(urls().map((url) => url.pathname + url.search)).toEqual([RESPONSE]);
  });

  it("gives text: null when content is null", async () => {
    reply(RESPONSE, 200, { ...cannedResponseView, content: null });

    expect(ok(await getCannedResponse(http, 3601)).response.text).toBeNull();
  });

  it.each([[undefined], [null], ["3501"], [0], [-2], [1.5], [2 ** 53]])(
    "gives folder_id: null when it is %j",
    async (folderId) => {
      reply(RESPONSE, 200, { ...cannedResponseView, folder_id: folderId });

      expect(ok(await getCannedResponse(http, 3601)).response.folder_id).toBeNull();
    },
  );

  it.each([[undefined], [null], [CANARY], [1.5]])(
    "gives visibility: null when it is %j",
    async (visibility) => {
      reply(RESPONSE, 200, { ...cannedResponseView, visibility });

      const result = ok(await getCannedResponse(http, 3601));

      expect(result.response.visibility).toBeNull();
      expect(JSON.stringify(result)).not.toContain(CANARY);
    },
  );

  it.each(BAD_IDS)("refuses the id %s with nothing sent", async (id) => {
    expectRefused(await getCannedResponse(http, id as number), "id");
  });

  it("returns a 404 as not_found, with its attempts", async () => {
    reply("/api/v2/canned_responses/3999", 404, { message: CANARY });

    const result = await getCannedResponse(http, 3999);

    expect(failure(result).code).toBe("not_found");
    expect(result).toMatchObject({ ok: false, attempts: 1 });
    expect(JSON.stringify(result)).not.toContain(CANARY);
  });

  it.each([
    ["a missing content", { content: undefined, content_html: CANARY }],
    ["a content that is not a string", { content: [CANARY] }],
    ["a missing title", { title: undefined, content: CANARY }],
    ["an id that is not a whole number", { id: CANARY }],
  ])("refuses %s as server, with no body text and its attempts", async (_label, edit) => {
    reply(RESPONSE, 200, { ...cannedResponseView, ...edit });

    const result = await getCannedResponse(http, 3601);

    expectMalformed(result, "a canned response");
    expect(result).toMatchObject({ attempts: 1 });
  });

  it("passes the deadline on: one already passed sends nothing and is network", async () => {
    reply(RESPONSE, 200, cannedResponseView);

    expect(failure(await getCannedResponse(http, 3601, Date.now() - 1))).toMatchObject({
      code: "network",
      http_status: null,
    });
    expect(urls()).toHaveLength(0);
  });
});

describe("the lists: the cost class", () => {
  /** One response view whose reply says 10 of 100 calls are left: under the 20% reserve. */
  async function drain() {
    mock
      .get(ORIGIN)
      .intercept({ path: RESPONSE, method: "GET" })
      .reply(200, cannedResponseView, {
        headers: { ...JSON_TYPE, "x-ratelimit-total": "100", "x-ratelimit-remaining": "10" },
      });
    ok(await getCannedResponse(http, 3601));
  }

  const lists = [
    [
      "listCannedFolders",
      (cost?: "expensive") => listCannedFolders(http, undefined, cost),
      FOLDERS,
      [] as unknown,
    ],
    [
      "listCannedResponses",
      (cost?: "expensive") => listCannedResponses(http, 3501, undefined, cost),
      FOLDER,
      cannedFolderView as unknown,
    ],
  ] as const;

  it.each(lists)(
    "%s given expensive is refused below the reserve, nothing sent",
    async (_, call) => {
      await drain();

      expect(failure(await call("expensive")).code).toBe("rate_limited");
      expect(urls()).toHaveLength(1);
    },
  );

  it.each(lists)(
    "%s is cheap unless given: sent below the reserve",
    async (_, call, path, body) => {
      await drain();
      reply(path, 200, body);

      ok(await call());
      expect(urls()).toHaveLength(2);
    },
  );
});
