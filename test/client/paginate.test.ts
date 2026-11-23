import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HttpClient,
  type HttpRequest,
  type HttpResult,
  type PageCap,
} from "../../src/client/http.js";
import { RateLimiter } from "../../src/client/rate-limit.js";
import { type MockAgent, mockDispatcher } from "../support/mock-dispatcher.js";

const DOMAIN = "acme.freshdesk.com";
const ORIGIN = `https://${DOMAIN}`;

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

/** Queue one page; `link` is the raw `Link` header, if any. */
function page(path: string, body: unknown[], link?: string, status = 200): void {
  mock
    .get(ORIGIN)
    .intercept({ path, method: "GET" })
    .reply(status, body, {
      headers: {
        "content-type": "application/json",
        ...(link === undefined ? {} : { link }),
      },
    });
}

function next(url: string): string {
  return `<${url}>; rel="next"`;
}

/** Three pages of two tickets, chained by `Link`. */
function threePages(): void {
  page(
    "/api/v2/tickets?per_page=2",
    [{ id: 1 }, { id: 2 }],
    next(`${ORIGIN}/api/v2/tickets?per_page=2&page=2`),
  );
  page(
    "/api/v2/tickets?per_page=2&page=2",
    [{ id: 3 }, { id: 4 }],
    next(`${ORIGIN}/api/v2/tickets?per_page=2&page=3`),
  );
  page("/api/v2/tickets?per_page=2&page=3", [{ id: 5 }, { id: 6 }]);
}

async function collect(cap: PageCap, path = "/tickets"): Promise<HttpResult[]> {
  const pages: HttpResult[] = [];
  for await (const result of http.paginate({ path, query: { per_page: 2 } }, cap)) {
    pages.push(result);
  }
  return pages;
}

function bodies(pages: HttpResult[]): unknown[] {
  return pages.map((result) => (result.ok ? result.body : result.error.code));
}

function sentUrls(): string[] {
  return mock
    .getCallHistory()!
    .calls()
    .map((call) => call.fullUrl);
}

