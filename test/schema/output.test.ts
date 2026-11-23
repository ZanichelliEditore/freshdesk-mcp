import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpClient } from "../../src/client/http.js";
import { RateLimiter } from "../../src/client/rate-limit.js";
import type { TicketField } from "../../src/client/resources/ticket-fields.js";
import {
  FrozenMap,
  type Schema,
  type SchemaResult,
  SchemaService,
} from "../../src/schema/index.js";
import { ticketOutput } from "../../src/schema/output.js";
import { agentPages, groupPages } from "../fixtures/agents-groups.js";
import { rawTicket, schemaFieldsPayload } from "../fixtures/schema.js";
import { type MockAgent, mockDispatcher } from "../support/mock-dispatcher.js";

const DOMAIN = "acme.freshdesk.com";
const ORIGIN = `https://${DOMAIN}`;
const FIELDS = "/api/v2/ticket_fields";
const AGENTS = "/api/v2/agents?per_page=100";
const GROUPS = "/api/v2/groups?per_page=100";
const JSON_TYPE = { "content-type": "application/json" };
const TTL_S = 600;

let mock: MockAgent;
let http: HttpClient;

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.useFakeTimers({ toFake: ["Date"] });
  mock = mockDispatcher();
  http = new HttpClient({
    domain: DOMAIN,
    apiKey: "k3y-Secret-Value-123",
    dispatcher: mock,
    limiter: new RateLimiter({ reserve_pct: 20, floor_pct: 5, pacing_rps: 2 }),
  });
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await mock.close();
});

function reply(path: string, body: unknown, link?: string, status = 200) {
  mock
    .get(ORIGIN)
    .intercept({ path, method: "GET" })
    .reply(status, body as object, {
      headers: { ...JSON_TYPE, ...(link ? { link: `<${ORIGIN}${link}>; rel="next"` } : {}) },
    });
}

/** Queue one full load: fields, two pages of agents, two of groups. */
function queueLoad() {
  reply(FIELDS, schemaFieldsPayload);
  reply(AGENTS, agentPages[0], `${AGENTS}&page=2`);
  reply(`${AGENTS}&page=2`, agentPages[1]);
  reply(GROUPS, groupPages[0], `${GROUPS}&page=2`);
  reply(`${GROUPS}&page=2`, groupPages[1]);
}

function sentPaths(): string[] {
  return (mock.getCallHistory()?.calls() ?? []).map((call) => call.fullUrl.slice(ORIGIN.length));
}

function schemaOf(result: SchemaResult): Schema {
  if (!result.ok) throw new Error(`expected a schema, got ${result.error.code}`);
  return result.schema;
}

const ONE_LOAD = [FIELDS, AGENTS, `${AGENTS}&page=2`, GROUPS, `${GROUPS}&page=2`];

