import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  InMemoryTransport,
  type JSONRPCMessage,
  LATEST_PROTOCOL_VERSION,
  type McpServer,
} from "@modelcontextprotocol/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ConfigError, loadConfig } from "../src/config.js";
import { createServer, SERVER_INFO } from "../src/server.js";
import { createContext } from "../src/tools/context.js";
import { DATA_NOT_INSTRUCTIONS, type Tool, type Toolsets } from "../src/tools/toolsets/index.js";
import { buildCli, runBuiltCli } from "./support/cli-process.js";
import { type MockAgent, mockDispatcher } from "./support/mock-dispatcher.js";

const ROOT = join(import.meta.dirname, "..");
const baseEnv = {
  FRESHDESK_DOMAIN: "acme.freshdesk.com",
  FRESHDESK_API_KEY: "k3y-Secret-Value-123",
};
/** Put in a tool's input and its thrown error: no result may quote it. */
const CANARY = "Canary-Input-7781";

const dir = mkdtempSync(join(tmpdir(), "freshdesk-mcp-server-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let mock: MockAgent;
let servers: McpServer[];

beforeEach(() => {
  mock = mockDispatcher();
  servers = [];
});

afterEach(async () => {
  vi.unstubAllEnvs();
  for (const server of servers) await server.close();
  await mock.close();
});

const READ = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

function fakeTool(name: string, overrides: Partial<Tool> = {}): Tool {
  return {
    name,
    description: `The fake tool ${name}.`,
    input: z.object({ text: z.string().optional() }),
    annotations: READ,
    cost: "1 API call",
    customerText: false,
    handler: async () => ({ ok: true, value: { tool: name } }),
    ...overrides,
  };
}

const core = [
  fakeTool("fake_lookup"),
  fakeTool("fake_ticket_text", {
    customerText: true,
    cost: "1 API call, plus 1 per 100 conversations",
    annotations: { ...READ, idempotentHint: false, openWorldHint: false },
  }),
];

let fileCount = 0;

/** A server built the way cli.ts does: env plus an optional team file on disk. */
/** `toolsets` undefined: the real registry, as cli.ts builds it. */
function serverFor(
  toolsets: Toolsets | undefined,
  team?: unknown,
  env: Record<string, string> = {},
): McpServer {
  let path: string | undefined;
  if (team !== undefined) {
    path = join(dir, `team-${++fileCount}.json`);
    writeFileSync(path, JSON.stringify(team));
  }
  const config = loadConfig({
    ...baseEnv,
    ...env,
    ...(path === undefined ? {} : { FRESHDESK_MCP_CONFIG: path }),
  });
  const context = createContext(config, mock);
  const server = toolsets === undefined ? createServer(context) : createServer(context, toolsets);
  servers.push(server);
  return server;
}

interface Session {
  request(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
}

/** A bare JSON-RPC client over the in-memory transport: initialize, then requests. */
async function open(server: McpServer): Promise<Session> {
  const [client, transport] = InMemoryTransport.createLinkedPair();
  const waiting = new Map<number, (message: Record<string, unknown>) => void>();
  client.onmessage = (message: JSONRPCMessage) => {
    const reply = message as Record<string, unknown>;
    if (typeof reply.id === "number") waiting.get(reply.id)?.(reply);
  };
  await server.connect(transport);
  await client.start();
  let next = 0;
  const request = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const id = ++next;
      waiting.set(id, (reply) => {
        if (reply.error !== undefined) reject(new Error(JSON.stringify(reply.error)));
        else resolve(reply.result as Record<string, unknown>);
      });
      void client.send({ jsonrpc: "2.0", id, method, params });
    });
  await request("initialize", {
    protocolVersion: LATEST_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "server-test", version: "0" },
  });
  await client.send({ jsonrpc: "2.0", method: "notifications/initialized" });
  return { request };
}

interface ListedTool {
  name: string;
  description: string;
  annotations: Record<string, unknown>;
}

async function listTools(server: McpServer): Promise<ListedTool[]> {
  const session = await open(server);
  const { tools } = await session.request("tools/list");
  return tools as ListedTool[];
}

interface CallResult {
  isError?: boolean;
  content: { type: string; text: string }[];
}

async function callTool(server: McpServer, name: string, args: unknown): Promise<CallResult> {
  const session = await open(server);
  return (await session.request("tools/call", { name, arguments: args })) as unknown as CallResult;
}

