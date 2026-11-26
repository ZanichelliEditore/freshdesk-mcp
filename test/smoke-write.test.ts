// T-075 (SPEC §11, §14 rule 1; RFC 2026-11-25-write-safety-core; AGENTS.md
// hard rule 1): `make smoke-write`, the owner's manual run of each write tool
// on `mcp-test` tickets. MockAgent only: no write reaches the real account
// before T-076, and no test runs the script against it. Every id, name and
// address here is invented.
//
//   - Before any write, one GET per ticket: a ticket without the `mcp-test`
//     tag, a spam ticket, a ticket whose `tags` or `spam` field is missing,
//     and a GET that fails (5xx, 404, timeout) each refuse the run with
//     nothing written.
//   - The writes go through the server's write tools, so through the core's
//     entries, built by `createContext` from the team `loadConfig` loads: the
//     script's source (and every `scripts/` module it imports) takes nothing
//     from src/core/ but the entry builder, imports no `HttpClient` and sets
//     no `method`.
//   - Output: yes/no and counts; never an id, a subject, a body, a field
//     value, the domain or the key. A failed write prints its code only and
//     exits non-zero.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOTE_BODY, DRAFT_BODY, runWrite, type WriteArgs } from "../scripts/smoke/write.js";
import { agentPages, groupPages } from "./fixtures/agents-groups.js";
import { rawTicket, schemaFieldsPayload } from "./fixtures/schema.js";
import { type MockAgent, mockDispatcher } from "./support/mock-dispatcher.js";
import { silentFor } from "./support/slow-replies.js";

// Invented: neither may appear in any output.
const DOMAIN = "quillmoor.freshdesk.com";
const API_KEY = "k3y-Secret-Value-123";
const ORIGIN = `https://${DOMAIN}`;
const JSON_TYPE = { "content-type": "application/json" };
/** Put in error bodies: no output may quote it. */
const CANARY = "Canary-Error-Text-5531";

const ID = rawTicket.id;
const OTHER = 4243;
const NOTE_ID = 9001;
const AGENT = 502;
const TICKET = `/api/v2/tickets/${ID}`;
const NOTES = `${TICKET}/notes`;
const FIELDS = "/api/v2/ticket_fields";
const AGENTS = "/api/v2/agents?per_page=100";
const GROUPS = "/api/v2/groups?per_page=100";
/** A field value no output may quote. */
const HOBBY = "Quillmoor chess";

const tagged = { ...rawTicket, tags: ["mcp-test"], spam: false };

const dir = mkdtempSync(join(tmpdir(), "freshdesk-mcp-smoke-write-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
let fileCount = 0;

let mock: MockAgent;

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  mock = mockDispatcher();
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await mock.close();
});

function env(team: unknown = { toolsets: ["core", "write"] }): NodeJS.ProcessEnv {
  const path = join(dir, `team-${++fileCount}.json`);
  writeFileSync(path, JSON.stringify(team));
  return { FRESHDESK_DOMAIN: DOMAIN, FRESHDESK_API_KEY: API_KEY, FRESHDESK_MCP_CONFIG: path };
}

function reply(path: string, body: unknown, method = "GET", status = 200, times = 1) {
  mock
    .get(ORIGIN)
    .intercept({ path, method })
    .reply(status, body as object, { headers: JSON_TYPE })
    .times(times);
}

function replySchema() {
  reply(FIELDS, schemaFieldsPayload);
  reply(AGENTS, agentPages.flat());
  reply(GROUPS, groupPages.flat());
}

function replyAgent(id: number) {
  reply(`/api/v2/agents/${id}`, {
    id,
    contact: { active: true, email: `agent${id}@example.test`, name: `Agent ${id}` },
  });
}

function noteAnswer(body: string) {
  return { id: NOTE_ID, user_id: 77, body, incoming: false, private: true, ticket_id: ID };
}