describe("SchemaService: load and TTL cache", () => {
  it("loads fields, agents and groups once, then serves them from the cache", async () => {
    queueLoad();
    const service = new SchemaService(http, TTL_S);

    const first = schemaOf(await service.get());
    const second = schemaOf(await service.get());

    expect(sentPaths()).toEqual(ONE_LOAD);
    expect(second).toBe(first);
    expect(first.fields.map((field) => field.label)).toContain("Shelf");
    expect([...first.agents.names]).toEqual([
      [501, "Quill Ottersby"],
      [502, "Juniper Vantablack"],
      [503, "Ferro Lumen"],
    ]);
    expect([...first.groups.names]).toEqual([
      [701, "Sprocket Desk"],
      [702, "Widget Desk"],
      [703, "Spanner Desk"],
    ]);
    expect(first.agents.truncated).toBe(false);
    expect(first.groups.truncated).toBe(false);
  });

  it("keeps only each agent's id and name, none of its contact's personal data", async () => {
    queueLoad();
    const schema = schemaOf(await new SchemaService(http, TTL_S).get());

    const everything = JSON.stringify(schema, (_key, value: unknown) =>
      value instanceof FrozenMap ? [...value] : value,
    );
    expect(everything).toContain("Quill Ottersby");
    expect(everything).not.toContain("@example.com");
    expect(everything).not.toContain("time_zone");
    expect(schema.agents.names.get(501)).toBe("Quill Ottersby");
  });

  it("FrozenMap.forEach gives value, key and the view itself, with the caller's this", () => {
    const view = new FrozenMap([[501, "Quill Ottersby"]]);
    const seen: unknown[] = [];
    const self = { tag: "self" };

    view.forEach(function (this: unknown, value, key, map) {
      seen.push(this, value, key, map);
    }, self);

    expect(seen).toEqual([self, "Quill Ottersby", 501, view]);
    expect(seen[3]).toBe(view);
    expect(seen[3]).not.toBeInstanceOf(Map);
  });

  it("shares one load between calls made while it is in flight", async () => {
    queueLoad();
    const service = new SchemaService(http, TTL_S);

    const [a, b] = await Promise.all([service.get(), service.get()]);

    expect(sentPaths()).toEqual(ONE_LOAD);
    expect(schemaOf(b)).toBe(schemaOf(a));
  });

  it("does not refetch 1 ms before the TTL ends, and refetches once it has", async () => {
    queueLoad();
    const service = new SchemaService(http, TTL_S);
    const first = schemaOf(await service.get());

    vi.setSystemTime(Date.now() + TTL_S * 1000 - 1);
    expect(schemaOf(await service.get())).toBe(first);
    expect(sentPaths()).toEqual(ONE_LOAD);

    vi.setSystemTime(Date.now() + 1);
    queueLoad();
    const second = schemaOf(await service.get());

    expect(sentPaths()).toEqual([...ONE_LOAD, ...ONE_LOAD]);
    expect(second).not.toBe(first);
    expect(second.agents.names.get(503)).toBe("Ferro Lumen");
  });

  it("refetches when the clock has gone back before the load started", async () => {
    queueLoad();
    const service = new SchemaService(http, TTL_S);
    const first = schemaOf(await service.get());

    vi.setSystemTime(Date.now() - 1);
    queueLoad();
    const second = schemaOf(await service.get());

    expect(sentPaths()).toEqual([...ONE_LOAD, ...ONE_LOAD]);
    expect(second).not.toBe(first);
  });

  it("hands out a frozen schema: a mutation throws and the cache is unchanged", async () => {
    queueLoad();
    const service = new SchemaService(http, TTL_S);
    const schema = schemaOf(await service.get());

    expect(() => (schema.fields as TicketField[]).pop()).toThrow(TypeError);
    expect(() => {
      (schema.fields[0] as { label: string }).label = "Changed";
    }).toThrow(TypeError);
    const status = schema.fields.find((field) => field.name === "status")!;
    expect(() => {
      (status.choices as Record<string, string[]>)["2"]![0] = "Changed";
    }).toThrow(TypeError);
    expect(() => {
      (schema.agents as { truncated: boolean }).truncated = true;
    }).toThrow(TypeError);
    for (const names of [schema.agents.names, schema.groups.names]) {
      const cast = names as Map<number, string>;
      expect(() => cast.set(501, "Changed")).toThrow(TypeError);
      expect(() => cast.clear()).toThrow(TypeError);
      expect(() => Map.prototype.set.call(names, 501, "Changed")).toThrow(TypeError);
    }

    expect(() => {
      (FrozenMap.prototype as { get: unknown }).get = () => "Changed";
    }).toThrow(TypeError);
    expect(() => {
      (FrozenMap as unknown as { prototype: unknown }).prototype = Map.prototype;
    }).toThrow(TypeError);

    const again = schemaOf(await service.get());
    expect(again.agents.names.get(501)).toBe("Quill Ottersby");
    expect(again.groups.names.get(701)).toBe("Sprocket Desk");
    expect(again.fields[0]!.label).toBe("Subject");
    expect(again.fields).toHaveLength(schemaFieldsPayload.length);
    expect(again.agents.truncated).toBe(false);
  });

  it("returns a failed load's error unchanged and does not cache it", async () => {
    reply(FIELDS, { code: "invalid_credentials" }, undefined, 401);
    const service = new SchemaService(http, TTL_S);

    const failed = await service.get();
    expect(failed).toMatchObject({ ok: false, error: { code: "auth" } });
    expect(sentPaths()).toEqual([FIELDS]);

    queueLoad();
    schemaOf(await service.get());
    expect(sentPaths()).toEqual([FIELDS, ...ONE_LOAD]);
  });

  it("stops at the first failing list and asks for nothing after it", async () => {
    reply(FIELDS, schemaFieldsPayload);
    reply(AGENTS, [{ id: "not a number" }]);
    const service = new SchemaService(http, TTL_S);

    expect(await service.get()).toMatchObject({ ok: false, error: { code: "server" } });
    expect(sentPaths()).toEqual([FIELDS, AGENTS]);
  });

  it("fails the load on a malformed groups page, after fields and agents", async () => {
    reply(FIELDS, schemaFieldsPayload);
    reply(AGENTS, agentPages[1]);
    reply(GROUPS, [{ id: 701 }]);
    const service = new SchemaService(http, TTL_S);

    expect(await service.get()).toMatchObject({ ok: false, error: { code: "server" } });
    expect(sentPaths()).toEqual([FIELDS, AGENTS, GROUPS]);
  });

  it("carries a list's truncation through to the schema", async () => {
    reply(FIELDS, schemaFieldsPayload);
    for (let n = 1; n <= 10; n++) {
      const path = n === 1 ? AGENTS : `${AGENTS}&page=${n}`;
      reply(path, [{ id: 500 + n, contact: { name: `Agent ${n}` } }], `${AGENTS}&page=${n + 1}`);
    }
    reply(GROUPS, groupPages[1]);

    const schema = schemaOf(await new SchemaService(http, TTL_S).get());

    expect(schema.agents.truncated).toBe(true);
    expect(schema.agents.names.size).toBe(10);
    expect(schema.groups.truncated).toBe(false);
  });
});