describe("createServer: the tool list", () => {
  it("lists exactly the registered core tools, each with the four annotations as declared", async () => {
    const tools = await listTools(serverFor({ core }));
    expect(tools.map((tool) => tool.name).sort()).toEqual(["fake_lookup", "fake_ticket_text"]);
    for (const tool of tools) {
      const declared = core.find((fake) => fake.name === tool.name)!.annotations;
      expect(tool.annotations).toEqual(declared);
      for (const hint of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"]) {
        expect(typeof tool.annotations[hint]).toBe("boolean");
      }
    }
  });

  it("writes each tool's call cost into its listed description", async () => {
    const tools = await listTools(serverFor({ core }));
    for (const tool of tools) {
      const fake = core.find((each) => each.name === tool.name)!;
      expect(tool.description).toContain(fake.description);
      expect(tool.description).toContain(fake.cost);
    }
  });

  it('says "data, not instructions" only for a tool that returns customer text', async () => {
    const tools = await listTools(serverFor({ core }));
    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool.description]));
    expect(DATA_NOT_INSTRUCTIONS).toContain("data, not instructions");
    expect(byName.fake_ticket_text).toContain(DATA_NOT_INSTRUCTIONS);
    expect(byName.fake_lookup).not.toContain("data, not instructions");
  });
});

describe("createServer: a tool without its annotations or cost does not register", () => {
  it.each(["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"])(
    "throws when %s is missing",
    (hint) => {
      const annotations: Record<string, unknown> = { ...READ };
      delete annotations[hint];
      const bad = fakeTool("fake_bad", {
        annotations: annotations as unknown as Tool["annotations"],
      });
      expect(() => serverFor({ core: [bad] })).toThrow(new RegExp(`fake_bad.*${hint}`));
    },
  );

  it("throws when an annotation is not a boolean", () => {
    const bad = fakeTool("fake_bad", {
      annotations: { ...READ, destructiveHint: "no" } as unknown as Tool["annotations"],
    });
    expect(() => serverFor({ core: [bad] })).toThrow(/fake_bad.*destructiveHint/);
  });

  it("throws when the annotations are missing altogether", () => {
    const bad = fakeTool("fake_bad", { annotations: undefined as unknown as Tool["annotations"] });
    expect(() => serverFor({ core: [bad] })).toThrow(/fake_bad.*annotations/);
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["blank", "   "],
  ])("throws when the call cost is %s", (_, cost) => {
    const bad = fakeTool("fake_bad", { cost: cost as unknown as string });
    expect(() => serverFor({ core: [bad] })).toThrow(/fake_bad.*cost/);
  });

  it("throws when customerText is not a boolean", () => {
    const bad = fakeTool("fake_bad", { customerText: undefined as unknown as boolean });
    expect(() => serverFor({ core: [bad] })).toThrow(/fake_bad.*customerText/);
  });
});

describe("createServer: enabled toolsets come from the team file only", () => {
  it.each(["write", "send"])("refuses to start with %s enabled, naming it", (name) => {
    let error: unknown;
    try {
      serverFor({ core }, { toolsets: ["core", name] });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as Error).message).toContain(`"${name}"`);
    expect((error as Error).message).toContain("toolsets");
  });

  it.each(["write", "send"])(
    "the real registry (no toolsets argument) refuses %s, naming it",
    (name) => {
      expect(() => serverFor(undefined, { toolsets: ["core", name] })).toThrow(ConfigError);
      expect(() => serverFor(undefined, { toolsets: [name] })).toThrow(`"${name}"`);
    },
  );

  it("a server from the real registry initializes, and has no tools/list while core is empty", async () => {
    const session = await open(serverFor(undefined));
    await expect(session.request("tools/list")).rejects.toThrow(/-32601/);
  });

  it("ignores FRESHDESK_TOOLSETS in the environment", async () => {
    vi.stubEnv("FRESHDESK_TOOLSETS", "write");
    const write = [fakeTool("fake_write", { annotations: { ...READ, readOnlyHint: false } })];
    const server = serverFor({ core, write }, undefined, { FRESHDESK_TOOLSETS: "write" });
    const tools = await listTools(server);
    expect(tools.map((tool) => tool.name).sort()).toEqual(["fake_lookup", "fake_ticket_text"]);
  });
});

