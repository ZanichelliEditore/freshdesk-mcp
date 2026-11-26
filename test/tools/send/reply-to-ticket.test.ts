// T-084 (SPEC §8.2, §9, §3 C5; RFC 2026-11-26-send-safety-core, OD-20,
// OD-21, OD-27, OD-30, threats 1 to 3): `reply_to_ticket`, on a server from
// the real registry with `send` enabled, through the core's
// `reply_to_ticket` entry. MockAgent only: no send reaches a real account
// before T-087. Every id, name and address here is invented.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../../src/config.js";
import { createServer } from "../../../src/server.js";
import { createContext } from "../../../src/tools/context.js";
import {
  type ReplyToTicketEntry,
  replyToTicket,
  sendFailed,
} from "../../../src/tools/toolsets/send/reply-to-ticket.js";
import {
  type CallResult,
  callTool,
  listTools,
  open,
  type Session,
} from "../../support/mcp-session.js";
import { type MockAgent, mockDispatcher } from "../../support/mock-dispatcher.js";

const DOMAIN = "acme.freshdesk.com";
const ORIGIN = `https://${DOMAIN}`;
const JSON_TYPE = { "content-type": "application/json" };
const TOOL = "reply_to_ticket";
const ID = 4242;
const REPLY = `/api/v2/tickets/${ID}/reply`;
const BODY = "Hello,\nthe refund was issued today.";
const CC = "billing@example.test";
const TEAM = { toolsets: ["core", "send"], forward_allow_list: ["@example.test"] };

const dir = mkdtempSync(join(tmpdir(), "freshdesk-mcp-reply-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let mock: MockAgent;
let servers: McpServer[];
let fileCount = 0;

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  mock = mockDispatcher();
  servers = [];
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const server of servers) await server.close();
  await mock.close();
});

/** Freshdesk's reply answer, echoing every address it can. */
const ANSWER = {
  id: 7001,
  user_id: 77,
  body: "<div>Hello,<br>the refund was issued today.</div>",
  ticket_id: ID,
  from_email: "support@acme.example.test",
  to_emails: ["customer@example.test"],
  cc_emails: [CC],
  bcc_emails: ["hidden@example.test"],
  created_at: "2026-11-26T09:00:00Z",
};

function replyPost(answer: unknown = ANSWER, status = 201) {
  mock
    .get(ORIGIN)
    .intercept({ path: REPLY, method: "POST" })
    .reply(status, answer as object, { headers: JSON_TYPE });
}

/** Every request MockAgent saw, as `METHOD path`. */
function sent(): string[] {
  return (mock.getCallHistory()?.calls() ?? []).map((call) => `${call.method} ${call.path}`);
}

/** The body of the one POST sent. */
function postBody(): unknown {
  const posts = (mock.getCallHistory()?.calls() ?? []).filter((call) => call.method === "POST");
  expect(posts).toHaveLength(1);
  return JSON.parse(posts[0]!.body as string);
}

/** A session on a server from the real registry, built as cli.ts builds it. */
async function session(team: unknown = TEAM): Promise<Session> {
  const path = join(dir, `team-${++fileCount}.json`);
  writeFileSync(path, JSON.stringify(team));
  const config = loadConfig({
    FRESHDESK_DOMAIN: DOMAIN,
    FRESHDESK_API_KEY: "k3y-Secret-Value-123",
    FRESHDESK_MCP_CONFIG: path,
  });
  const server = createServer(createContext(config, mock));
  servers.push(server);
  return open(server);
}

function text(result: CallResult): string {
  return result.content.map((item) => item.text).join("\n");
}

function output(result: CallResult): Record<string, unknown> {
  expect(result.isError).toBeFalsy();
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
}

interface SentError {
  code: string;
  http_status: number | null;
  message: string;
  retryable: boolean;
  may_have_been_sent?: boolean;
  errors?: { field?: string; code?: string; message: string }[];
}

function failure(result: CallResult): SentError {
  expect(result.isError).toBe(true);
  return (JSON.parse(result.content[0]!.text) as { error: SentError }).error;
}

/** The first call: no confirm. Returns its `send_id`. */
async function mint(s: Session, args: Record<string, unknown> = {}): Promise<string> {
  const value = output(await callTool(s, TOOL, { ticket_id: ID, body: BODY, ...args }));
  expect(typeof value.send_id).toBe("string");
  return value.send_id as string;
}