describe("paginate", () => {
  it("follows Link across three pages and ends when there is none", async () => {
    threePages();

    const pages = await collect({ pages: 10 });

    expect(bodies(pages)).toEqual([
      [{ id: 1 }, { id: 2 }],
      [{ id: 3 }, { id: 4 }],
      [{ id: 5 }, { id: 6 }],
    ]);
    expect(sentUrls()).toEqual([
      `${ORIGIN}/api/v2/tickets?per_page=2`,
      `${ORIGIN}/api/v2/tickets?per_page=2&page=2`,
      `${ORIGIN}/api/v2/tickets?per_page=2&page=3`,
    ]);
  });

  it("stops at the page cap with a Link still to follow", async () => {
    threePages();

    const pages = await collect({ pages: 2 });

    expect(bodies(pages)).toEqual([
      [{ id: 1 }, { id: 2 }],
      [{ id: 3 }, { id: 4 }],
    ]);
    expect(sentUrls()).toHaveLength(2);
  });

  it("stops at the item cap and cuts the last page to it", async () => {
    threePages();

    const pages = await collect({ pages: 10, items: 3 });

    expect(bodies(pages)).toEqual([[{ id: 1 }, { id: 2 }], [{ id: 3 }]]);
    expect(sentUrls()).toHaveLength(2);
  });

  it("does not ask for another page when the item cap is met exactly", async () => {
    threePages();

    const pages = await collect({ pages: 10, items: 4 });

    expect(bodies(pages)).toEqual([
      [{ id: 1 }, { id: 2 }],
      [{ id: 3 }, { id: 4 }],
    ]);
    expect(sentUrls()).toHaveLength(2);
  });

  it("sends nothing with an item cap of zero", async () => {
    threePages();

    expect(await collect({ pages: 10, items: 0 })).toEqual([]);
    expect(sentUrls()).toHaveLength(0);
  });

  it.each([
    { pages: Number.NaN },
    { pages: -1 },
    { pages: 1.5 },
    { pages: Number.POSITIVE_INFINITY },
    { pages: 10, items: Number.NaN },
    { pages: 10, items: -1 },
    { pages: 10, items: 2.5 },
  ])("throws for the cap %j, sending nothing", async (cap) => {
    threePages();

    await expect(collect(cap)).rejects.toThrow(TypeError);
    expect(sentUrls()).toHaveLength(0);
  });

  it("sends every page as a GET with no body, whatever the caller's object carries", async () => {
    page(
      "/api/v2/tickets?per_page=2",
      [{ id: 1 }],
      next(`${ORIGIN}/api/v2/tickets?per_page=2&page=2`),
    );
    page("/api/v2/tickets?per_page=2&page=2", [{ id: 2 }]);
    const wider: HttpRequest = {
      method: "POST",
      path: "/tickets",
      query: { per_page: 2 },
      body: { subject: "x" },
      url: "https://evil.example/api/v2/tickets",
    };

    const pages: HttpResult[] = [];
    for await (const result of http.paginate(wider, { pages: 10 })) pages.push(result);

    expect(bodies(pages)).toEqual([[{ id: 1 }], [{ id: 2 }]]);
    const calls = mock.getCallHistory()!.calls();
    expect(calls.map((call) => call.method)).toEqual(["GET", "GET"]);
    expect(calls.map((call) => call.body)).toEqual([null, null]);
    expect(sentUrls()[0]).toBe(`${ORIGIN}/api/v2/tickets?per_page=2`);
  });

  it("sends nothing with a page cap of zero", async () => {
    threePages();

    expect(await collect({ pages: 0 })).toEqual([]);
    expect(sentUrls()).toHaveLength(0);
  });

  it.each([
    ["a foreign host", "https://evil.example/api/v2/tickets?page=2"],
    ["another Freshdesk account", "https://other.freshdesk.com/api/v2/tickets?page=2"],
    ["plain http", `http://${DOMAIN}/api/v2/tickets?page=2`],
    ["another port", `https://${DOMAIN}:8443/api/v2/tickets?page=2`],
  ])("refuses a Link to %s with no request sent", async (_name, url) => {
    page("/api/v2/tickets?per_page=2", [{ id: 1 }], next(url));

    const pages = await collect({ pages: 10 });

    expect(pages).toHaveLength(2);
    expect(pages[1]).toMatchObject({
      ok: false,
      error: { code: "validation", http_status: null, retryable: false },
    });
    expect(sentUrls()).toEqual([`${ORIGIN}/api/v2/tickets?per_page=2`]);
  });

  it("yields a page's error and stops", async () => {
    page(
      "/api/v2/tickets?per_page=2",
      [{ id: 1 }],
      next(`${ORIGIN}/api/v2/tickets?per_page=2&page=2`),
    );
    page("/api/v2/tickets?per_page=2&page=2", [], undefined, 404);
    page("/api/v2/tickets?per_page=2&page=3", [{ id: 9 }]);

    const pages = await collect({ pages: 10 });

    expect(bodies(pages)).toEqual([[{ id: 1 }], "not_found"]);
    expect(sentUrls()).toHaveLength(2);
  });

  it("takes the next link among several and ignores the others", async () => {
    page(
      "/api/v2/tickets?per_page=2",
      [{ id: 1 }],
      `<${ORIGIN}/api/v2/tickets?per_page=2&page=9>; rel="prev", <${ORIGIN}/api/v2/tickets?per_page=2&page=2>; rel="next"`,
    );
    page(
      "/api/v2/tickets?per_page=2&page=2",
      [{ id: 2 }],
      `<${ORIGIN}/api/v2/tickets?per_page=2>; rel="prev"`,
    );

    const pages = await collect({ pages: 10 });

    expect(bodies(pages)).toEqual([[{ id: 1 }], [{ id: 2 }]]);
    expect(sentUrls()).toHaveLength(2);
  });

  it("retries a page like any read", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      page("/api/v2/tickets?per_page=2", [], undefined, 503);
      page("/api/v2/tickets?per_page=2", [{ id: 1 }]);

      const collected = collect({ pages: 10 });
      let pages: HttpResult[] | undefined;
      void collected.then((value) => {
        pages = value;
      });
      while (pages === undefined) {
        await new Promise((resolve) => setImmediate(resolve));
        if (pages === undefined) await vi.advanceTimersByTimeAsync(100);
      }

      expect(bodies(pages)).toEqual([[{ id: 1 }]]);
      expect(sentUrls()).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("paginate: whether a cap cut the list", () => {
  /** Every page, then the generator's return value. */
  async function run(cap: PageCap): Promise<{ pages: HttpResult[]; truncated: boolean }> {
    const iterator = http.paginate({ path: "/tickets", query: { per_page: 2 } }, cap);
    const pages: HttpResult[] = [];
    for (;;) {
      const step = await iterator.next();
      if (step.done) return { pages, truncated: step.value.truncated };
      pages.push(step.value);
    }
  }

  it("is false when the last page has no Link", async () => {
    threePages();

    const { pages, truncated } = await run({ pages: 3 });

    expect(pages).toHaveLength(3);
    expect(truncated).toBe(false);
  });

  it("is true at the page cap with a Link still to follow, and that Link is not asked for", async () => {
    threePages();

    const { truncated } = await run({ pages: 2 });

    expect(truncated).toBe(true);
    expect(sentUrls()).toHaveLength(2);
  });

  it("is true when the item cap cuts a page", async () => {
    page("/api/v2/tickets?per_page=2", [{ id: 1 }, { id: 2 }]);

    const { pages, truncated } = await run({ pages: 10, items: 1 });

    expect(bodies(pages)).toEqual([[{ id: 1 }]]);
    expect(truncated).toBe(true);
  });

  it("is true when the item cap is met exactly with a Link still to follow", async () => {
    threePages();

    expect((await run({ pages: 10, items: 4 })).truncated).toBe(true);
  });

  it("is false when the item cap is met exactly on the last page", async () => {
    threePages();

    expect((await run({ pages: 10, items: 6 })).truncated).toBe(false);
  });

  it("is true with a page cap of zero: the first page was never asked for", async () => {
    threePages();

    expect((await run({ pages: 0 })).truncated).toBe(true);
    expect(sentUrls()).toHaveLength(0);
  });

  it("is false after a failed page: the failure is the answer", async () => {
    page(
      "/api/v2/tickets?per_page=2",
      [{ id: 1 }],
      next(`${ORIGIN}/api/v2/tickets?per_page=2&page=2`),
    );
    page("/api/v2/tickets?per_page=2&page=2", [], undefined, 404);

    const { pages, truncated } = await run({ pages: 10 });

    expect(bodies(pages)).toEqual([[{ id: 1 }], "not_found"]);
    expect(truncated).toBe(false);
  });
});
