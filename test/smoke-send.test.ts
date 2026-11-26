// T-086 (SPEC §11, §13 M3, §14 rule 1; RFC 2026-11-26-send-safety-core,
// OD-20, OD-21, OD-28, A4, A6; AGENTS.md hard rule 1): `make smoke-send`,
// the owner's manual run of one send on one `mcp-test` ticket. MockAgent
// only: no send reaches the real account before T-087, and no test runs the
// script against it. Every id, name and address here is invented.
//
//   - Before any send, one GET of the ticket with `include=requester` (A6):
//     the tag, spam, requester and CC checks refuse with that GET and
//     nothing else.
//   - The A4 opt-in (`TICKET_CC=allow-listed`): reply only, exactly one
//     distinct ticket CC, on the allow-list, not the requester.
//   - Each send is two calls: "Not sent" and a `send_id` with 0 requests,
//     then `confirm: true` with it.
//   - The sends go through the server's send tools, so through the core's
//     entries, built by `createContext` from the team `loadConfig` loads (the
//     script's source is read, as T-075's).
//   - Output: yes/no and counts; never an id, an address, a body, the domain
//     or the key.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BODIES, CC_FIELDS, runSend, type SendArgs } from "../scripts/smoke/send.js";
import { rawTicket } from "./fixtures/schema.js";
import { type MockAgent, mockDispatcher } from "./support/mock-dispatcher.js";

// Invented: none may appear in any output.
const DOMAIN = "quillmoor.freshdesk.com";
const API_KEY = "k3y-Secret-Value-123";
const ORIGIN = `https://${DOMAIN}`;
const JSON_TYPE = { "content-type": "application/json" };
/** Put in answers and error bodies: no output may quote it. */
const CANARY = "Canary-Error-Text-5531";

const ID = rawTicket.id;
const CONVERSATION = 7001;
const TICKET = `/api/v2/tickets/${ID}`;
const GET_PATH = `${TICKET}?include=requester`;
const POSTS = {
  reply: `${TICKET}/reply`,
  forward: `${TICKET}/forward`,
  "public-note": `${TICKET}/notes`,
} as const;
const REQUESTER = "juniper@example.test";
const BUILDER = "builder@example.test";
const MAILBOX = "mailbox@example.test";
const OUTSIDER = "someone@elsewhere.test";
const TEAM = { toolsets: ["core", "send"], forward_allow_list: ["@example.test"] };

/** A sendable ticket: tagged, not spam, requester on the list, no CC. */
const ticket = {
  ...rawTicket,
  tags: ["mcp-test"],
  spam: false,
  requester: { id: 9001, name: "Juniper Quill", email: REQUESTER },
  cc_emails: [],
  fwd_emails: [],
  reply_cc_emails: [],
  ticket_cc_emails: [],
};

const dir = mkdtempSync(join(tmpdir(), "freshdesk-mcp-smoke-send-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
let fileCount = 0;

let mock: MockAgent;

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  mock = mockDispatcher();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await mock.close();
});