describe("reply_to_ticket: two calls", () => {
  it("without confirm sends nothing and returns the Not sent result, ticket id first, with a send_id", async () => {
    const s = await session();

    const result = await callTool(s, TOOL, { ticket_id: ID, body: BODY, cc: [CC] });

    const value = output(result);
    expect(sent()).toEqual([]);
    expect(Object.keys(value)[0]).toBe("ticket_id");
    expect(value).toMatchObject({
      ticket_id: ID,
      sent: false,
      body: BODY,
      recipients: { to: ["the ticket's requester"], cc: [CC] },
      api_calls_used: 0,
    });
    const note = value.note as string;
    expect(note.startsWith(`Ticket ${ID}: check with the user that ticket ${ID}`)).toBe(true);
    expect(note).toContain("is the ticket they mean");
    expect(note).toContain("call again with `confirm: true` and this `send_id`");
    expect(note).toContain(
      "Freshdesk may also copy the ticket's existing CC addresses, which this tool does not check.",
    );
    expect(value.send_id).toEqual(expect.any(String));
    expect(value.expires_at).toEqual(expect.any(String));
  });

  it("with confirm: true and that send_id sends one POST to /reply, the body escaped and the cc", async () => {
    const s = await session();
    const sendId = await mint(s, { cc: [CC] });
    replyPost();

    const result = await callTool(s, TOOL, {
      ticket_id: ID,
      body: BODY,
      cc: [CC],
      confirm: true,
      send_id: sendId,
    });

    expect(output(result)).toEqual({
      sent: true,
      ticket_id: ID,
      conversation_id: 7001,
      api_calls_used: 1,
    });
    expect(sent()).toEqual([`POST ${REPLY}`]);
    expect(postBody()).toEqual({
      body: "Hello,<br>the refund was issued today.",
      cc_emails: [CC],
    });
  });

  it("returns no email address when Freshdesk's answer echoes several", async () => {
    const s = await session();
    const sendId = await mint(s, { cc: [CC] });
    replyPost();

    const result = await callTool(s, TOOL, {
      ticket_id: ID,
      body: BODY,
      cc: [CC],
      confirm: true,
      send_id: sendId,
    });

    expect(result.isError).toBeFalsy();
    expect(text(result)).not.toMatch(/@/);
  });

  it("a second confirm of the same send_id sends nothing more", async () => {
    const s = await session();
    const sendId = await mint(s);
    replyPost();
    const args = { ticket_id: ID, body: BODY, confirm: true, send_id: sendId };
    output(await callTool(s, TOOL, args));

    const error = failure(await callTool(s, TOOL, args));

    expect(error).toMatchObject({ code: "validation", http_status: null });
    expect(error.message).toMatch(/already used/);
    expect(sent()).toEqual([`POST ${REPLY}`]);
  });
});

describe("reply_to_ticket: a confirm that does not match sends nothing", () => {
  it("confirm: true with no send_id: validation, 0 dispatches", async () => {
    const s = await session();

    const error = failure(await callTool(s, TOOL, { ticket_id: ID, body: BODY, confirm: true }));

    expect(error).toMatchObject({ code: "validation", http_status: null });
    expect(sent()).toEqual([]);
  });

  it.each([
    ["another body", { body: `${BODY} And a little more.` }],
    ["another cc list", { cc: ["other@example.test"] }],
    ["a cc added", { cc: [CC, "other@example.test"] }],
    ["a cc removed", { cc: [] }],
    ["another ticket", { ticket_id: ID + 1 }],
  ])("a send_id minted for the first call, confirmed with %s: 0 dispatches", async (_, change) => {
    const s = await session();
    const sendId = await mint(s, { cc: [CC] });

    const result = await callTool(s, TOOL, {
      ticket_id: ID,
      body: BODY,
      cc: [CC],
      ...change,
      confirm: true,
      send_id: sendId,
    });

    expect(failure(result)).toMatchObject({ code: "validation", http_status: null });
    expect(sent()).toEqual([]);
  });

  it("confirm: false is refused by the input schema, 0 dispatches", async () => {
    const s = await session();
    const sendId = await mint(s);

    const result = await callTool(s, TOOL, {
      ticket_id: ID,
      body: BODY,
      confirm: false,
      send_id: sendId,
    });

    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/^Input validation error/);
    expect(sent()).toEqual([]);
  });
});