/** Every request MockAgent saw, as `METHOD path`. */
function sent(): string[] {
  return (mock.getCallHistory()?.calls() ?? []).map((call) => `${call.method} ${call.path}`);
}

function writes(): string[] {
  return sent().filter((line) => !line.startsWith("GET "));
}

/** The body of the one request sent with `method`. */
function bodyOf(method: "POST" | "PUT"): Record<string, unknown> {
  const calls = (mock.getCallHistory()?.calls() ?? []).filter((call) => call.method === method);
  expect(calls).toHaveLength(1);
  return JSON.parse(calls[0]!.body as string) as Record<string, unknown>;
}

async function run(args: WriteArgs, environment: NodeJS.ProcessEnv = env()) {
  const lines: string[] = [];
  const code = await runWrite(environment, mock, (line) => lines.push(line), args);
  return { code, out: lines.join("\n") };
}

/** Nothing read from the account or given on the command line is printed. */
function expectPrivate(out: string): void {
  for (const value of [
    String(ID),
    String(OTHER),
    String(AGENT),
    String(NOTE_ID),
    rawTicket.subject,
    DOMAIN,
    "quillmoor",
    API_KEY,
    HOBBY,
    CANARY,
    NOTE_BODY,
    DRAFT_BODY,
    "@",
    "Juniper",
    "Widget Desk",
  ]) {
    expect(out).not.toContain(value);
  }
}

/** One case's arguments on the one tagged ticket. */
const ARGS: Record<string, WriteArgs> = {
  C1: { case: "C1", tickets: String(ID), fields: JSON.stringify({ Hobby: HOBBY }) },
  C8: { case: "C8", tickets: String(ID), fields: JSON.stringify({ Hobby: HOBBY }) },
  C4: { case: "C4", tickets: String(ID) },
  C5: { case: "C5", tickets: String(ID), fields: JSON.stringify({ Hobby: HOBBY }) },
  C6: { case: "C6", tickets: String(ID), fields: JSON.stringify({ Group: "Widget Desk" }) },
};
const CASES = Object.keys(ARGS);

describe("smoke-write: the tag check refuses with one GET and nothing else", () => {
  it.each(CASES)("%s: a ticket without the mcp-test tag", async (name) => {
    reply(TICKET, { ...tagged, tags: ["other"] });
    const { code, out } = await run(ARGS[name]!);
    expect(code).toBe(1);
    expect(sent()).toEqual([`GET ${TICKET}`]);
    expect(out).toContain("ticket 1 of 1: refused (no mcp-test tag)");
    expect(out).toContain(`smoke write ${name}: refused, nothing written`);
    expectPrivate(out);
  });

  it.each(CASES)("%s: a spam ticket", async (name) => {
    reply(TICKET, { ...tagged, spam: true });
    const { code, out } = await run(ARGS[name]!);
    expect(code).toBe(1);
    expect(sent()).toEqual([`GET ${TICKET}`]);
    expect(out).toContain("ticket 1 of 1: refused (spam)");
    expectPrivate(out);
  });

  it("matches the tag exactly: MCP-Test or a tag containing it is not the tag", async () => {
    for (const tags of [["MCP-Test"], ["mcp-test-old"], [" mcp-test"]]) {
      reply(TICKET, { ...tagged, tags });
      const { code } = await run(ARGS.C5!);
      expect(code).toBe(1);
    }
    expect(writes()).toEqual([]);
  });

  it.each([
    ["tags missing", { tags: undefined }, "refused (tags field missing)"],
    ["tags not a list", { tags: "mcp-test" }, "refused (tags field missing)"],
    ["tags not strings", { tags: ["mcp-test", 3] }, "refused (tags field missing)"],
    ["spam missing", { spam: undefined }, "refused (spam field missing)"],
    ["spam not a boolean", { spam: "false" }, "refused (spam field missing)"],
  ])("a ticket with %s", async (_, change, line) => {
    reply(TICKET, { ...tagged, ...change });
    const { code, out } = await run(ARGS.C5!);
    expect(code).toBe(1);
    expect(sent()).toEqual([`GET ${TICKET}`]);
    expect(out).toContain(`ticket 1 of 1: ${line}`);
  });

  it.each([
    ["a 404", 404, "not_found"],
    ["a 5xx", 500, "server"],
  ])("a tag check answered %s refuses with nothing written", async (_, status, code) => {
    reply(TICKET, { description: CANARY }, "GET", status, 5);
    const result = await run(ARGS.C6!);
    expect(result.code).toBe(1);
    expect(writes()).toEqual([]);
    expect(result.out).toContain(`ticket 1 of 1: refused (GET failed: ${code})`);
    expectPrivate(result.out);
  });

  it("a tag check that times out refuses with nothing written", async () => {
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    mock.get(ORIGIN).intercept({ path: TICKET, method: "GET" }).reply(silentFor(31_000)).times(5);
    const { code, out } = await run(ARGS.C4!);
    expect(code).toBe(1);
    expect(writes()).toEqual([]);
    expect(out).toContain("ticket 1 of 1: refused (GET failed: network)");
  });

  it("C1 with two tickets, the second untagged: two GETs, nothing written", async () => {
    reply(TICKET, tagged);
    reply(`/api/v2/tickets/${OTHER}`, { ...tagged, id: OTHER, tags: [] });
    const { code, out } = await run({ ...ARGS.C1!, tickets: `${ID},${OTHER}` });
    expect(code).toBe(1);
    expect(sent()).toEqual([`GET ${TICKET}`, `GET /api/v2/tickets/${OTHER}`]);
    expect(out).toContain("ticket 1 of 2: tag mcp-test yes, spam no");
    expect(out).toContain("ticket 2 of 2: refused (no mcp-test tag)");
    expectPrivate(out);
  });
});