describe("SchemaService: a cold load ends within 30 s", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  });

  /** Queue one answer that comes after `delay` ms. */
  function slow(path: string, body: unknown, delay: number, link?: string, status = 200) {
    mock
      .get(ORIGIN)
      .intercept({ path, method: "GET" })
      .reply(status, body as object, {
        headers: { ...JSON_TYPE, ...(link ? { link: `<${ORIGIN}${link}>; rel="next"` } : {}) },
      })
      .delay(delay);
  }

  /** Runs the fake clock forward until the load settles; returns the fake ms it took. */
  async function settle(
    call: Promise<SchemaResult>,
  ): Promise<{ result: SchemaResult; ms: number }> {
    const started = Date.now();
    let result: SchemaResult | undefined;
    void call.then((value) => {
      result = value;
    });
    while (result === undefined) {
      await new Promise((resolve) => setImmediate(resolve));
      if (result === undefined) await vi.advanceTimersByTimeAsync(100);
    }
    return { result, ms: Date.now() - started };
  }

  it("gives up at 30 s with a retryable network error, sends nothing after, and loads again on the next get", async () => {
    // Each answer takes 9 s, under the 10 s of one attempt: the fourth would
    // come at 36 s. With 30 s for each request the load would go on.
    slow(FIELDS, schemaFieldsPayload, 9000);
    slow(AGENTS, agentPages[0], 9000, `${AGENTS}&page=2`);
    slow(`${AGENTS}&page=2`, agentPages[1], 9000);
    slow(GROUPS, groupPages[0], 9000, `${GROUPS}&page=2`);
    slow(`${GROUPS}&page=2`, groupPages[1], 9000);
    const service = new SchemaService(http, TTL_S);

    const { result, ms } = await settle(service.get());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "network", http_status: null, retryable: true },
    });
    expect(ms).toBe(30_000);
    const cut = [FIELDS, AGENTS, `${AGENTS}&page=2`, GROUPS];
    expect(sentPaths()).toEqual(cut);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sentPaths()).toEqual(cut);

    // The interceptor left over from the cut load answers the last page.
    reply(FIELDS, schemaFieldsPayload);
    reply(AGENTS, agentPages[0], `${AGENTS}&page=2`);
    reply(`${AGENTS}&page=2`, agentPages[1]);
    reply(GROUPS, groupPages[0], `${GROUPS}&page=2`);
    const again = await settle(service.get());
    expect(schemaOf(again.result).groups.names.size).toBe(3);
    expect(sentPaths()).toEqual([...cut, ...ONE_LOAD]);
  });

  it("asks for no list once the 30 s have passed between two of them", async () => {
    // The fields come back, and the clock is at the deadline when they do.
    mock
      .get(ORIGIN)
      .intercept({ path: FIELDS, method: "GET" })
      .reply(
        200,
        () => {
          vi.setSystemTime(Date.now() + 30_000);
          return schemaFieldsPayload as object;
        },
        { headers: JSON_TYPE },
      );
    reply(AGENTS, agentPages[1]);
    reply(GROUPS, groupPages[1]);
    const service = new SchemaService(http, TTL_S);

    const { result } = await settle(service.get());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "network", http_status: null, retryable: true },
    });
    expect(sentPaths()).toEqual([FIELDS]);
  });

  it("returns a limiter wait that would reach the deadline as rate_limited, and does not cache it", async () => {
    // The hold starts at 18 s and ends at 30 s: within the limiter's own
    // bound of 15 s, so only the load's deadline refuses it.
    slow(FIELDS, schemaFieldsPayload, 9000);
    slow(AGENTS, agentPages[0], 9000, `${AGENTS}&page=2`);
    mock
      .get(ORIGIN)
      .intercept({ path: `${AGENTS}&page=2`, method: "GET" })
      .reply(429, "", { headers: { "retry-after": "12" } });
    const service = new SchemaService(http, TTL_S);

    const { result, ms } = await settle(service.get());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "rate_limited", http_status: null, retryable: true, retry_after_s: 12 },
    });
    expect(ms).toBe(18_000);
    const cut = [FIELDS, AGENTS, `${AGENTS}&page=2`];
    expect(sentPaths()).toEqual(cut);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sentPaths()).toEqual(cut);

    queueLoad();
    schemaOf((await settle(service.get())).result);
    expect(sentPaths()).toEqual([...cut, ...ONE_LOAD]);
  });

  it("serves a limiter wait that ends one millisecond before the deadline", async () => {
    slow(FIELDS, schemaFieldsPayload, 9000);
    slow(AGENTS, agentPages[0], 8999, `${AGENTS}&page=2`);
    mock
      .get(ORIGIN)
      .intercept({ path: `${AGENTS}&page=2`, method: "GET" })
      .reply(429, "", { headers: { "retry-after": "12" } });
    reply(`${AGENTS}&page=2`, agentPages[1]);
    reply(GROUPS, groupPages[0], `${GROUPS}&page=2`);
    reply(`${GROUPS}&page=2`, groupPages[1]);
    const service = new SchemaService(http, TTL_S);

    const started = Date.now();
    let ended: number | undefined;
    const load = service.get().then((result) => {
      ended = Date.now() - started;
      return result;
    });

    const { result } = await settle(load);

    expect(schemaOf(result).groups.names.size).toBe(3);
    expect(ended).toBe(29_999);
  });

  it("leaves a load that ends sooner as it was", async () => {
    // 29 s in all.
    slow(FIELDS, schemaFieldsPayload, 9000);
    slow(AGENTS, agentPages[0], 9000, `${AGENTS}&page=2`);
    slow(`${AGENTS}&page=2`, agentPages[1], 9000);
    slow(GROUPS, groupPages[0], 1000, `${GROUPS}&page=2`);
    slow(`${GROUPS}&page=2`, groupPages[1], 1000);
    const service = new SchemaService(http, TTL_S);

    const { result, ms } = await settle(service.get());

    const loaded = schemaOf(result);
    expect(ms).toBe(29_000);
    expect(loaded.agents.names.size).toBe(3);
    expect(loaded.groups.names.size).toBe(3);
    expect(sentPaths()).toEqual(ONE_LOAD);
    expect(schemaOf(await service.get())).toBe(loaded);
    expect(sentPaths()).toEqual(ONE_LOAD);
  });
});