describe("reply_to_ticket: inputs it refuses, with nothing sent", () => {
  it.each([
    ["to", { to: ["someone@example.test"] }],
    ["bcc", { bcc: ["someone@example.test"] }],
    ["bcc_emails", { bcc_emails: ["someone@example.test"] }],
    ["from_email", { from_email: "someone@example.test" }],
  ])("refuses a %s input as a validation error, 0 dispatches", async (_, extra) => {
    for (const confirm of [{}, { confirm: true, send_id: "x" }]) {
      const s = await session();

      const result = await callTool(s, TOOL, { ticket_id: ID, body: BODY, ...extra, ...confirm });

      expect(result.isError).toBe(true);
      expect(text(result)).toMatch(/^Input validation error/);
    }
    expect(sent()).toEqual([]);
  });

  it("a cc off the allow-list is refused by the core at the first call, naming no address", async () => {
    const s = await session();

    const result = await callTool(s, TOOL, {
      ticket_id: ID,
      body: BODY,
      cc: ["outsider@elsewhere.test"],
    });

    expect(failure(result)).toMatchObject({ code: "validation", http_status: null });
    expect(text(result)).not.toContain("outsider");
    expect(sent()).toEqual([]);
  });

  it.each([
    ["an empty body", { ticket_id: ID, body: "" }],
    ["a whitespace-only body", { ticket_id: ID, body: " \n " }],
    [
      "a body with a zero-width character",
      { ticket_id: ID, body: `Hel${String.fromCodePoint(0x200b)}lo` },
    ],
    ["a ticket id of 0", { ticket_id: 0, body: BODY }],
  ])("refuses %s, 0 dispatches", async (_, args) => {
    const s = await session();

    const result = await callTool(s, TOOL, args);

    expect(result.isError).toBe(true);
    expect(sent()).toEqual([]);
  });
});

