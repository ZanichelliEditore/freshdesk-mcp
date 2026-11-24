import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Config, loadConfig } from "../../src/config.js";
import { checkBudget, estimateCalls } from "../../src/tools/budget.js";
import { type AppContext, createContext } from "../../src/tools/context.js";
import { type MockAgent, mockDispatcher } from "../support/mock-dispatcher.js";

const DOMAIN = "acme.freshdesk.com";
const ORIGIN = `https://${DOMAIN}`;
const TICKET = "/api/v2/tickets/1";
const baseEnv = { FRESHDESK_DOMAIN: DOMAIN, FRESHDESK_API_KEY: "k3y-Secret-Value-123" };

let mock: MockAgent;

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.useFakeTimers({ toFake: ["Date"] });
  mock = mockDispatcher();
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await mock.close();
});

/** A context with the default team settings, `limits` changed as given. */
function contextWith(limits: Partial<Config["team"]["limits"]> = {}): AppContext {
  const config = loadConfig(baseEnv);
  return createContext(
    { ...config, team: { ...config.team, limits: { ...config.team.limits, ...limits } } },
    mock,
  );
}

function sent(): number {
  return mock.getCallHistory()?.calls().length ?? 0;
}

/** One ticket view answered with the given rate-limit headers. */
function replyTicket(headers: Record<string, string> = {}) {
  mock
    .get(ORIGIN)
    .intercept({ path: TICKET, method: "GET" })
    .reply(200, { id: 1 }, { headers: { "content-type": "application/json", ...headers } });
}

/** What a caller does once the gate lets it through: an expensive request. */
async function run(context: AppContext) {
  replyTicket();
  return context.http.request({ path: "/tickets/1", cost: "expensive" });
}

describe("estimateCalls", () => {
  it("2,000 tickets at 100 a page with conversations estimate 2,020 calls", () => {
    expect(estimateCalls({ tickets: 2000, pageSize: 100, conversations: true })).toBe(2020);
  });

  it("counts one page per pageSize tickets, one call per ticket for conversations, and the probe", () => {
    expect(estimateCalls({ tickets: 2000, pageSize: 100, conversations: false })).toBe(20);
    expect(estimateCalls({ tickets: 300, pageSize: 30, conversations: false })).toBe(10);
    expect(estimateCalls({ tickets: 245, pageSize: 30, conversations: true, probe: 1 })).toBe(255);
    expect(estimateCalls({ tickets: 0, pageSize: 100, conversations: false })).toBe(0);
    expect(estimateCalls({ tickets: 0, pageSize: 100, conversations: true, probe: 1 })).toBe(1);
    expect(estimateCalls({ tickets: 1, pageSize: 100, conversations: false })).toBe(1);
    expect(estimateCalls({ tickets: 1, pageSize: 100, conversations: true })).toBe(2);
    expect(estimateCalls({ tickets: 100, pageSize: 100, conversations: false })).toBe(1);
    expect(estimateCalls({ tickets: 101, pageSize: 100, conversations: false })).toBe(2);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses a ticket count of %s",
    (tickets) => {
      expect(() => estimateCalls({ tickets, pageSize: 100, conversations: false })).toThrow(
        RangeError,
      );
    },
  );

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses a page size of %s",
    (pageSize) => {
      expect(() => estimateCalls({ tickets: 10, pageSize, conversations: false })).toThrow(
        RangeError,
      );
    },
  );

  it.each([-1, 1.5, Number.NaN])("refuses a probe of %s", (probe) => {
    expect(() =>
      estimateCalls({ tickets: 10, pageSize: 100, conversations: false, probe }),
    ).toThrow(RangeError);
  });
});