describe("SchemaService: a cast reaches neither the cache nor the TTL (A3)", () => {
  const plantedSchema: Schema = {
    fields: [],
    agents: { names: new Map(), truncated: false },
    groups: { names: new Map(), truncated: false },
  };
  const planted = (): Promise<SchemaResult> => Promise.resolve({ ok: true, schema: plantedSchema });

  /** Each assignment through a cast, a throw taken as no change. */
  function attempt(service: SchemaService, values: Record<string, unknown>): void {
    for (const [name, value] of Object.entries(values)) {
      try {
        (service as unknown as Record<string, unknown>)[name] = value;
      } catch {
        // Refused: the frozen service.
      }
    }
  }

  it("is frozen once built", () => {
    expect(Object.isFrozen(new SchemaService(http, TTL_S))).toBe(true);
  });

  it.each([
    ["cached", undefined],
    ["inFlight", planted()],
    ["ttlS", 0],
  ])("refuses an assignment to %s through a cast with a TypeError", (name, value) => {
    const service = new SchemaService(http, TTL_S);

    expect(() => {
      (service as unknown as Record<string, unknown>)[name] = value;
    }).toThrow(TypeError);
  });

  it.each([
    ["cached = undefined", { cached: undefined }],
    ["ttlS = 0", { ttlS: 0 }],
    ["both", { cached: undefined, ttlS: 0 }],
  ])(
    "after an attempt at %s, a get() inside the TTL is the cached schema",
    async (_name, values) => {
      queueLoad();
      const service = new SchemaService(http, TTL_S);
      const first = schemaOf(await service.get());

      attempt(service, values);

      expect(schemaOf(await service.get())).toBe(first);
      expect(sentPaths()).toEqual(ONE_LOAD);
    },
  );

  it("after an attempt at ttlS = 1e9, a get() past the TTL loads again", async () => {
    queueLoad();
    const service = new SchemaService(http, TTL_S);
    const first = schemaOf(await service.get());

    attempt(service, { ttlS: 1e9 });
    vi.setSystemTime(Date.now() + TTL_S * 1000);
    queueLoad();

    expect(schemaOf(await service.get())).not.toBe(first);
    expect(sentPaths()).toEqual([...ONE_LOAD, ...ONE_LOAD]);
  });

  it("a planted inFlight is not served before the first load", async () => {
    const service = new SchemaService(http, TTL_S);
    attempt(service, { inFlight: planted() });
    queueLoad();

    const loaded = schemaOf(await service.get());

    expect(loaded).not.toBe(plantedSchema);
    expect(loaded.agents.names.size).toBe(3);
    expect(sentPaths()).toEqual(ONE_LOAD);
  });

  it("a planted inFlight is not served past the TTL", async () => {
    queueLoad();
    const service = new SchemaService(http, TTL_S);
    const first = schemaOf(await service.get());
    vi.setSystemTime(Date.now() + TTL_S * 1000);
    attempt(service, { inFlight: planted() });
    queueLoad();

    const loaded = schemaOf(await service.get());

    expect(loaded).not.toBe(plantedSchema);
    expect(loaded).not.toBe(first);
    expect(loaded.agents.names.size).toBe(3);
    expect(sentPaths()).toEqual([...ONE_LOAD, ...ONE_LOAD]);
  });
});