function env(team: unknown = TEAM): NodeJS.ProcessEnv {
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

function replyTicket(change: Record<string, unknown> = {}) {
  reply(GET_PATH, { ...ticket, ...change });
}

/** Freshdesk's answer to a send, echoing what it can. */
function answer(extra: Record<string, unknown> = {}) {
  return {
    id: CONVERSATION,
    user_id: 77,
    incoming: false,
    body: CANARY,
    ticket_id: ID,
    to_emails: [REQUESTER],
    cc_emails: [MAILBOX],
    ...extra,
  };
}

/** Every request MockAgent saw, as `METHOD path?query`. */
function sent(): string[] {
  return (mock.getCallHistory()?.calls() ?? []).map((call) => {
    const url = new URL(call.fullUrl);
    return `${call.method} ${url.pathname}${url.search}`;
  });
}

function posts(): string[] {
  return sent().filter((line) => !line.startsWith("GET "));
}

/** The body of the one POST sent. */
function postBody(): Record<string, unknown> {
  const calls = (mock.getCallHistory()?.calls() ?? []).filter((call) => call.method === "POST");
  expect(calls).toHaveLength(1);
  return JSON.parse(calls[0]!.body as string) as Record<string, unknown>;
}

async function run(args: SendArgs, environment: NodeJS.ProcessEnv = env()) {
  const lines: string[] = [];
  const code = await runSend(environment, mock, (line) => lines.push(line), args);
  return { code, out: lines.join("\n") };
}

/** Nothing read from the account or given on the command line is printed. */
function expectPrivate(out: string): void {
  for (const value of [
    String(ID),
    String(CONVERSATION),
    "9001",
    rawTicket.subject,
    DOMAIN,
    "quillmoor",
    API_KEY,
    CANARY,
    ...Object.values(BODIES),
    "@",
    "Juniper",
    "send_id:",
  ]) {
    expect(out).not.toContain(value);
  }
  expect(out).not.toMatch(/[0-9a-f]{16}/);
}

const ARGS = {
  reply: { case: "reply", ticket: String(ID) },
  forward: { case: "forward", ticket: String(ID), to: BUILDER },
  "public-note": { case: "public-note", ticket: String(ID) },
} satisfies Record<string, SendArgs>;
const CASES = Object.keys(ARGS) as (keyof typeof ARGS)[];
const A4: SendArgs = { ...ARGS.reply, ticketCc: "allow-listed" };

describe("smoke-send: a sendable ticket's send, in two steps, through the send tools", () => {
  it("reply: one GET, step 1 sends nothing, step 2 one POST, no cc of its own", async () => {
    replyTicket();
    reply(POSTS.reply, answer(), "POST", 201);
    const { code, out } = await run(ARGS.reply);
    expect(code).toBe(0);
    expect(sent()).toEqual([`GET ${GET_PATH}`, `POST ${POSTS.reply}`]);
    expect(postBody()).toEqual({ body: expect.stringContaining("smoke-send") as unknown });
    expect(out).toContain(
      "ticket: tag mcp-test yes, spam no, requester on the allow-list yes, ticket CC 0",
    );
    expect(out).toContain(
      "reply_to_ticket step 1: not sent yes, send_id yes, to 1, cc 0, requests 0",
    );
    expect(out).toContain("reply_to_ticket step 2: sent yes, api calls 1");
    expect(out).toContain("smoke send reply: ok, requests 2");
    expectPrivate(out);
  });

  it("forward: one POST to the TO address, no cc, attachments off", async () => {
    replyTicket();
    reply(POSTS.forward, answer(), "POST", 201);
    const { code, out } = await run(ARGS.forward);
    expect(code).toBe(0);
    expect(sent()).toEqual([`GET ${GET_PATH}`, `POST ${POSTS.forward}`]);
    expect(postBody()).toEqual({
      body: expect.stringContaining("smoke-send") as unknown,
      to_emails: [BUILDER],
      include_original_attachments: false,
    });
    expect(out).toContain(
      "forward_ticket step 1: not sent yes, send_id yes, to 1, cc 0, requests 0",
    );
    expect(out).toContain("forward_ticket step 2: sent yes, api calls 1");
    expect(out).toContain("smoke send forward: ok, requests 2");
    expectPrivate(out);
  });

  it("forward: a requester off the allow-list does not stop it", async () => {
    replyTicket({ requester: { email: OUTSIDER } });
    reply(POSTS.forward, answer(), "POST", 201);
    const { code, out } = await run(ARGS.forward);
    expect(code).toBe(0);
    expect(out).toContain("requester on the allow-list no");
    expectPrivate(out);
  });

  it("public note: one POST of {body, private: false}, answered public", async () => {
    replyTicket();
    reply(POSTS["public-note"], answer({ private: false }), "POST", 201);
    const { code, out } = await run(ARGS["public-note"]);
    expect(code).toBe(0);
    expect(sent()).toEqual([`GET ${GET_PATH}`, `POST ${POSTS["public-note"]}`]);
    expect(postBody()).toEqual({
      body: expect.stringContaining("smoke-send") as unknown,
      private: false,
    });
    expect(out).toContain(
      "add_public_note step 1: not sent yes, send_id yes, to 1, cc 0, requests 0",
    );
    expect(out).toContain("add_public_note step 2: sent yes, api calls 1, answered private no");
    expect(out).toContain("smoke send public-note: ok, requests 2");
    expectPrivate(out);
  });

  it("public note answered private: true: sent, reported, exit non-zero", async () => {
    replyTicket();
    reply(POSTS["public-note"], answer({ private: true }), "POST", 201);
    const { code, out } = await run(ARGS["public-note"]);
    expect(code).toBe(1);
    expect(posts()).toEqual([`POST ${POSTS["public-note"]}`]);
    expect(out).toContain("add_public_note step 2: sent yes, api calls 1, answered private yes");
    expect(out).toContain("smoke send public-note: fail, requests 2");
    expectPrivate(out);
  });

  it("public note answered without a private flag: the core's server error, may have been sent", async () => {
    replyTicket();
    reply(POSTS["public-note"], answer(), "POST", 201);
    const { code, out } = await run(ARGS["public-note"]);
    expect(code).toBe(1);
    expect(out).toContain("add_public_note step 2: fail server, may_have_been_sent yes");
    expectPrivate(out);
  });
});

describe("smoke-send: the ticket check refuses with its one GET and nothing else", () => {
  it.each(CASES)("%s: a ticket without the mcp-test tag", async (name) => {
    replyTicket({ tags: ["other"] });
    const { code, out } = await run(ARGS[name]);
    expect(code).toBe(1);
    expect(sent()).toEqual([`GET ${GET_PATH}`]);
    expect(out).toContain("ticket: refused (no mcp-test tag)");
    expect(out).toContain(`smoke send ${name}: refused, nothing sent; requests 1`);
    expectPrivate(out);
  });

  it.each(CASES)("%s: a spam ticket", async (name) => {
    replyTicket({ spam: true });
    const { code, out } = await run(ARGS[name]);
    expect(code).toBe(1);
    expect(sent()).toEqual([`GET ${GET_PATH}`]);
    expect(out).toContain("ticket: refused (spam)");
    expectPrivate(out);
  });

  it("matches the tag exactly", async () => {
    for (const tags of [["MCP-Test"], ["mcp-test-old"], [" mcp-test"]]) {
      replyTicket({ tags });
      const { code } = await run(ARGS.reply);
      expect(code).toBe(1);
    }
    expect(posts()).toEqual([]);
  });

  it.each(["reply", "public-note"] as const)("%s: a requester off the allow-list", async (name) => {
    replyTicket({ requester: { email: OUTSIDER } });
    const { code, out } = await run(ARGS[name]);
    expect(code).toBe(1);
    expect(sent()).toEqual([`GET ${GET_PATH}`]);
    expect(out).toContain("ticket: refused (requester not on the allow-list)");
    expectPrivate(out);
  });

  const nonEmpty = CASES.flatMap((name) => CC_FIELDS.map((field) => [name, field] as const));
  it.each(nonEmpty)("%s: %s not empty", async (name, field) => {
    replyTicket({ [field]: [MAILBOX] });
    const { code, out } = await run(ARGS[name]);
    expect(code).toBe(1);
    expect(sent()).toEqual([`GET ${GET_PATH}`]);
    expect(out).toContain(`ticket: refused (${field} not empty)`);
    expectPrivate(out);
  });

  it.each<[string, Record<string, unknown>, string]>([
    ["tags missing", { tags: undefined }, "tags field missing"],
    ["tags not a list", { tags: "mcp-test" }, "tags field missing"],
    ["tags not strings", { tags: ["mcp-test", 3] }, "tags field missing"],
    ["spam missing", { spam: undefined }, "spam field missing"],
    ["spam not a boolean", { spam: "false" }, "spam field missing"],
    ["no requester", { requester: undefined }, "requester email missing"],
    ["a null requester", { requester: null }, "requester email missing"],
    ["no requester email", { requester: { id: 9001 } }, "requester email missing"],
    ["an empty requester email", { requester: { email: "" } }, "requester email missing"],
    ...CC_FIELDS.flatMap((field): [string, Record<string, unknown>, string][] => [
      [`${field} absent`, { [field]: undefined }, `${field} field missing`],
      [`${field} null`, { [field]: null }, `${field} field missing`],
      [`${field} not a list`, { [field]: MAILBOX }, `${field} field missing`],
      [`${field} not strings`, { [field]: [1] }, `${field} field missing`],
    ]),
  ])("a ticket with %s refuses every case", async (_, change, line) => {
    for (const name of CASES) {
      replyTicket(change);
      const { code, out } = await run(ARGS[name]);
      expect(code).toBe(1);
      expect(out).toContain(`ticket: refused (${line})`);
      expectPrivate(out);
    }
    expect(posts()).toEqual([]);
    expect(sent()).toHaveLength(CASES.length);
  });

  it.each([
    ["a 404", 404, "not_found"],
    ["a 5xx", 500, "server"],
  ])("a GET answered %s refuses with nothing sent", async (_, status, code) => {
    reply(GET_PATH, { description: CANARY }, "GET", status, 5);
    const result = await run(ARGS.reply);
    expect(result.code).toBe(1);
    expect(posts()).toEqual([]);
    expect(result.out).toContain(`ticket: refused (GET failed: ${code})`);
    expectPrivate(result.out);
  });
});

describe("smoke-send: TICKET_CC=allow-listed, the one A4 run (OD-21)", () => {
  it("reply on a ticket whose one distinct CC is allow-listed: sent, no cc of its own", async () => {
    replyTicket({ cc_emails: [MAILBOX], ticket_cc_emails: ["Mailbox@Example.TEST"] });
    reply(POSTS.reply, answer(), "POST", 201);
    const { code, out } = await run(A4);
    expect(code).toBe(0);
    expect(sent()).toEqual([`GET ${GET_PATH}`, `POST ${POSTS.reply}`]);
    expect(postBody()).not.toHaveProperty("cc_emails");
    expect(out).toContain("requester on the allow-list yes, ticket CC 1");
    expect(out).toContain(
      "reply_to_ticket step 1: not sent yes, send_id yes, to 1, cc 0, requests 0",
    );
    expect(out).toContain("smoke send reply: ok, requests 2");
    expectPrivate(out);
  });

  it.each<[string, Record<string, unknown>, string]>([
    ["no CC", {}, "ticket CC: 0 distinct addresses, allow-listed takes exactly one"],
    [
      "two distinct CCs",
      { cc_emails: [MAILBOX], reply_cc_emails: [BUILDER] },
      "ticket CC: 2 distinct addresses, allow-listed takes exactly one",
    ],
    ["an off-list CC", { fwd_emails: [OUTSIDER] }, "ticket CC not on the allow-list"],
    [
      "a CC equal to the requester",
      { cc_emails: ["JUNIPER@example.test"] },
      "ticket CC is the requester",
    ],
    [
      "a requester off the allow-list",
      { cc_emails: [MAILBOX], requester: { email: OUTSIDER } },
      "requester not on the allow-list",
    ],
    ["a CC field missing", { cc_emails: [MAILBOX], fwd_emails: null }, "fwd_emails field missing"],
  ])("refuses %s, one GET and nothing else", async (_, change, line) => {
    replyTicket(change);
    const { code, out } = await run(A4);
    expect(code).toBe(1);
    expect(sent()).toEqual([`GET ${GET_PATH}`]);
    expect(out).toContain(`ticket: refused (${line})`);
    expectPrivate(out);
  });

  it.each<[string, SendArgs, string]>([
    ["another value", { ...ARGS.reply, ticketCc: "yes" }, "TICKET_CC takes allow-listed only"],
    ["a value in other case", { ...ARGS.reply, ticketCc: "Allow-Listed" }, "TICKET_CC takes"],
    [
      "a forward",
      { ...ARGS.forward, ticketCc: "allow-listed" },
      "TICKET_CC is taken by reply only",
    ],
    [
      "a public note",
      { ...ARGS["public-note"], ticketCc: "allow-listed" },
      "TICKET_CC is taken by reply only",
    ],
  ])("refuses %s before any request", async (_, args, line) => {
    const { code, out } = await run(args);
    expect(code).toBe(1);
    expect(sent()).toEqual([]);
    expect(out).toContain(`config: fail (${line}`);
    expectPrivate(out);
  });
});

describe("smoke-send: a failed send prints its code only and exits non-zero", () => {
  it.each([
    [500, "server", "yes"],
    [400, "validation", "no"],
  ])("a POST answered %i", async (status, code, maybe) => {
    replyTicket();
    reply(POSTS.reply, { description: CANARY, errors: [{ message: CANARY }] }, "POST", status);
    const result = await run(ARGS.reply);
    expect(result.code).toBe(1);
    expect(posts()).toEqual([`POST ${POSTS.reply}`]);
    expect(result.out).toContain(
      `reply_to_ticket step 2: fail ${code}, may_have_been_sent ${maybe}`,
    );
    expect(result.out).toContain("smoke send reply: fail");
    expectPrivate(result.out);
  });

  it("a forward to more than 10 addresses: step 1 refused by the core, nothing sent", async () => {
    replyTicket();
    const to = Array.from({ length: 11 }, (_, i) => `b${i}@example.test`).join(",");
    const { code, out } = await run({ ...ARGS.forward, to });
    expect(code).toBe(1);
    expect(posts()).toEqual([]);
    expect(out).toContain("forward_ticket step 1: fail validation");
    expectPrivate(out);
  });
});

describe("smoke-send: refused before any request", () => {
  it("a team file without send: the send tools are not there, nothing sent", async () => {
    const { code, out } = await run(ARGS.reply, env({ ...TEAM, toolsets: ["core", "write"] }));
    expect(code).toBe(1);
    expect(sent()).toEqual([]);
    expect(out).toContain("config: fail (the team file does not enable send");
  });

  it("FRESHDESK_HOST_OVERRIDE set", async () => {
    const { code, out } = await run(ARGS.reply, {
      ...env(),
      FRESHDESK_HOST_OVERRIDE: "127.0.0.1:1",
    });
    expect(code).toBe(1);
    expect(sent()).toEqual([]);
    expect(out).toContain("FRESHDESK_HOST_OVERRIDE is set");
  });

  it("a configuration that cannot be loaded", async () => {
    const { code, out } = await run(ARGS.reply, { FRESHDESK_DOMAIN: DOMAIN });
    expect(code).toBe(1);
    expect(sent()).toEqual([]);
    expect(out).toBe(
      "config: fail (check FRESHDESK_DOMAIN, FRESHDESK_API_KEY, FRESHDESK_MCP_CONFIG)",
    );
  });

  it.each<[string, SendArgs]>([
    ["no case", { ticket: "1" }],
    ["a smoke-write case", { case: "C4", ticket: "1" }],
    ["a case in other case", { case: "Reply", ticket: "1" }],
    ["no ticket", { case: "reply" }],
    ["an empty ticket", { case: "reply", ticket: "" }],
    ["a ticket that is not an id", { case: "reply", ticket: "12a" }],
    ["ticket 0", { case: "reply", ticket: "0" }],
    ["a leading zero", { case: "reply", ticket: "012" }],
    ["an unsafe id", { case: "reply", ticket: "9007199254740993" }],
    ["two tickets", { case: "reply", ticket: "1,2" }],
    ["a forward with no TO", { case: "forward", ticket: "1" }],
    ["TO for a reply", { case: "reply", ticket: "1", to: BUILDER }],
    ["TO for a public note", { case: "public-note", ticket: "1", to: BUILDER }],
    ["a TO off the allow-list", { case: "forward", ticket: "1", to: `${BUILDER},${OUTSIDER}` }],
    ["a TO with a display name", { case: "forward", ticket: "1", to: `B <${BUILDER}>` }],
    ["an empty TO entry", { case: "forward", ticket: "1", to: `${BUILDER},` }],
  ])("%s", async (_, args) => {
    const { code, out } = await run(args);
    expect(code).toBe(1);
    expect(sent()).toEqual([]);
    expect(out).toMatch(/^config: fail \(/);
    expect(out).not.toContain("12a");
    expectPrivate(out);
  });

  it("a TO off the allow-list is named by position only", async () => {
    const { out } = await run({ case: "forward", ticket: "1", to: `${BUILDER},${OUTSIDER}` });
    expect(out).toBe("config: fail (TO address 2 of 2 is not on the allow-list)");
  });
});

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

describe("smoke-send: its source takes the send side from the context only", () => {
  const modules = scriptModules(resolve("scripts/smoke/send.ts"));

  it("reads send.ts and the scripts/ modules it imports", () => {
    expect([...modules.keys()]).toContain(resolve("scripts/smoke/send.ts"));
    expect([...modules.keys()].every((path) => path.startsWith(resolve("scripts")))).toBe(true);
  });

  it.each([...modules.keys()])("%s", (path) => {
    const source = modules.get(path)!;
    // From src/core/, T-081's matcher only.
    for (const match of source.matchAll(/import\s+([^;]*?)\s+from\s+"([^"]+)"/gs)) {
      if (!/(^|\/)src\/core\//.test(match[2]!)) continue;
      expect(match[2]).toMatch(/\/src\/core\/recipients\.js$/);
      expect(match[1]!.replace(/\s+/g, "")).toBe("{onAllowList}");
    }
    expect(source).not.toMatch(/import\(/);
    // No client of its own.
    expect(source).not.toMatch(/HttpClient|RateLimiter|SmokeClient|createWritePath/);
    expect(source).not.toMatch(/smoke\.js"|client\/http\.js"|rate-limit\.js"|resources/);
    // No method set: no request of its own other than what the core sends.
    expect(source).not.toMatch(/\bmethod\b/);
    // The entries come from the team file loadConfig loads: no toolsets literal.
    expect(source).not.toMatch(/toolsets\s*:/);
    expect(source).not.toMatch(/["'](send|write)["']\s*[\],]/);
  });

  it("builds the context from loadConfig's configuration", () => {
    const source = modules.get(resolve("scripts/smoke/send.ts"))!;
    expect(source).toMatch(/loadConfig\(env\)/);
    expect(source).toMatch(/createContext\(config, /);
  });

  it("its make target has a one-line description, so make help lists it", () => {
    const makefile = readFileSync(join(import.meta.dirname, "..", "Makefile"), "utf8");
    expect(makefile).toMatch(/^smoke-send: ## T-086's one send [^\n]+$/m);
    expect(makefile).toMatch(
      /cli\.js --send --case "\$\$\{CASE:-\}" --ticket "\$\$\{TICKET:-\}" --to "\$\$\{TO:-\}" --ticket-cc "\$\$\{TICKET_CC:-\}"$/m,
    );
  });
});