describe("smoke-write: a tagged ticket's write goes through the write tools", () => {
  it("C5 updates the fields through update_ticket, tags untouched", async () => {
    reply(TICKET, tagged);
    replySchema();
    reply(TICKET, rawTicket, "PUT");
    const { code, out } = await run(ARGS.C5!);
    expect(code).toBe(0);
    expect(sent().filter((line) => line === `GET ${TICKET}`)).toHaveLength(1);
    expect(writes()).toEqual([`PUT ${TICKET}`]);
    expect(bodyOf("PUT")).toEqual({ custom_fields: { cf_hobby: HOBBY } });
    expect(out).toContain("ticket 1 of 1: tag mcp-test yes, spam no");
    expect(out).toContain("update_ticket: changed yes");
    expect(out).toContain("smoke write C5: ok");
    expectPrivate(out);
  });

  it("C4 posts a private note through add_note, notifying the agents given", async () => {
    reply(TICKET, tagged);
    replyAgent(AGENT);
    reply(NOTES, noteAnswer(NOTE_BODY), "POST", 201);
    const { code, out } = await run({ ...ARGS.C4!, notify: String(AGENT) });
    expect(code).toBe(0);
    expect(sent()).toEqual([`GET ${TICKET}`, `GET /api/v2/agents/${AGENT}`, `POST ${NOTES}`]);
    expect(bodyOf("POST")).toEqual({
      body: NOTE_BODY,
      private: true,
      notify_emails: [`agent${AGENT}@example.test`],
    });
    expect(out).toContain("add_note: written yes, private yes, notified 1");
    expect(out).toContain("smoke write C4: ok");
    expectPrivate(out);
  });

  it("C6 posts the draft and assigns through hand_off_draft", async () => {
    reply(TICKET, tagged);
    replySchema();
    reply(NOTES, noteAnswer(DRAFT_BODY), "POST", 201);
    reply(TICKET, rawTicket, "PUT");
    const { code, out } = await run(ARGS.C6!);
    expect(code).toBe(0);
    expect(writes()).toEqual([`POST ${NOTES}`, `PUT ${TICKET}`]);
    expect(bodyOf("POST")).toMatchObject({ private: true });
    expect(String(bodyOf("POST").body)).toContain(DRAFT_BODY);
    expect(bodyOf("PUT")).toEqual({ group_id: 702 });
    expect(out).toContain("hand_off_draft: note yes, private yes, assigned yes, notified 0");
    expect(out).toContain("smoke write C6: ok");
    expectPrivate(out);
  });

  it.each(["C1", "C8"])("%s previews then confirms through categorize_tickets", async (name) => {
    reply(TICKET, tagged, "GET", 200, 2);
    replySchema();
    reply(TICKET, rawTicket, "PUT");
    const { code, out } = await run(ARGS[name]!);
    expect(code).toBe(0);
    expect(sent().filter((line) => line === `GET ${TICKET}`)).toHaveLength(2);
    expect(writes()).toEqual([`PUT ${TICKET}`]);
    expect(bodyOf("PUT")).toEqual({ custom_fields: { cf_hobby: HOBBY } });
    expect(out).toContain("categorize_tickets preview: previewed 1 of 1");
    expect(out).toContain(
      "categorize_tickets confirm: written 1, refused 0, may_have_been_applied 0, not_attempted 0",
    );
    expect(out).toContain(`smoke write ${name}: ok`);
    expectPrivate(out);
  });

  it("C1 on two tagged tickets writes both", async () => {
    const other = `/api/v2/tickets/${OTHER}`;
    reply(TICKET, tagged, "GET", 200, 2);
    reply(other, { ...tagged, id: OTHER }, "GET", 200, 2);
    replySchema();
    reply(TICKET, rawTicket, "PUT");
    reply(other, { ...rawTicket, id: OTHER }, "PUT");
    const { code, out } = await run({ ...ARGS.C1!, tickets: `${ID},${OTHER}` });
    expect(code).toBe(0);
    expect(writes()).toEqual([`PUT ${TICKET}`, `PUT ${other}`]);
    expect(out).toContain("written 2, refused 0");
    expectPrivate(out);
  });

  it("prints the requests sent, counted at the dispatcher", async () => {
    reply(TICKET, tagged);
    reply(NOTES, noteAnswer(NOTE_BODY), "POST", 201);
    const { out } = await run(ARGS.C4!);
    expect(out).toContain("smoke write C4: ok, requests 2");
  });
});