/** A schema built by hand: the mapping needs no HTTP. */
function schema(overrides: Partial<Schema> = {}): Schema {
  return {
    fields: structuredClone(schemaFieldsPayload) as TicketField[],
    agents: {
      names: new Map(agentPages.flat().map((agent) => [agent.id, agent.contact.name])),
      truncated: false,
    },
    groups: {
      names: new Map(groupPages.flat().map((group) => [group.id, group.name])),
      truncated: false,
    },
    ...overrides,
  };
}

function ticket(
  changes: Record<string, unknown> = {},
  custom: Record<string, unknown> = {},
): Record<string, unknown> {
  const raw = structuredClone(rawTicket) as Record<string, unknown>;
  return { ...raw, ...changes, custom_fields: { ...rawTicket.custom_fields, ...custom } };
}

describe("ticketOutput: labelled values", () => {
  it("maps a raw ticket to {label: value label}, with names for status, priority, source, agent and group", () => {
    expect(ticketOutput(schema(), ticket(), {})).toEqual({
      Subject: "Sprocket squeaks",
      Status: "Open",
      Priority: "High",
      Colour: "Teal",
      Product: "Gadgets > Sprockets > Blue sprocket",
      Source: "Portal",
      Agent: "Juniper Vantablack",
      Group: "Spanner Desk",
      Type: "Incident",
      Shelf: "North > Bottom",
      Requester: 9001,
      Company: 8001,
      Catalogue: 7001,
      Hobby: "Kite flying",
      Notes: null,
    });
  });

  it("tells a 2-level tree from a status's choices by type, not by shape", () => {
    const fields = schema().fields;
    const shelf = fields.find((field) => field.name === "cf_shelf")!;
    const status = fields.find((field) => field.name === "status")!;
    // A status with the tree's shape of choices, and a tree with the status's.
    status.choices = { "2": ["Open", "Being processed"] };
    shelf.choices = { "2": ["Open"] };

    const out = ticketOutput(
      schema({ fields }),
      ticket({}, { cf_shelf: "2", cf_tier: "Open" }),
      {},
    );

    expect(out.Status).toBe("Open");
    expect(out.Shelf).toBe("2 > Open");
  });

  it("leaves a field out when the ticket has no such key, and keeps null as null", () => {
    const raw = ticket({ responder_id: null });
    delete raw.subject;
    delete (raw.custom_fields as Record<string, unknown>).cf_hobby;

    const out = ticketOutput(schema(), raw, {});

    expect(out).not.toHaveProperty("Subject");
    expect(out).not.toHaveProperty("Hobby");
    expect(out.Agent).toBeNull();
    expect(out.Notes).toBeNull();
  });

  it("leaves every custom field out when the ticket has no custom_fields object", () => {
    const raw = ticket();
    delete raw.custom_fields;

    const out = ticketOutput(schema(), raw, {});

    expect(Object.keys(out)).toEqual([
      "Subject",
      "Status",
      "Priority",
      "Source",
      "Agent",
      "Group",
      "Type",
      "Requester",
      "Company",
      "Catalogue",
    ]);
  });

  it("stops a nested path at its first empty level", () => {
    expect(
      ticketOutput(schema(), ticket({}, { cf_family: "Widgets", cf_model: null }), {}).Product,
    ).toBe("Gadgets > Widgets");
    expect(ticketOutput(schema(), ticket({}, { cf_family: null }), {}).Product).toBe("Gadgets");
    expect(ticketOutput(schema(), ticket({}, { cf_kit: null }), {}).Product).toBeNull();
  });

  it("shows an empty top level as it is, with no path after it", () => {
    expect(ticketOutput(schema(), ticket({}, { cf_shelf: "" }), {}).Shelf).toBe("");
  });

  it("treats null nested_ticket_fields like absent ones: the path is the top value", () => {
    const fields = schema().fields;
    fields.find((field) => field.name === "cf_kit")!.nested_ticket_fields = null;
    const absent = schema().fields;
    delete absent.find((field) => field.name === "cf_kit")!.nested_ticket_fields;

    expect(ticketOutput(schema({ fields }), ticket(), {}).Product).toBe("Gadgets");
    expect(ticketOutput(schema({ fields: absent }), ticket(), {}).Product).toBe("Gadgets");
  });

  it("names an id it cannot resolve instead of guessing", () => {
    const out = ticketOutput(schema(), ticket({ status: 9, priority: 7, source: 99 }), {});

    expect(out.Status).toBe("unknown status 9");
    expect(out.Priority).toBe("unknown priority 7");
    expect(out.Source).toBe("unknown source 99");
  });

  it("treats null choices like absent ones: every id is unknown", () => {
    const fields = schema().fields;
    fields.find((field) => field.name === "status")!.choices = null;
    const absent = schema().fields;
    delete absent.find((field) => field.name === "status")!.choices;

    expect(ticketOutput(schema({ fields }), ticket(), {}).Status).toBe("unknown status 2");
    expect(ticketOutput(schema({ fields: absent }), ticket(), {}).Status).toBe("unknown status 2");
  });

  it("calls an agent or group missing from a complete list unknown", () => {
    const out = ticketOutput(schema(), ticket({ responder_id: 999, group_id: 998 }), {});

    expect(out.Agent).toBe("unknown agent 999");
    expect(out.Group).toBe("unknown group 998");
  });

  it("says the list is incomplete, not that the id is unknown, when the list was truncated", () => {
    const full = schema();
    const cut = schema({
      agents: { names: full.agents.names, truncated: true },
      groups: { names: full.groups.names, truncated: true },
    });

    const out = ticketOutput(cut, ticket({ responder_id: 999, group_id: 998 }), {});

    expect(out.Agent).toBe("agent 999 (name not loaded: the agent list is incomplete)");
    expect(out.Group).toBe("group 998 (name not loaded: the group list is incomplete)");
    // An id the cut list does hold still resolves.
    expect(ticketOutput(cut, ticket(), {}).Agent).toBe("Juniper Vantablack");
  });

  it("keys a second field with an already used label by label and API name", () => {
    const fields = schema().fields;
    fields.find((field) => field.name === "cf_hobby")!.label = "Colour";

    const out = ticketOutput(schema({ fields }), ticket(), {});

    expect(out.Colour).toBe("Teal");
    expect(out["Colour (cf_hobby)"]).toBe("Kite flying");
  });
});