describe("reply_to_ticket: a failure after the send", () => {
  it("a 5xx is may_have_been_sent, not retryable, sent once, and says to check the conversation", async () => {
    const s = await session();
    const sendId = await mint(s);
    replyPost({ description: "oops" }, 500);

    const error = failure(
      await callTool(s, TOOL, { ticket_id: ID, body: BODY, confirm: true, send_id: sendId }),
    );

    expect(error).toMatchObject({
      code: "server",
      http_status: 500,
      retryable: false,
      may_have_been_sent: true,
    });
    expect(error.message).toMatch(/check the ticket's conversation before sending again/);
    expect(sent()).toEqual([`POST ${REPLY}`]);
  });

  it("a network error after the POST left is may_have_been_sent, sent once", async () => {
    const s = await session();
    const sendId = await mint(s);
    mock
      .get(ORIGIN)
      .intercept({ path: REPLY, method: "POST" })
      .replyWithError(new Error("socket hang up"));

    const error = failure(
      await callTool(s, TOOL, { ticket_id: ID, body: BODY, confirm: true, send_id: sendId }),
    );

    expect(error).toMatchObject({ code: "network", retryable: false, may_have_been_sent: true });
    expect(error.message).toMatch(/start over without confirm/);
    expect(sent()).toEqual([`POST ${REPLY}`]);
  });

  it("an answer of another shape (a 2xx with no id) is may_have_been_sent", async () => {
    const s = await session();
    const sendId = await mint(s);
    replyPost({ unexpected: true }, 201);

    const error = failure(
      await callTool(s, TOOL, { ticket_id: ID, body: BODY, confirm: true, send_id: sendId }),
    );

    expect(error).toMatchObject({ retryable: false, may_have_been_sent: true });
  });

  it("a 400 is Freshdesk's refusal: not may_have_been_sent, and the addresses in its errors replaced", async () => {
    const s = await session();
    const sendId = await mint(s, { cc: [CC] });
    replyPost(
      {
        description: "Validation failed",
        errors: [
          { field: "cc_emails", message: `${CC} is not a valid email`, code: "invalid_value" },
        ],
      },
      400,
    );

    const result = await callTool(s, TOOL, {
      ticket_id: ID,
      body: BODY,
      cc: [CC],
      confirm: true,
      send_id: sendId,
    });

    const error = failure(result);
    expect(error).toMatchObject({ code: "validation", http_status: 400, retryable: false });
    expect(error.may_have_been_sent).toBeUndefined();
    expect(error.message).toMatch(
      /This send_id is spent: to send again, start over without confirm/,
    );
    expect(error.errors?.[0]?.message).toContain("is not a valid email");
    expect(text(result)).not.toMatch(/@/);
  });

  // T-089 (RFC 2026-11-26-send-safety-core, OD-27 as amended 2026-11-26).
  it("a 408 is may_have_been_sent: a request timeout is no proof nothing was sent", async () => {
    const s = await session();
    const sendId = await mint(s);
    replyPost({ description: "Request Timeout" }, 408);

    const error = failure(
      await callTool(s, TOOL, { ticket_id: ID, body: BODY, confirm: true, send_id: sendId }),
    );

    expect(error).toMatchObject({
      http_status: 408,
      retryable: false,
      may_have_been_sent: true,
    });
    expect(error.message).toMatch(/check the ticket's conversation before sending again/);
    expect(error.message).toMatch(/This send_id is spent/);
    expect(sent()).toEqual([`POST ${REPLY}`]);
  });

  it("a 409 is Freshdesk's refusal: not may_have_been_sent, the send_id spent", async () => {
    const s = await session();
    const sendId = await mint(s);
    replyPost({ description: "Conflict" }, 409);

    const error = failure(
      await callTool(s, TOOL, { ticket_id: ID, body: BODY, confirm: true, send_id: sendId }),
    );

    expect(error).toMatchObject({ code: "validation", http_status: 409, retryable: false });
    expect(error.may_have_been_sent).toBeUndefined();
    expect(error.message).toMatch(/This send_id is spent/);
    expect(sent()).toEqual([`POST ${REPLY}`]);

    // Spent: a second confirm of the same send_id sends nothing.
    await callTool(s, TOOL, { ticket_id: ID, body: BODY, confirm: true, send_id: sendId });
    expect(sent()).toEqual([`POST ${REPLY}`]);
  });
});

describe("reply_to_ticket: sendFailed", () => {
  const network = {
    code: "network" as const,
    http_status: null,
    message: "Freshdesk did not answer.",
    retryable: true,
  };

  it("a network error with no attempt dispatched is passed on: nothing left the process", () => {
    const result = sendFailed(network, 0);
    expect(result.error).toEqual(network);
  });

  it("a network error after a dispatch is may_have_been_sent, not retryable", () => {
    const result = sendFailed(network, 1);
    expect(result.error).toMatchObject({
      code: "network",
      retryable: false,
      may_have_been_sent: true,
    });
  });

  it("a 429 after a dispatch (retries used up) is not retryable with this send_id: it is spent", () => {
    const limited = {
      code: "rate_limited" as const,
      http_status: 429,
      message: "Freshdesk's rate limit was reached.",
      retryable: true,
      retry_after_s: 30,
    };
    const result = sendFailed(limited, 2);
    expect(result.error).toMatchObject({ code: "rate_limited", retryable: false });
    expect(result.error.may_have_been_sent).toBeUndefined();
    expect(result.error.message).toMatch(/This send_id is spent/);
  });

  it("a 408 with no attempt dispatched is passed on; after a dispatch it is may_have_been_sent", () => {
    const timeout = {
      code: "validation" as const,
      http_status: 408,
      message: "Freshdesk refused the request (HTTP 408).",
      retryable: false,
    };
    expect(sendFailed(timeout, 0).error).toEqual(timeout);
    expect(sendFailed(timeout, 1).error).toMatchObject({
      http_status: 408,
      retryable: false,
      may_have_been_sent: true,
    });
  });

  it("replaces an address in the message of a failure", async () => {
    const entry: ReplyToTicketEntry = {
      send: async () => ({
        ok: false,
        error: { ...network, code: "server", message: "Bounced for customer@example.test." },
        attempts: 1,
      }),
    };
    const result = await replyToTicket(entry).handler(
      { ticket_id: ID, body: BODY, confirm: true, send_id: "x" },
      {} as never,
    );
    expect(JSON.stringify(result)).not.toMatch(/@/);
  });
});

describe("reply_to_ticket: registration", () => {
  it("is listed with send, destructive, open-world, not idempotent", async () => {
    const tools = await listTools(await session());
    expect(tools.find((item) => item.name === TOOL)?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    });
  });

  it.each([[["core"]], [["core", "write"]]])("is absent with toolsets %j", async (toolsets) => {
    const tools = await listTools(await session({ toolsets }));
    expect(tools.map((item) => item.name)).not.toContain(TOOL);
  });

  it("its description asks to check the ticket first, names the existing CCs and says never always allow", async () => {
    const tools = await listTools(await session());
    const description = tools.find((item) => item.name === TOOL)!.description;
    expect(
      description.startsWith("First check with the user that ticket_id is the ticket they mean"),
    ).toBe(true);
    expect(description).toContain(
      "Freshdesk may also copy the ticket's existing CC addresses, which this tool does not check.",
    );
    expect(description).toMatch(/Never choose 'always allow' for this tool/);
    expect(description).toMatch(/Freshdesk automations may act on the reply/);
    expect(description).toMatch(/Cost: 0 API calls without confirm/);
  });
});
