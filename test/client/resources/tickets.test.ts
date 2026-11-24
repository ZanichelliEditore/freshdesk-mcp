import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpClient } from "../../../src/client/http.js";
import { RateLimiter } from "../../../src/client/rate-limit.js";
import {
  getTicket,
  listConversations,
  listTickets,
  type ListTicketsOptions,
} from "../../../src/client/resources/tickets.js";
import { conversationPages, ticketPage, ticketView } from "../../fixtures/tickets.js";
import { type MockAgent, mockDispatcher } from "../../support/mock-dispatcher.js";

const DOMAIN = "acme.freshdesk.com";
const ORIGIN = `https://${DOMAIN}`;
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

/** The query of the only request sent, as a plain object. */
function onlyQuery(): Record<string, string> {
  const sent = urls();
  expect(sent).toHaveLength(1);
  return Object.fromEntries(sent[0]!.searchParams);
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
  const error = failure(result);
  expect(error).toEqual({
    code: "validation",
    http_status: null,
    message: `Not sent: ${name} is not a valid value.`,
    retryable: false,
  });
  expect(urls()).toHaveLength(0);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

describe("listTickets: the parameters of docs/architecture/ticket-queries.md", () => {
  const TICKETS = "/api/v2/tickets";

  it("with no options sends per_page=100 only: no updated_since", async () => {
    reply(TICKETS, 200, ticketPage);

    ok(await listTickets(http));

    expect(urls()[0]!.pathname).toBe(TICKETS);
    expect(onlyQuery()).toEqual({ per_page: "100" });
  });

  const cases: [string, ListTicketsOptions, Record<string, string>][] = [
    ["per_page", { per_page: 25 }, { per_page: "25" }],
    ["page", { page: 3 }, { page: "3" }],
    [
      "updated_since",
      { updated_since: "2026-01-02T03:04:05Z" },
      { updated_since: "2026-01-02T03:04:05Z" },
    ],
    ["order_by", { order_by: "created_at" }, { order_by: "created_at" }],
    ["order_type", { order_type: "desc" }, { order_type: "desc" }],
    ["include", { include: "stats" }, { include: "stats" }],
    ["requester_id (the requester filter)", { requester_id: 8801 }, { requester_id: "8801" }],
    ["company_id", { company_id: 9001 }, { company_id: "9001" }],
  ];

  it.each(cases)("sends %s as given", async (_, options, expected) => {
    reply(TICKETS, 200, ticketPage);

    ok(await listTickets(http, options));

    expect(onlyQuery()).toEqual({ per_page: "100", ...expected });
  });

  it("sends the recent-tickets query together, requester_id with no window", async () => {
    reply(TICKETS, 200, ticketPage);

    ok(
      await listTickets(http, {
        requester_id: 8801,
        order_by: "created_at",
        order_type: "desc",
        per_page: 5,
      }),
    );

    expect(onlyQuery()).toEqual({
      requester_id: "8801",
      order_by: "created_at",
      order_type: "desc",
      per_page: "5",
    });
  });
});

describe("listTickets: values refused before sending", () => {
  const cases: [string, ListTicketsOptions, string][] = [
    ["per_page 0", { per_page: 0 }, "per_page"],
    ["per_page 101", { per_page: 101 }, "per_page"],
    ["per_page 2.5", { per_page: 2.5 }, "per_page"],
    ["page 0", { page: 0 }, "page"],
    ["page 1.5", { page: 1.5 }, "page"],
    ["requester_id 0", { requester_id: 0 }, "requester_id"],
    ["requester_id -3", { requester_id: -3 }, "requester_id"],
    ["requester_id past the safe range", { requester_id: 2 ** 53 }, "requester_id"],
    ["company_id 1.5", { company_id: 1.5 }, "company_id"],
    [
      "order_by outside its set",
      { order_by: "subject" } as unknown as ListTicketsOptions,
      "order_by",
    ],
    [
      "order_type outside its set",
      { order_type: "up" } as unknown as ListTicketsOptions,
      "order_type",
    ],
    [
      "include other than stats",
      { include: "requester" } as unknown as ListTicketsOptions,
      "include",
    ],
  ];

  it.each(cases)("refuses %s as validation with nothing sent", async (_, options, name) => {
    expectRefused(await listTickets(http, options), name);
  });

  it("sends only the parameters it knows, whatever a cast adds", async () => {
    reply("/api/v2/tickets", 200, ticketPage);

    ok(await listTickets(http, { status: 2, email: "x" } as unknown as ListTicketsOptions));

    expect(onlyQuery()).toEqual({ per_page: "100" });
  });
});

describe("listTickets: the page", () => {
  const TICKETS = "/api/v2/tickets";

  it("returns the fixture's tickets and that a next page exists", async () => {
    reply(TICKETS, 200, ticketPage, `${ORIGIN}${TICKETS}?per_page=100&page=2`);

    const result = ok(await listTickets(http));

    expect(
      result.tickets.map((t) => [t.id, t.subject, t.requester_id, t.custom_fields.cf_colour]),
    ).toEqual([
      [4101, "Sprocket squeaks at dawn", 8801, "Amber"],
      [4102, "Widget arrived in two halves", 8802, null],
    ]);
    expect(result.has_more).toBe(true);
    expect(result.attempts).toBe(1);
    expect(urls()).toHaveLength(1);
  });

  it("says no next page exists without a Link", async () => {
    reply(TICKETS, 200, ticketPage);

    expect(ok(await listTickets(http)).has_more).toBe(false);
  });

  it("passes keys it does not know through", async () => {
    reply(TICKETS, 200, ticketPage);

    const [first] = ok(await listTickets(http)).tickets;

    expect(first).toMatchObject({ tags: ["sprocket"], fr_escalated: false, group_id: 701 });
  });

  it("returns an empty page as no tickets", async () => {
    reply(TICKETS, 200, []);

    expect(ok(await listTickets(http))).toEqual({
      ok: true,
      tickets: [],
      has_more: false,
      attempts: 1,
    });
  });

  it("counts a retried page in attempts", async () => {
    reply(TICKETS, 503, {});
    reply(TICKETS, 200, ticketPage);

    expect(ok(await listTickets(http)).attempts).toBe(2);
  });

  it("returns a 400 as validation", async () => {
    reply(TICKETS, 400, { errors: [] });

    expect(failure(await listTickets(http)).code).toBe("validation");
  });
});

describe("listTickets: the cost class", () => {
  const TICKETS = "/api/v2/tickets";

  /** One page whose response says 10 of 100 calls are left: under the 20% reserve. */
  async function drain() {
    mock
      .get(ORIGIN)
      .intercept({ path: (path: string) => path.split("?")[0] === TICKETS, method: "GET" })
      .reply(200, ticketPage, {
        headers: { ...JSON_TYPE, "x-ratelimit-total": "100", "x-ratelimit-remaining": "10" },
      });
    ok(await listTickets(http));
  }

  it("is cheap unless given: a page is sent below the reserve", async () => {
    await drain();
    reply(TICKETS, 200, ticketPage);

    ok(await listTickets(http, { page: 2 }));

    expect(urls()).toHaveLength(2);
  });

  it("given expensive, the page goes to the limiter as expensive: refused below the reserve", async () => {
    await drain();

    const error = failure(await listTickets(http, { page: 2 }, undefined, "expensive"));

    expect(error.code).toBe("rate_limited");
    expect(urls()).toHaveLength(1);
  });

  it("a failed page says how many requests it took: 0 when the limiter refused it", async () => {
    await drain();

    const refusedPage = await listTickets(http, { page: 2 }, undefined, "expensive");

    expect(refusedPage).toMatchObject({ ok: false, attempts: 0 });

    reply(TICKETS, 400, { errors: [] });
    expect(await listTickets(http, { page: 2 })).toMatchObject({ ok: false, attempts: 1 });
  });

  it("given expensive above the reserve, the page is sent", async () => {
    reply(TICKETS, 200, ticketPage);

    ok(await listTickets(http, {}, undefined, "expensive"));

    expect(onlyQuery()).toEqual({ per_page: "100" });
  });
});

describe("listTickets: a malformed item", () => {
  const cases: [string, (page: Record<string, unknown>[]) => unknown][] = [
    [
      "an id that is not a whole number",
      (p) => {
        p[1]!.id = "4102";
        p[1]!.subject = CANARY;
      },
    ],
    [
      "a ticket without custom_fields",
      (p) => {
        delete p[1]!.custom_fields;
        p[1]!.subject = CANARY;
      },
    ],
    [
      "custom_fields that is not an object",
      (p) => {
        p[1]!.custom_fields = CANARY;
      },
    ],
    [
      "a subject that is not a string",
      (p) => {
        p[1]!.subject = 7;
        p[1]!.description = CANARY;
      },
    ],
    [
      "an item that is not an object",
      (p) => {
        p.push(CANARY as never);
      },
    ],
    ["a body that is not a list", (p) => ({ tickets: p, note: CANARY })],
  ];

  it.each(cases)("refuses %s as server, with no body text", async (_, edit) => {
    const page = clone(ticketPage) as Record<string, unknown>[];
    const body = edit(page) ?? page;
    reply("/api/v2/tickets", 200, body);

    const error = failure(await listTickets(http));

    expect(error).toEqual({
      code: "server",
      http_status: 200,
      message: "Freshdesk sent tickets in an unexpected shape (HTTP 200).",
      retryable: false,
    });
    expect(JSON.stringify(error)).not.toContain(CANARY);
  });
});

describe("getTicket", () => {
  const VIEW = "/api/v2/tickets/4101";

  it("returns default and custom fields", async () => {
    reply(VIEW, 200, ticketView);

    const result = ok(await getTicket(http, 4101));

    expect(result.ticket).toMatchObject({
      id: 4101,
      subject: "Sprocket squeaks at dawn",
      status: 2,
      priority: 1,
      requester_id: 8801,
      description_text: "It squeaks only before sunrise.",
      custom_fields: { cf_colour: "Amber", cf_kit: "Gadgets" },
    });
    expect(result.attempts).toBe(1);
    expect(urls()[0]!.pathname).toBe(VIEW);
    expect(onlyQuery()).toEqual({});
  });

  it("sends include=stats when asked", async () => {
    reply(VIEW, 200, { ...ticketView, stats: { first_responded_at: null } });

    const result = ok(await getTicket(http, 4101, ["stats"]));

    expect(onlyQuery()).toEqual({ include: "stats" });
    expect(result.ticket.stats).toEqual({ first_responded_at: null });
  });

  it("refuses any other include, given through a cast, with nothing sent", async () => {
    for (const other of ["requester", "company", "conversations"]) {
      const include = ["stats", other] as unknown as "stats"[];

      expectRefused(await getTicket(http, 4101, include), "include");
    }
  });

  it.each([0, -1, 1.5, Number.NaN, 2 ** 53])("refuses the id %s with nothing sent", async (id) => {
    expectRefused(await getTicket(http, id), "id");
  });

  it("returns a 404 as not_found", async () => {
    reply("/api/v2/tickets/4999", 404, { message: CANARY });

    const error = failure(await getTicket(http, 4999));

    expect(error.code).toBe("not_found");
    expect(JSON.stringify(error)).not.toContain(CANARY);
  });

  describe("cost class", () => {
    /** One answered request that leaves the budget below the reserve. */
    async function drain() {
      mock
        .get(ORIGIN)
        .intercept({ path: VIEW, method: "GET" })
        .reply(200, ticketView, {
          headers: { ...JSON_TYPE, "x-ratelimit-total": "100", "x-ratelimit-remaining": "10" },
        });
      ok(await getTicket(http, 4101));
    }

    it("is cheap unless given: a view is sent below the reserve", async () => {
      await drain();
      reply(VIEW, 200, ticketView);

      ok(await getTicket(http, 4101));

      expect(urls()).toHaveLength(2);
    });

    it("given expensive, the view goes to the limiter as expensive: refused below the reserve", async () => {
      await drain();

      const refusedView = await getTicket(http, 4101, ["stats"], undefined, "expensive");

      expect(failure(refusedView).code).toBe("rate_limited");
      expect(refusedView).toMatchObject({ ok: false, attempts: 0 });
      expect(urls()).toHaveLength(1);
    });

    it("given expensive above the reserve, the view is sent", async () => {
      reply(VIEW, 200, ticketView);

      ok(await getTicket(http, 4101, ["stats"], undefined, "expensive"));

      expect(onlyQuery()).toEqual({ include: "stats" });
    });
  });

  it("a failed view says how many requests it took", async () => {
    reply("/api/v2/tickets/4999", 404, { message: CANARY });

    expect(await getTicket(http, 4999)).toMatchObject({ ok: false, attempts: 1 });
    expect(await getTicket(http, 0)).not.toHaveProperty("attempts");
  });

  it("refuses a malformed ticket as server, with no body text", async () => {
    reply(VIEW, 200, { ...ticketView, id: null, description_text: CANARY });

    const error = failure(await getTicket(http, 4101));

    expect(error).toEqual({
      code: "server",
      http_status: 200,
      message: "Freshdesk sent a ticket in an unexpected shape (HTTP 200).",
      retryable: false,
    });
    expect(JSON.stringify(error)).not.toContain(CANARY);
  });
});

describe("listConversations", () => {
  const THREAD = "/api/v2/tickets/4101/conversations";
  const pageUrl = (n: number) => `${ORIGIN}${THREAD}?per_page=100&page=${n}`;

  it("follows two pages and returns every entry, the thread whole", async () => {
    reply(THREAD, 200, conversationPages[0], pageUrl(2));
    reply(THREAD, 200, conversationPages[1]);

    const result = ok(await listConversations(http, 4101));

    expect(result.items.map((c) => [c.id, c.body_text, c.incoming])).toEqual([
      [6201, "Have you tried oiling it?", false],
      [6202, "Oil made it louder.", true],
      [6203, "A new sprocket is on its way.", false],
    ]);
    expect(result).toMatchObject({ truncated: false, attempts: 2 });
    expect(urls().map((url) => url.href)).toEqual([`${ORIGIN}${THREAD}?per_page=100`, pageUrl(2)]);
  });

  it("stops at its cap of 10 pages with truncated: true", async () => {
    for (let n = 1; n <= 10; n += 1) reply(THREAD, 200, conversationPages[1], pageUrl(n + 1));

    const result = ok(await listConversations(http, 4101));

    expect(result.items).toHaveLength(10);
    expect(result).toMatchObject({ truncated: true, attempts: 10 });
    expect(urls()).toHaveLength(10);
  });

  it.each([0, -7, 2.5])("refuses the ticket id %s with nothing sent", async (id) => {
    expectRefused(await listConversations(http, id), "ticket id");
  });

  it("returns a 404 as not_found", async () => {
    reply("/api/v2/tickets/4999/conversations", 404, {});

    expect(failure(await listConversations(http, 4999)).code).toBe("not_found");
  });

  it("refuses a malformed entry on page 2 as server, with no body text", async () => {
    const pages = clone(conversationPages) as Record<string, unknown>[][];
    pages[1]![0]!.id = CANARY;
    reply(THREAD, 200, pages[0], pageUrl(2));
    reply(THREAD, 200, pages[1]);

    const error = failure(await listConversations(http, 4101));

    expect(error).toEqual({
      code: "server",
      http_status: 200,
      message: "Freshdesk sent conversations in an unexpected shape (HTTP 200).",
      retryable: false,
    });
    expect(JSON.stringify(error)).not.toContain(CANARY);
  });
});