it("ticketOutput keeps a field labelled __proto__ as an own key, not the object's prototype", () => {
  const fields = schema().fields;
  fields.find((field) => field.name === "cf_hobby")!.label = "__proto__";

  const out = ticketOutput(schema({ fields }), ticket(), {});

  expect(Object.getOwnPropertyDescriptor(out, "__proto__")?.value).toBe("Kite flying");
  expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
});

it("ticketOutput reads a default field named like an Object.prototype key from the ticket's own key only", () => {
  const fields = [
    { id: 1, name: "constructor", label: "Builder", type: "default_builder", default: true },
    { id: 2, name: "toString", label: "Text", type: "default_text", default: true },
  ] as TicketField[];

  expect(ticketOutput(schema({ fields }), { constructor: "Brick" }, {})).toEqual({
    Builder: "Brick",
  });
});

it("ticketOutput calls a status named like an Object.prototype key unknown", () => {
  expect(ticketOutput(schema(), ticket({ status: "constructor" }), {}).Status).toBe(
    "unknown status constructor",
  );
});

describe("ticketOutput: hidden fields", () => {
  it("leaves out a field hidden by its label", () => {
    const out = ticketOutput(schema(), ticket(), { Hobby: { hidden: true } });

    expect(out).not.toHaveProperty("Hobby");
    expect(JSON.stringify(out)).not.toContain("Kite flying");
    expect(out.Colour).toBe("Teal");
  });

  it("leaves out a field hidden by its API name", () => {
    expect(ticketOutput(schema(), ticket(), { cf_hobby: { hidden: true } })).not.toHaveProperty(
      "Hobby",
    );
  });

  it("matches a hidden key whatever its case", () => {
    const out = ticketOutput(schema(), ticket(), {
      hOBBY: { hidden: true },
      CF_COLOUR: { hidden: true },
    });

    expect(out).not.toHaveProperty("Hobby");
    expect(out).not.toHaveProperty("Colour");
  });

  it("keeps a field whose entry says hidden: false or gives only a meaning", () => {
    const out = ticketOutput(schema(), ticket(), {
      Hobby: { hidden: false },
      Colour: { meaning: "Paint", hidden: false },
    });

    expect(out.Hobby).toBe("Kite flying");
    expect(out.Colour).toBe("Teal");
  });

  it("hides a default field by its ticket key", () => {
    const out = ticketOutput(schema(), ticket(), {
      responder_id: { hidden: true },
      GROUP_ID: { hidden: true },
      requester_id: { hidden: true },
    });

    expect(out).not.toHaveProperty("Agent");
    expect(out).not.toHaveProperty("Group");
    expect(out).not.toHaveProperty("Requester");
    expect(out.Company).toBe(8001);
  });

  it("matches a hidden key with surrounding spaces or in another Unicode form", () => {
    const fields = schema().fields;
    fields.find((field) => field.name === "cf_hobby")!.label = "Caf\u00e9";

    const spaced = ticketOutput(schema(), ticket(), { "  Hobby ": { hidden: true } });
    const decomposed = ticketOutput(schema({ fields }), ticket(), {
      "Cafe\u0301": { hidden: true },
    });

    expect(spaced).not.toHaveProperty("Hobby");
    expect(JSON.stringify(decomposed)).not.toContain("Kite flying");
  });

  it("hides a default field too", () => {
    expect(ticketOutput(schema(), ticket(), { Agent: { hidden: true } })).not.toHaveProperty(
      "Agent",
    );
  });

  it("hides a whole nested field by its top label", () => {
    const out = ticketOutput(schema(), ticket(), { Product: { hidden: true } });

    expect(out).not.toHaveProperty("Product");
    expect(JSON.stringify(out)).not.toContain("Sprockets");
  });

  it("cuts a nested path before a hidden level, by label or by API name", () => {
    expect(ticketOutput(schema(), ticket(), { Model: { hidden: true } }).Product).toBe(
      "Gadgets > Sprockets",
    );
    expect(ticketOutput(schema(), ticket(), { cf_family: { hidden: true } }).Product).toBe(
      "Gadgets",
    );
  });
});