describe("smoke-write: a failed write prints its code only and exits non-zero", () => {
  it.each([
    [400, "validation"],
    [500, "server"],
  ])("C5's PUT answered %i", async (status, code) => {
    reply(TICKET, tagged);
    replySchema();
    reply(
      TICKET,
      { description: CANARY, errors: [{ field: "cf_hobby", message: CANARY, code: "invalid" }] },
      "PUT",
      status,
    );
    const result = await run(ARGS.C5!);
    expect(result.code).toBe(1);
    expect(result.out).toContain(`update_ticket: fail ${code}`);
    expect(result.out).toContain("smoke write C5: fail");
    expectPrivate(result.out);
  });

  it("C4's POST answered 500", async () => {
    reply(TICKET, tagged);
    reply(NOTES, { description: CANARY }, "POST", 500);
    const { code, out } = await run(ARGS.C4!);
    expect(code).toBe(1);
    expect(out).toContain("add_note: fail server");
    expectPrivate(out);
  });

  it("C6 whose assignment fails after the note", async () => {
    reply(TICKET, tagged);
    replySchema();
    reply(NOTES, noteAnswer(DRAFT_BODY), "POST", 201);
    reply(TICKET, { description: CANARY }, "PUT", 400);
    const { code, out } = await run(ARGS.C6!);
    expect(code).toBe(1);
    expect(out).toMatch(/hand_off_draft: fail [a-z_]+$/m);
    expectPrivate(out);
  });

  it("C1 whose confirm is refused for the ticket", async () => {
    reply(TICKET, tagged, "GET", 200, 2);
    replySchema();
    reply(TICKET, { description: CANARY }, "PUT", 400);
    const { code, out } = await run(ARGS.C1!);
    expect(code).toBe(1);
    expect(out).toContain("written 0, refused 1, may_have_been_applied 0, not_attempted 0");
    expect(out).toContain("categorize_tickets confirm: ticket 1 of 1 refused validation");
    expectPrivate(out);
  });

  it("C1 whose preview cannot read the ticket writes nothing", async () => {
    reply(TICKET, tagged);
    replySchema();
    reply(TICKET, { description: CANARY }, "GET", 404);
    const { code, out } = await run(ARGS.C1!);
    expect(code).toBe(1);
    expect(writes()).toEqual([]);
    expect(out).toContain("categorize_tickets preview: previewed 0 of 1");
    expectPrivate(out);
  });

  it("a field the tool refuses writes nothing", async () => {
    reply(TICKET, tagged, "GET", 200, 3);
    replySchema();
    const { code, out } = await run({ ...ARGS.C5!, fields: JSON.stringify({ subject: "x" }) });
    expect(code).toBe(1);
    expect(writes()).toEqual([]);
    expect(out).toContain("update_ticket: fail validation");
  });

  it.each(["C1", "C5", "C6"])("%s: tags in FIELDS are refused, the tag stays", async (name) => {
    reply(TICKET, tagged, "GET", 200, 2);
    replySchema();
    const { code } = await run({ ...ARGS[name]!, fields: JSON.stringify({ tags: [] }) });
    expect(code).toBe(1);
    expect(writes()).toEqual([]);
  });
});