describe("checkBudget: the per-call budget", () => {
  it("refuses an estimate over the budget without confirm, naming both, with no request sent", () => {
    const context = contextWith();
    for (const confirm of [undefined, false]) {
      const refused = checkBudget(context, 2020, confirm);
      expect(refused).toMatchObject({ code: "validation", http_status: null, retryable: false });
      expect(refused?.message).toContain("2020");
      expect(refused?.message).toContain("250");
      expect(refused?.message).toContain("confirm: true");
    }
    expect(sent()).toBe(0);
  });

  it("lets an estimate over the budget run with confirm: true", async () => {
    const context = contextWith();
    expect(checkBudget(context, 2020, true)).toBeUndefined();
    expect((await run(context)).ok).toBe(true);
    expect(sent()).toBe(1);
  });

  it("lets an estimate at exactly the budget run, and refuses one call more", async () => {
    const context = contextWith();
    expect(checkBudget(context, 250, undefined)).toBeUndefined();
    expect(checkBudget(context, 251, undefined)).toMatchObject({ code: "validation" });
    expect((await run(context)).ok).toBe(true);
    expect(sent()).toBe(1);
  });

  it("reads the budget from limits.call_budget", () => {
    const context = contextWith({ call_budget: 10 });
    expect(checkBudget(context, 10, undefined)).toBeUndefined();
    const refused = checkBudget(context, 11, undefined);
    expect(refused?.message).toContain("11");
    expect(refused?.message).toContain("10");
  });

  it.each([
    ["NaN", Number.NaN],
    ["-1", -1],
    ["1.5", 1.5],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["null", null],
    ['"5"', "5"],
  ])("refuses a malformed estimate (%s) with and without confirm (fails closed)", (_what, bad) => {
    const context = contextWith();
    for (const confirm of [undefined, false, true]) {
      expect(checkBudget(context, bad as unknown as number, confirm)).toMatchObject({
        code: "validation",
        http_status: null,
        retryable: false,
      });
    }
    expect(sent()).toBe(0);
  });

  it("lets an estimate of 0 run", () => {
    expect(checkBudget(contextWith(), 0, undefined)).toBeUndefined();
  });
});

describe("checkBudget: the reserve", () => {
  /** A context whose limiter has seen 10 of 100 calls left: below the 20 % reserve. */
  async function belowReserve(): Promise<AppContext> {
    const context = contextWith();
    replyTicket({ "x-ratelimit-total": "100", "x-ratelimit-remaining": "10" });
    expect((await context.http.request({ path: "/tickets/1" })).ok).toBe(true);
    return context;
  }

  it("below the reserve refuses as rate_limited even with confirm: true, sending nothing", async () => {
    const context = await belowReserve();
    const refused = checkBudget(context, 2020, true);
    expect(refused).toMatchObject({
      code: "rate_limited",
      http_status: null,
      retryable: true,
      retry_after_s: 60,
    });
    expect(refused?.message).toContain("below the reserve");
    expect(sent()).toBe(1);
  });

  it("below the reserve refuses an estimate within the budget too", async () => {
    const context = await belowReserve();
    expect(checkBudget(context, 1, undefined)).toMatchObject({ code: "rate_limited" });
    expect(sent()).toBe(1);
  });

  it("gives the same refusal the limiter gives the first expensive request", async () => {
    const context = await belowReserve();
    const refused = checkBudget(context, 2020, true);
    const request = await context.http.request({ path: "/tickets/1", cost: "expensive" });
    expect(request).toEqual({ ok: false, error: refused });
    expect(sent()).toBe(1);
  });

  it("lets the call run once the window has ended", async () => {
    const context = await belowReserve();
    vi.setSystemTime(Date.now() + 60_000);
    expect(checkBudget(context, 2020, true)).toBeUndefined();
    expect((await run(context)).ok).toBe(true);
  });

  it("at the reserve, not below it, lets the call run", async () => {
    const context = contextWith();
    replyTicket({ "x-ratelimit-total": "100", "x-ratelimit-remaining": "20" });
    await context.http.request({ path: "/tickets/1" });
    expect(checkBudget(context, 2020, true)).toBeUndefined();
  });
});