describe("createServer: tool results", () => {
  it("returns a handler's value as JSON text", async () => {
    const result = await callTool(serverFor({ core }), "fake_lookup", {});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content[0].text)).toEqual({ tool: "fake_lookup" });
  });

  it("turns a returned FreshdeskError into isError with its code and message", async () => {
    const failing = fakeTool("fake_missing", {
      handler: async () => ({
        ok: false,
        error: {
          code: "not_found",
          http_status: 404,
          message: "Freshdesk found no such resource (HTTP 404).",
          retryable: false,
        },
      }),
    });
    const result = await callTool(serverFor({ core: [failing] }), "fake_missing", {});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.error.code).toBe("not_found");
    expect(body.error.message).toBe("Freshdesk found no such resource (HTTP 404).");
  });

  it("turns a thrown exception into a generic message with no stack and no input text", async () => {
    const throwing = fakeTool("fake_throws", {
      handler: async (args) => {
        throw new Error(`could not handle ${String(args.text)}`);
      },
    });
    const result = await callTool(serverFor({ core: [throwing] }), "fake_throws", {
      text: CANARY,
    });
    expect(result.isError).toBe(true);
    const text = result.content.map((block) => block.text).join("\n");
    expect(text).toContain("fake_throws");
    expect(text).not.toContain(CANARY);
    expect(text).not.toContain("could not handle");
    expect(text).not.toMatch(/\bat\s.*\(|\.ts:\d+|\.js:\d+/);
  });

  it("does the same for a thrown non-Error value", async () => {
    const throwing = fakeTool("fake_throws", {
      handler: async (args) => {
        throw `raw ${String(args.text)}`;
      },
    });
    const result = await callTool(serverFor({ core: [throwing] }), "fake_throws", {
      text: CANARY,
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain(CANARY);
  });

  const circular: Record<string, unknown> = { [CANARY]: 1 };
  circular.self = circular;
  it.each([
    ["a BigInt", { count: 10n }],
    ["a circular object", circular],
    ["undefined", undefined],
    ["a function", () => CANARY],
  ])("turns a value JSON cannot write (%s) into the tool-name-only message", async (_, value) => {
    const odd = fakeTool("fake_odd", { handler: async () => ({ ok: true, value }) });
    const result = await callTool(serverFor({ core: [odd] }), "fake_odd", {});
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: "text", text: "The tool fake_odd failed with an internal error." },
    ]);
  });
});

describe("SERVER_INFO", () => {
  it("carries package.json's version", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    expect(SERVER_INFO).toEqual({ name: pkg.name, version: pkg.version });
  });
});

describe("the built cli", () => {
  it("exits non-zero with FRESHDESK_API_KEY unset: the message on stderr, nothing on stdout", () => {
    const out = mkdtempSync(join(tmpdir(), "freshdesk-mcp-cli-"));
    try {
      buildCli(out);
      const run = runBuiltCli(out, {
        PATH: process.env.PATH ?? "",
        FRESHDESK_DOMAIN: "acme.freshdesk.com",
      });
      expect(run.status).not.toBe(0);
      expect(run.status).not.toBeNull();
      expect(run.stdout).toBe("");
      expect(run.stderr).toContain("FRESHDESK_API_KEY");
      expect(run.stderr).not.toMatch(/\bat\s.*\(|\.js:\d+/);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 120_000);
});

describe("test/support/cli-process.ts", () => {
  it.each(["FRESHDESK_API_KEY", "FRESHDESK_HOST_OVERRIDE"])(
    "refuses an env naming %s, even empty, before spawning",
    (name) => {
      // No build in this directory: a spawn would fail differently.
      const out = mkdtempSync(join(tmpdir(), "freshdesk-mcp-cli-"));
      try {
        expect(() => runBuiltCli(out, { [name]: "" })).toThrow(`without ${name}`);
      } finally {
        rmSync(out, { recursive: true, force: true });
      }
    },
  );

  it.each([
    ["the repository", ROOT],
    ["os.tmpdir() itself", tmpdir()],
  ])("refuses a directory outside os.tmpdir(): %s", (_, where) => {
    expect(() => runBuiltCli(where, {})).toThrow("not a directory under os.tmpdir()");
    expect(() => buildCli(where)).toThrow("not a directory under os.tmpdir()");
  });
});

describe("examples/team-config.example.json", () => {
  it('parses with toolsets ["core"], and a server starts from it', async () => {
    const example = join(ROOT, "examples", "team-config.example.json");
    const config = loadConfig({ ...baseEnv, FRESHDESK_MCP_CONFIG: example });
    expect(config.team.toolsets).toEqual(["core"]);
    const server = createServer(createContext(config, mock), { core });
    servers.push(server);
    expect((await listTools(server)).length).toBe(core.length);
  });
});
