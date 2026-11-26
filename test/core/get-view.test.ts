// T-064 (RFC 2026-11-25-write-safety-core, invariant 1): the write path holds
// the one client; every module outside it gets a view that refuses any method
// but GET, in the type and at runtime, before the limiter is asked and with
// nothing sent.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type GetHttp, HttpClient, type HttpResult } from "../../src/client/http.js";
import { listAgents } from "../../src/client/resources/agents.js";
import { RateLimiter } from "../../src/client/rate-limit.js";
import { loadConfig } from "../../src/config.js";
import { createWritePath, GetView } from "../../src/core/write-path.js";
import { createContext } from "../../src/tools/context.js";
import { schemaFieldsPayload } from "../fixtures/schema.js";
import { agentPages, groupPages } from "../fixtures/agents-groups.js";
import { type MockAgent, mockDispatcher } from "../support/mock-dispatcher.js";

const DOMAIN = "acme.freshdesk.com";
const ORIGIN = `https://${DOMAIN}`;
const JSON_TYPE = { "content-type": "application/json" };
const limits = { reserve_pct: 20, floor_pct: 5, pacing_rps: 2 };

let mock: MockAgent;

beforeEach(() => {
  mock = mockDispatcher();
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await mock.close();
});

function view(): GetHttp {
  return createWritePath({
    domain: DOMAIN,
    apiKey: "k3y",
    dispatcher: mock,
    limits,
    toolsets: ["core"],
    forwardAllowList: [],
  }).view;
}

function dispatched(): number {
  return mock.getCallHistory()?.calls().length ?? 0;
}

function refusal(result: HttpResult) {
  if (result.ok) throw new Error("expected a refusal");
  return result.error;
}

/** The first page `paginate` yields. */
async function firstPage(http: GetHttp, request: unknown): Promise<HttpResult> {
  const pages = http.paginate(request as { path: string }, { pages: 3 });
  const next = await pages.next();
  if (next.done === true) throw new Error("expected a page");
  return next.value;
}

/** An options object whose `method` answers GET the first time, PUT after. */
function shifty(): { path: string; method: string } {
  let reads = 0;
  return {
    path: "/tickets/1",
    get method() {
      reads += 1;
      return reads === 1 ? "GET" : "PUT";
    },
  };
}

const NOT_GET = ["PUT", "POST", "DELETE", "PATCH", "get"];

type Call = (http: GetHttp, request: unknown) => Promise<HttpResult>;
const calls: [string, Call][] = [
  ["request", (http, request) => http.request(request as { path: string })],
  ["requestWithRetry", (http, request) => http.requestWithRetry(request as { path: string })],
  ["paginate", firstPage],
];

describe("the GET-only view refuses any method but GET", () => {
  it.each(calls.flatMap(([name, call]) => NOT_GET.map((method) => [name, method, call] as const)))(
    "%s with %s (by a cast): validation, http_status null, nothing sent, limiter not asked",
    async (_name, method, call) => {
      const acquire = vi.spyOn(RateLimiter.prototype, "acquire");
      const result = await call(view(), { method, path: "/tickets/1", body: { status: 5 } });

      expect(refusal(result)).toMatchObject({ code: "validation", http_status: null });
      expect(dispatched()).toBe(0);
      expect(acquire).not.toHaveBeenCalled();
    },
  );

  it.each(calls)(
    "%s with a method that answers GET once, then PUT: refused, nothing sent",
    async (_name, call) => {
      const acquire = vi.spyOn(RateLimiter.prototype, "acquire");
      const result = await call(view(), shifty());

      expect(refusal(result)).toMatchObject({ code: "validation", http_status: null });
      expect(dispatched()).toBe(0);
      expect(acquire).not.toHaveBeenCalled();
    },
  );

  it("counts no attempt for a refusal, and paginate returns at once", async () => {
    const http = view();
    const retried = await http.requestWithRetry({ method: "PUT", path: "/tickets/1" } as never);
    expect(retried.attempts).toBe(0);

    const pages = http.paginate({ method: "DELETE", path: "/tickets" } as never, { pages: 3 });
    expect((await pages.next()).done).toBe(false);
    expect(await pages.next()).toEqual({ done: true, value: { truncated: false, attempts: 0 } });
  });

  it("refuses a PUT through context.http in the type, and at runtime", async () => {
    const context = createContext(
      loadConfig({ FRESHDESK_DOMAIN: DOMAIN, FRESHDESK_API_KEY: "k3y" }),
      mock,
    );
    // @ts-expect-error -- the view's requests are GET only (make typecheck).
    const result = await context.http.request({ method: "PUT", path: "/tickets/1" });

    expect(refusal(result)).toMatchObject({ code: "validation", http_status: null });
    expect(dispatched()).toBe(0);
  });
});

