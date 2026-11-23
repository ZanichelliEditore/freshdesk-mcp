import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspect } from "node:util";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Config, ConfigError, loadConfig } from "../../src/config.js";
import type { Schema } from "../../src/schema/index.js";
import { ticketOutput } from "../../src/schema/output.js";
import { type AppContext, createContext } from "../../src/tools/context.js";
import { agentPages, groupPages } from "../fixtures/agents-groups.js";
import { rawTicket, schemaFieldsPayload } from "../fixtures/schema.js";
import { type MockAgent, mockDispatcher } from "../support/mock-dispatcher.js";

const DOMAIN = "acme.freshdesk.com";
const FIELDS = "/api/v2/ticket_fields";
const AGENTS = "/api/v2/agents?per_page=100";
const GROUPS = "/api/v2/groups?per_page=100";
const ONE_LOAD = [FIELDS, AGENTS, GROUPS];
const baseEnv = { FRESHDESK_DOMAIN: DOMAIN, FRESHDESK_API_KEY: "k3y-Secret-Value-123" };

const dir = mkdtempSync(join(tmpdir(), "freshdesk-mcp-context-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let fileCount = 0;
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

/** A context built the way the server will: env plus a team file on disk. */
function contextFor(team: unknown, env: Record<string, string> = {}): AppContext {
  const path = join(dir, `team-${fileCount++}.json`);
  writeFileSync(path, JSON.stringify(team));
  return createContext(loadConfig({ ...baseEnv, ...env, FRESHDESK_MCP_CONFIG: path }), mock);
}

/** Queue one full load: fields, one page of agents, one of groups. */
function queueLoad(origin = `https://${DOMAIN}`, headers: Record<string, string> = {}) {
  const pages: [string, unknown][] = [
    [FIELDS, schemaFieldsPayload],
    [AGENTS, agentPages[0]],
    [GROUPS, groupPages[0]],
  ];
  for (const [path, body] of pages) {
    mock
      .get(origin)
      .intercept({ path, method: "GET" })
      .reply(200, body as object, {
        headers: { "content-type": "application/json", ...headers },
      });
  }
}

function sentUrls(): string[] {
  return (mock.getCallHistory()?.calls() ?? []).map((call) => call.fullUrl);
}

function sentPaths(): string[] {
  return sentUrls().map((url) => url.slice(`https://${DOMAIN}`.length));
}

async function schemaOf(context: AppContext): Promise<Schema> {
  const result = await context.schema.get();
  if (!result.ok) throw new Error(`expected a schema, got ${result.error.code}`);
  return result.schema;
}

describe("createContext: the schema service's TTL is limits.schema_ttl_s", () => {
  it("fetches the schema once within 60 s and again after it", async () => {
    const context = contextFor({ limits: { schema_ttl_s: 60 } });
    queueLoad();
    const first = await schemaOf(context);

    vi.setSystemTime(Date.now() + 60_000 - 1);
    expect(await schemaOf(context)).toBe(first);
    expect(sentPaths()).toEqual(ONE_LOAD);

    vi.setSystemTime(Date.now() + 1);
    queueLoad();
    expect(await schemaOf(context)).not.toBe(first);
    expect(sentPaths()).toEqual([...ONE_LOAD, ...ONE_LOAD]);
  });

  it("keeps the schema for the default hour when the team file sets no TTL", async () => {
    const context = contextFor({});
    queueLoad();
    const first = await schemaOf(context);

    vi.setSystemTime(Date.now() + 3_600_000 - 1);
    expect(await schemaOf(context)).toBe(first);
    expect(sentPaths()).toEqual(ONE_LOAD);

    vi.setSystemTime(Date.now() + 1);
    queueLoad();
    expect(await schemaOf(context)).not.toBe(first);
    expect(sentPaths()).toEqual([...ONE_LOAD, ...ONE_LOAD]);
  });
});

describe("createContext: team fields", () => {
  it("leaves a field the team file hides out of ticketOutput called through the context", async () => {
    const context = contextFor({ fields: { Hobby: { hidden: true } } });
    queueLoad();
    const schema = await schemaOf(context);

    const out = context.ticketOutput(schema, rawTicket);

    expect(out).not.toHaveProperty("Hobby");
    expect(out.Subject).toBe("Sprocket squeaks");
    expect(out).toEqual(ticketOutput(schema, rawTicket, { Hobby: { hidden: true } }));
    expect(ticketOutput(schema, rawTicket, {})).toHaveProperty("Hobby");
  });

  it("hands the tools the team settings, meanings included", () => {
    const context = contextFor({ fields: { Shelf: { meaning: "Where the part is kept." } } });

    expect(context.team.fields).toEqual({
      Shelf: { meaning: "Where the part is kept.", hidden: false },
    });
    expect(context.team.limits.schema_ttl_s).toBe(3600);
  });

  it("exposes the client, the limiter, the schema service and the team settings, not the key", async () => {
    const context = contextFor({});
    queueLoad();
    await schemaOf(context);

    expect(Object.keys(context).sort()).toEqual([
      "http",
      "limiter",
      "schema",
      "team",
      "ticketOutput",
    ]);
    const key = baseEnv.FRESHDESK_API_KEY;
    const basic = Buffer.from(`${key}:X`).toString("base64");
    for (const text of [
      JSON.stringify(context),
      inspect(context, { depth: Infinity, showHidden: true }),
    ]) {
      expect(text).not.toContain(key);
      expect(text).not.toContain(basic);
    }
  });

  it("freezes the team settings and itself: no tool can unhide a field or lower a limit", async () => {
    const context = contextFor({ fields: { Hobby: { hidden: true } } });
    queueLoad();
    const schema = await schemaOf(context);
    const fields = context.team.fields as Record<string, { hidden: boolean }>;

    expect(() => {
      fields.Hobby!.hidden = false;
    }).toThrow(TypeError);
    expect(() => {
      delete fields.Hobby;
    }).toThrow(TypeError);
    expect(() => {
      (context.team.limits as { reserve_pct: number }).reserve_pct = 0;
    }).toThrow(TypeError);
    expect(() => {
      (context as { ticketOutput: unknown }).ticketOutput = () => ({});
    }).toThrow(TypeError);
    expect(() => {
      (context as { team: unknown }).team = {};
    }).toThrow(TypeError);

    expect(context.ticketOutput(schema, rawTicket)).not.toHaveProperty("Hobby");
    expect(context.team.limits.reserve_pct).toBe(20);
  });

  it("keeps its own copy of the team settings: changing the config afterwards changes nothing", async () => {
    const path = join(dir, `team-${fileCount++}.json`);
    writeFileSync(path, JSON.stringify({ fields: { Hobby: { hidden: true } } }));
    const config: Config = loadConfig({ ...baseEnv, FRESHDESK_MCP_CONFIG: path });
    const context = createContext(config, mock);

    config.team.fields.Hobby!.hidden = false;
    config.team.limits.reserve_pct = 100;
    config.team.limits.floor_pct = 100;
    config.team.limits.schema_ttl_s = 1;

    queueLoad();
    const schema = await schemaOf(context);
    expect(context.ticketOutput(schema, rawTicket)).not.toHaveProperty("Hobby");
    expect(context.team.limits.reserve_pct).toBe(20);
    expect((await context.limiter.acquire("expensive")).ok).toBe(true);
    vi.setSystemTime(Date.now() + 1000);
    expect(await schemaOf(context)).toBe(schema);
  });
});

describe("createContext: the name maps cannot be changed at runtime", () => {
  it.each(["agents", "groups"] as const)("refuses set, delete and clear on %s", async (kind) => {
    const context = contextFor({});
    queueLoad();
    const names = (await schemaOf(context))[kind].names;
    const [id, name] = [...names][0]!;
    const cast = names as Map<number, string>;

    expect(() => cast.set(id, "Changed")).toThrow(TypeError);
    expect(() => cast.delete(id)).toThrow(TypeError);
    expect(() => cast.clear()).toThrow(TypeError);
    expect(() => Map.prototype.set.call(names, id, "Changed")).toThrow(TypeError);

    const again = (await schemaOf(context))[kind].names;
    expect(again.get(id)).toBe(name);
    expect(again.size).toBe(2);
  });
});

describe("createContext: client and limiter", () => {
  it("builds the limiter from the team limits and gives the same one to the client", async () => {
    const budget = { "x-ratelimit-total": "100", "x-ratelimit-remaining": "50" };

    const strict = contextFor({ limits: { reserve_pct: 60 } });
    queueLoad(undefined, budget);
    await schemaOf(strict);
    const refused = await strict.limiter.acquire("expensive");
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.code).toBe("rate_limited");
    expect((await strict.limiter.acquire("cheap")).ok).toBe(true);

    const byDefault = contextFor({});
    queueLoad(undefined, budget);
    await schemaOf(byDefault);
    expect((await byDefault.limiter.acquire("expensive")).ok).toBe(true);
  });

  it("sends through the context's client to the configured domain", async () => {
    const context = contextFor({});
    mock
      .get(`https://${DOMAIN}`)
      .intercept({ path: FIELDS, method: "GET" })
      .reply(200, [], { headers: { "content-type": "application/json" } });

    const result = await context.http.requestWithRetry({ path: "/ticket_fields" });

    expect(result.ok).toBe(true);
    expect(sentUrls()).toEqual([`https://${DOMAIN}${FIELDS}`]);
  });

  it("passes the host override on: a custom domain is allowed with it, refused without", async () => {
    const custom = { FRESHDESK_DOMAIN: "support.example.com" };
    expect(() => contextFor({}, custom)).toThrow(ConfigError);

    const context = contextFor({}, { ...custom, FRESHDESK_HOST_OVERRIDE: "support.example.com" });
    queueLoad("https://support.example.com");
    await schemaOf(context);

    expect(sentUrls()[0]).toBe(`https://support.example.com${FIELDS}`);
  });
});