describe("smoke-write: refused before any request", () => {
  it("a team file without write: the write tools are not there, nothing sent", async () => {
    const { code, out } = await run(ARGS.C5!, env({ toolsets: ["core"] }));
    expect(code).toBe(1);
    expect(sent()).toEqual([]);
    expect(out).toContain("config: fail (the team file does not enable write");
  });

  it("FRESHDESK_HOST_OVERRIDE set", async () => {
    const { code, out } = await run(ARGS.C5!, {
      ...env(),
      FRESHDESK_HOST_OVERRIDE: "127.0.0.1:1",
    });
    expect(code).toBe(1);
    expect(sent()).toEqual([]);
    expect(out).toContain("FRESHDESK_HOST_OVERRIDE is set");
  });

  it("a configuration that cannot be loaded", async () => {
    const { code, out } = await run(ARGS.C5!, { FRESHDESK_DOMAIN: DOMAIN });
    expect(code).toBe(1);
    expect(sent()).toEqual([]);
    expect(out).toBe(
      "config: fail (check FRESHDESK_DOMAIN, FRESHDESK_API_KEY, FRESHDESK_MCP_CONFIG)",
    );
  });

  it.each<[string, WriteArgs]>([
    ["no case", { tickets: "1" }],
    ["an unknown case", { case: "C2", tickets: "1" }],
    ["no ticket", { case: "C4" }],
    ["an empty ticket list", { case: "C4", tickets: "" }],
    ["a ticket that is not an id", { case: "C4", tickets: "12a" }],
    ["ticket 0", { case: "C4", tickets: "0" }],
    ["a leading zero", { case: "C4", tickets: "012" }],
    ["an unsafe id", { case: "C4", tickets: "9007199254740993" }],
    ["a ticket twice", { case: "C1", tickets: "1,1", fields: '{"a":1}' }],
    ["two tickets for C4", { case: "C4", tickets: "1,2" }],
    ["two tickets for C5", { case: "C5", tickets: "1,2", fields: '{"a":1}' }],
    ["two tickets for C6", { case: "C6", tickets: "1,2", fields: '{"a":1}' }],
    ["51 tickets for C1", { case: "C1", tickets: range(51), fields: '{"a":1}' }],
    ["no fields for C1", { case: "C1", tickets: "1" }],
    ["no fields for C5", { case: "C5", tickets: "1" }],
    ["no fields for C6", { case: "C6", tickets: "1" }],
    ["fields for C4", { case: "C4", tickets: "1", fields: '{"a":1}' }],
    ["fields not JSON", { case: "C5", tickets: "1", fields: "{a:1}" }],
    ["fields a list", { case: "C5", tickets: "1", fields: "[1]" }],
    ["fields empty", { case: "C5", tickets: "1", fields: "{}" }],
    ["notify for C5", { case: "C5", tickets: "1", fields: '{"a":1}', notify: "3" }],
    ["notify for C1", { case: "C1", tickets: "1", fields: '{"a":1}', notify: "3" }],
    ["notify not ids", { case: "C4", tickets: "1", notify: "3,x" }],
  ])("%s", async (_, args) => {
    const { code, out } = await run(args);
    expect(code).toBe(1);
    expect(sent()).toEqual([]);
    expect(out).toMatch(/^config: fail \(/);
    expect(out).not.toContain("12a");
    expect(out).not.toContain("{a:1}");
  });

  it("51 tickets is over the cap but 50 is not", async () => {
    reply("/api/v2/tickets/1", { description: CANARY }, "GET", 404);
    const { out } = await run({ case: "C1", tickets: range(50), fields: '{"a":1}' });
    expect(out).not.toMatch(/^config: fail/);
  });
});

function range(n: number): string {
  return Array.from({ length: n }, (_, i) => String(i + 1)).join(",");
}

/** `path` and every module under scripts/ it imports, by relative specifier, each once. */
function scriptModules(path: string, seen = new Map<string, string>()): Map<string, string> {
  if (seen.has(path)) return seen;
  const source = readFileSync(path, "utf8");
  seen.set(path, source);
  for (const match of source.matchAll(/from\s+"(\.{1,2}\/[^"]+)"/g)) {
    const target = resolve(dirname(path), match[1]!.replace(/\.js$/, ".ts"));
    if (target.startsWith(resolve("scripts"))) scriptModules(target, seen);
  }
  return seen;
}