describe("the GET-only view passes a GET", () => {
  it.each([
    ["with no method", { path: "/tickets/{id}", params: { id: 1 } }],
    ["with method GET", { method: "GET" as const, path: "/tickets/{id}", params: { id: 1 } }],
  ])("request and requestWithRetry %s", async (_name, request) => {
    mock.get(ORIGIN).intercept({ path: "/api/v2/tickets/1", method: "GET" }).reply(
      200,
      {},
      {
        headers: JSON_TYPE,
      },
    );
    mock.get(ORIGIN).intercept({ path: "/api/v2/tickets/1", method: "GET" }).reply(
      200,
      {},
      {
        headers: JSON_TYPE,
      },
    );
    const http = view();

    expect((await http.request(request)).ok).toBe(true);
    expect(await http.requestWithRetry(request)).toMatchObject({ ok: true, attempts: 1 });
    expect(
      mock
        .getCallHistory()
        ?.calls()
        .map((call) => call.method),
    ).toEqual(["GET", "GET"]);
  });

  it("sends a GET without the body a cast gave it", async () => {
    mock.get(ORIGIN).intercept({ path: "/api/v2/tickets/1", method: "GET" }).reply(
      200,
      {},
      {
        headers: JSON_TYPE,
      },
    );
    mock.get(ORIGIN).intercept({ path: "/api/v2/tickets/1", method: "GET" }).reply(
      200,
      {},
      {
        headers: JSON_TYPE,
      },
    );
    const http = view();
    const request = { path: "/tickets/1", body: { status: 5 } } as never;

    expect((await http.request(request)).ok).toBe(true);
    expect((await http.requestWithRetry(request)).ok).toBe(true);
    const sent = mock.getCallHistory()?.calls() ?? [];
    expect(sent.map((call) => [call.method, call.body ?? null])).toEqual([
      ["GET", null],
      ["GET", null],
    ]);
  });

  it("paginate, through a resource that takes the view", async () => {
    mock
      .get(ORIGIN)
      .intercept({ path: "/api/v2/agents?per_page=100", method: "GET" })
      .reply(200, agentPages[0] as object, { headers: JSON_TYPE });

    const listed = await listAgents(view());

    expect(listed.ok).toBe(true);
    expect(dispatched()).toBe(1);
  });

  it("carries the client's read-only helpers", () => {
    const http = view();
    expect(http.reserveRefusal()).toBeUndefined();
    expect(
      http.reachedDeadline({ code: "network", http_status: null, message: "x", retryable: true }),
    ).toBe(false);
  });
});

describe("the view is a wrapper, not the client", () => {
  it("is not an HttpClient, has no own keys and is frozen", () => {
    const http = view();
    expect(http).toBeInstanceOf(GetView);
    expect(http).not.toBeInstanceOf(HttpClient);
    expect(Object.getPrototypeOf(GetView.prototype)).toBe(Object.prototype);
    expect(Reflect.ownKeys(http)).toEqual([]);
    expect(Object.isFrozen(http)).toBe(true);
  });

  it("is what the context hands out, and what the schema service sends through", async () => {
    const context = createContext(
      loadConfig({ FRESHDESK_DOMAIN: DOMAIN, FRESHDESK_API_KEY: "k3y" }),
      mock,
    );
    expect(context.http).toBeInstanceOf(GetView);
    expect(context.http).not.toBeInstanceOf(HttpClient);

    for (const [path, body] of [
      ["/api/v2/ticket_fields", schemaFieldsPayload],
      ["/api/v2/agents?per_page=100", agentPages[0]],
      ["/api/v2/groups?per_page=100", groupPages[0]],
    ] as const) {
      mock
        .get(ORIGIN)
        .intercept({ path, method: "GET" })
        .reply(200, body as object, { headers: JSON_TYPE });
    }
    const retry = vi.spyOn(GetView.prototype, "requestWithRetry");
    const paginate = vi.spyOn(GetView.prototype, "paginate");

    expect((await context.schema.get()).ok).toBe(true);
    expect(retry.mock.contexts).toEqual([context.http]);
    expect(paginate.mock.contexts).toEqual([context.http, context.http]);
  });
});
