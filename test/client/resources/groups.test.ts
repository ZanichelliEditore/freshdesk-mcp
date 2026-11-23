import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpClient } from "../../../src/client/http.js";
import { RateLimiter } from "../../../src/client/rate-limit.js";
import { type GroupsResult, listGroups } from "../../../src/client/resources/groups.js";
import { groupPages } from "../../fixtures/agents-groups.js";
import { type MockAgent, mockDispatcher } from "../../support/mock-dispatcher.js";

const DOMAIN = "acme.freshdesk.com";
const ORIGIN = `https://${DOMAIN}`;
const FIRST = "/api/v2/groups?per_page=100";
const JSON_TYPE = { "content-type": "application/json" };
/** Put in malformed bodies: no error message may quote it. */
const CANARY = "Canary-Body-Text-7781";

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

/** The path of page `n` (1-based). */
function pathOf(n: number): string {
  return n === 1 ? FIRST : `${FIRST}&page=${n}`;
}

/** Queue page `n`; it links to page `n + 1` when `more`. */
function page(n: number, body: unknown, more: boolean, status = 200) {
  mock
    .get(ORIGIN)
    .intercept({ path: pathOf(n), method: "GET" })
    .reply(status, body as object, {
      headers: {
        ...JSON_TYPE,
        ...(more ? { link: `<${ORIGIN}${pathOf(n + 1)}>; rel="next"` } : {}),
      },
    });
}

function clone(): Record<string, unknown>[][] {
  return structuredClone(groupPages) as Record<string, unknown>[][];
}

function groups(result: GroupsResult) {
  if (!result.ok) throw new Error(`expected groups, got ${result.error.code}`);
  return result.items;
}

function failure(result: GroupsResult) {
  if (result.ok) throw new Error("expected an error");
  return result.error;
}

function sentPaths(): string[] {
  // Path and query, as `pathOf` writes them.
  return mock
    .getCallHistory()!
    .calls()
    .map((call) => call.fullUrl.slice(ORIGIN.length));
}

describe("listGroups: well-formed pages", () => {
  it("follows Link across two pages and yields every group's id and name", async () => {
    page(1, groupPages[0], true);
    page(2, groupPages[1], false);

    const listed = await listGroups(http);
    const result = groups(listed);

    expect(result.map((group) => [group.id, group.name])).toEqual([
      [701, "Sprocket Desk"],
      [702, "Widget Desk"],
      [703, "Spanner Desk"],
    ]);
    expect(sentPaths()).toEqual([pathOf(1), pathOf(2)]);
    expect(listed).toMatchObject({ ok: true, truncated: false });
  });

  it("passes keys it does not know through", async () => {
    page(1, groupPages[0], false);

    const [first] = groups(await listGroups(http));

    expect(first).toMatchObject({ description: "Sprocket Desk desk", auto_ticket_assign: false });
  });

  it("yields an empty list for an empty page", async () => {
    page(1, [], false);

    expect(groups(await listGroups(http))).toEqual([]);
  });

  it("stops after 10 pages when page 10 still has a Link, and says the list is cut", async () => {
    for (let n = 1; n <= 10; n += 1) page(n, [], true);

    expect(await listGroups(http)).toEqual({ ok: true, items: [], truncated: true });
    expect(sentPaths()).toHaveLength(10);
    expect(sentPaths().at(-1)).toBe(pathOf(10));
  });

  it("says the list is whole when page 10 has no Link", async () => {
    for (let n = 1; n <= 9; n += 1) page(n, [], true);
    page(10, [], false);

    expect(await listGroups(http)).toEqual({ ok: true, items: [], truncated: false });
    expect(sentPaths()).toHaveLength(10);
  });
});

describe("listGroups: a malformed item", () => {
  const cases: [string, (pages: Record<string, unknown>[][]) => void][] = [
    [
      "an id that is not a whole number",
      (p) => {
        p[1]![0]!.id = 703.5;
      },
    ],
    [
      "a group without an id",
      (p) => {
        delete p[1]![0]!.id;
      },
    ],
    [
      "a group without a name",
      (p) => {
        delete p[1]![0]!.name;
        p[1]![0]!.description = CANARY;
      },
    ],
    [
      "a name that is not a string",
      (p) => {
        p[1]![0]!.name = ["Spanner Desk"];
      },
    ],
    [
      "an empty name",
      (p) => {
        p[1]![0]!.name = "";
      },
    ],
    [
      "an item that is not an object",
      (p) => {
        p[1]!.push(CANARY as never);
      },
    ],
  ];

  it.each(cases)("refuses %s on page 2 as server, with no body text", async (_, edit) => {
    const pages = clone();
    edit(pages);
    page(1, pages[0], true);
    page(2, pages[1], false);

    const error = failure(await listGroups(http));

    expect(error).toEqual({
      code: "server",
      http_status: 200,
      message: "Freshdesk sent groups in an unexpected shape (HTTP 200).",
      retryable: false,
    });
    expect(JSON.stringify(error)).not.toContain(CANARY);
  });

  it("refuses a page that is not a list, reports its status and asks for no more", async () => {
    page(1, { groups: groupPages[0], note: CANARY }, true, 203);

    const error = failure(await listGroups(http));

    expect(error).toMatchObject({ code: "server", http_status: 203, retryable: false });
    expect(JSON.stringify(error)).not.toContain(CANARY);
    expect(sentPaths()).toEqual([pathOf(1)]);
  });
});

describe("listGroups: an HTTP failure", () => {
  it("on page 2 returns the client's error unchanged", async () => {
    page(1, groupPages[0], true);
    page(2, {}, false, 404);

    expect(failure(await listGroups(http))).toMatchObject({
      code: "not_found",
      http_status: 404,
    });
  });
});