describe("smoke-write: its source takes the write side from the core's builder only", () => {
  const modules = scriptModules(resolve("scripts/smoke/write.ts"));

  it("reads write.ts and the scripts/ modules it imports", () => {
    expect([...modules.keys()]).toContain(resolve("scripts/smoke/write.ts"));
    expect([...modules.keys()].every((path) => path.startsWith(resolve("scripts")))).toBe(true);
  });

  it.each([...modules.keys()])("%s", (path) => {
    const source = modules.get(path)!;
    // From src/core/, the entry builder only.
    for (const match of source.matchAll(/import\s+([^;]*?)\s+from\s+"([^"]+)"/gs)) {
      if (!/(^|\/)src\/core\//.test(match[2]!)) continue;
      expect(match[1]!.replace(/\s+/g, "")).toBe("{createWritePath}");
    }
    expect(source).not.toMatch(/import\(/);
    // No client of its own.
    expect(source).not.toMatch(/HttpClient|RateLimiter|SmokeClient/);
    expect(source).not.toMatch(/smoke\.js"|client\/http\.js"|rate-limit\.js"/);
    // No method set: no request of its own other than what the core sends.
    expect(source).not.toMatch(/\bmethod\b/);
    // The entries come from the team file loadConfig loads: no toolsets literal.
    expect(source).not.toMatch(/toolsets\s*:/);
    expect(source).not.toMatch(/["']write["']\s*[\],]/);
  });

  it("builds the context from loadConfig's configuration", () => {
    const source = modules.get(resolve("scripts/smoke/write.ts"))!;
    expect(source).toMatch(/loadConfig\(env\)/);
    expect(source).toMatch(/createContext\(config, /);
  });
});
