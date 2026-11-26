// T-085 (SPEC §8.2, §9, §3 C4; RFC 2026-11-26-send-safety-core, OD-20,
// OD-22, OD-27, OD-29, OD-30, threat 1): `forward_ticket`, on a server from
// the real registry with `send` enabled, through the core's `forward_ticket`
// entry. MockAgent only: no send reaches a real account before T-087. Every
// id, name and address here is invented.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../../src/config.js";
import { createServer } from "../../../src/server.js";
import { createContext } from "../../../src/tools/context.js";
import {
  type ForwardTicketEntry,
  forwardTicket,
} from "../../../src/tools/toolsets/send/forward-ticket.js";
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
const TOOL = "forward_ticket";
const ID = 4242;
const FORWARD = `/api/v2/tickets/${ID}/forward`;
const BODY = "Hi,\ncould you check the invoice on this one?";
const TO = "billing@example.test";
const CC = "lead@example.test";
const TEAM = { toolsets: ["core", "send"], forward_allow_list: ["@example.test"] };

const dir = mkdtempSync(join(tmpdir(), "freshdesk-mcp-forward-"));
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

/** Freshdesk's forward answer, echoing every address it can. */
const ANSWER = {
  id: 7002,
  user_id: 77,
  body: "<div>Hi,<br>could you check the invoice on this one?</div>",
  ticket_id: ID,
  from_email: "support@acme.example.test",
  to_emails: [TO],
  cc_emails: [CC],
  bcc_emails: ["hidden@example.test"],
  created_at: "2026-11-26T09:00:00Z",
};

function forwardPost(answer: unknown = ANSWER, status = 201) {
  mock
    .get(ORIGIN)
    .intercept({ path: FORWARD, method: "POST" })
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
  retry_after_s?: number;
  may_have_been_sent?: boolean;
  errors?: { field?: string; code?: string; message: string }[];
}

function failure(result: CallResult): SentError {
  expect(result.isError).toBe(true);
  return (JSON.parse(result.content[0]!.text) as { error: SentError }).error;
}

const FIRST = { ticket_id: ID, body: BODY, to: [TO], cc: [CC] };

/** The first call: no confirm. Returns its `send_id`. */
async function mint(s: Session, args: Record<string, unknown> = {}): Promise<string> {
  const value = output(await callTool(s, TOOL, { ...FIRST, ...args }));
  expect(typeof value.send_id).toBe("string");
  return value.send_id as string;
}

/** Mints with FIRST, then confirms the same arguments; returns the confirm's result. */
async function mintThenConfirm(s: Session): Promise<CallResult> {
  const sendId = await mint(s);
  return callTool(s, TOOL, { ...FIRST, confirm: true, send_id: sendId });
}

describe("forward_ticket: two calls", () => {
  it("without confirm sends nothing and returns the Not sent result, ticket id first, with a send_id", async () => {
    const s = await session();

    const value = output(await callTool(s, TOOL, FIRST));

    expect(sent()).toEqual([]);
    expect(Object.keys(value)[0]).toBe("ticket_id");
    expect(value).toMatchObject({
      ticket_id: ID,
      sent: false,
      body: BODY,
      recipients: { to: [TO], cc: [CC] },
      api_calls_used: 0,
    });
    const note = value.note as string;
    expect(note.startsWith(`Ticket ${ID}: check with the user that ticket ${ID}`)).toBe(true);
    expect(note).toContain("is the ticket they mean");
    expect(note).toContain("call again with `confirm: true` and this `send_id`");
    expect(note).not.toContain("requester");
    expect(note).not.toContain("existing CC addresses");
    expect(value.send_id).toEqual(expect.any(String));
    expect(value.expires_at).toEqual(expect.any(String));
  });

  it("with confirm: true and that send_id sends one POST to /forward with only the allow-listed to and cc", async () => {
    const s = await session();
    forwardPost();

    const result = await mintThenConfirm(s);

    expect(output(result)).toEqual({
      sent: true,
      ticket_id: ID,
      conversation_id: 7002,
      api_calls_used: 1,
    });
    expect(sent()).toEqual([`POST ${FORWARD}`]);
    expect(postBody()).toEqual({
      body: "Hi,<br>could you check the invoice on this one?",
      to_emails: [TO],
      cc_emails: [CC],
      include_original_attachments: false,
    });
  });

  it("returns no email address when Freshdesk's answer echoes several", async () => {
    const s = await session();
    forwardPost();

    const result = await mintThenConfirm(s);

    expect(result.isError).toBeFalsy();
    expect(text(result)).not.toMatch(/@/);
  });

  it("a second confirm of the same send_id sends nothing more", async () => {
    const s = await session();
    const sendId = await mint(s);
    forwardPost();
    const args = { ...FIRST, confirm: true, send_id: sendId };
    output(await callTool(s, TOOL, args));

    const error = failure(await callTool(s, TOOL, args));

    expect(error).toMatchObject({ code: "validation", http_status: null });
    expect(error.message).toMatch(/already used/);
    expect(sent()).toEqual([`POST ${FORWARD}`]);
  });
});

describe("forward_ticket: a confirm that does not match sends nothing", () => {
  it("confirm: true with no send_id: validation, 0 dispatches", async () => {
    const s = await session();

    const error = failure(await callTool(s, TOOL, { ...FIRST, confirm: true }));

    expect(error).toMatchObject({ code: "validation", http_status: null });
    expect(sent()).toEqual([]);
  });

  it.each([
    ["another body", { body: `${BODY} Thanks.` }],
    ["another to", { to: ["other@example.test"] }],
    ["a to added", { to: [TO, "other@example.test"] }],
    ["a cc removed", { cc: [] }],
    ["the cc as the to", { to: [CC], cc: [TO] }],
    ["another ticket", { ticket_id: ID + 1 }],
  ])("a send_id minted for the first call, confirmed with %s: 0 dispatches", async (_, change) => {
    const s = await session();
    const sendId = await mint(s);

    const result = await callTool(s, TOOL, {
      ...FIRST,
      ...change,
      confirm: true,
      send_id: sendId,
    });

    expect(failure(result)).toMatchObject({ code: "validation", http_status: null });
    expect(sent()).toEqual([]);
  });
});

describe("forward_ticket: inputs it refuses, with nothing sent", () => {
  it.each([
    ["bcc", { bcc: ["someone@example.test"] }],
    ["bcc_emails", { bcc_emails: ["someone@example.test"] }],
    ["to_emails", { to_emails: ["someone@example.test"] }],
    ["from_email", { from_email: "someone@example.test" }],
    ["include_original_attachments", { include_original_attachments: true }],
  ])("refuses a %s input as a validation error, 0 dispatches", async (_, extra) => {
    for (const confirm of [{}, { confirm: true, send_id: "x" }]) {
      const s = await session();

      const result = await callTool(s, TOOL, { ...FIRST, ...extra, ...confirm });

      expect(result.isError).toBe(true);
      expect(text(result)).toMatch(/^Input validation error/);
    }
    expect(sent()).toEqual([]);
  });

  it.each([
    ["a to", { to: ["outsider@elsewhere.test"] }],
    ["a cc", { cc: ["outsider@elsewhere.test"] }],
    ["a subdomain to", { to: ["outsider@sub.example.test"] }],
  ])("%s off the allow-list is refused at the first call, naming no address", async (_, change) => {
    const s = await session();

    const result = await callTool(s, TOOL, { ...FIRST, ...change });

    expect(failure(result)).toMatchObject({ code: "validation", http_status: null });
    expect(text(result)).not.toContain("outsider");
    expect(sent()).toEqual([]);
  });

  it("an empty allow-list refuses every forward, 0 dispatches", async () => {
    const s = await session({ toolsets: ["core", "send"], forward_allow_list: [] });

    const result = await callTool(s, TOOL, FIRST);

    expect(failure(result)).toMatchObject({ code: "validation", http_status: null });
    expect(text(result)).not.toMatch(/@/);
    expect(sent()).toEqual([]);
  });

  it("refuses a forward with no to address, 0 dispatches", async () => {
    const s = await session();

    const result = await callTool(s, TOOL, { ...FIRST, to: [] });

    expect(failure(result)).toMatchObject({ code: "validation", http_status: null });
    expect(sent()).toEqual([]);
  });

  const many = (n: number, tag: string) =>
    Array.from({ length: n }, (_, i) => `${tag}${i}@example.test`);

  it("refuses more than 10 recipients, to and cc together, 0 dispatches", async () => {
    const s = await session();

    const result = await callTool(s, TOOL, { ...FIRST, to: many(6, "t"), cc: many(5, "c") });

    expect(failure(result)).toMatchObject({ code: "validation", http_status: null });
    expect(sent()).toEqual([]);
  });

  it("sends to exactly 10 recipients, to and cc together", async () => {
    const s = await session();
    forwardPost();
    const recipients = { to: many(5, "t"), cc: many(5, "c") };
    const sendId = await mint(s, recipients);

    const result = await callTool(s, TOOL, {
      ...FIRST,
      ...recipients,
      confirm: true,
      send_id: sendId,
    });

    expect(output(result)).toMatchObject({ sent: true });
    expect(postBody()).toMatchObject({ to_emails: recipients.to, cc_emails: recipients.cc });
  });

  it.each([
    ["no to", { ticket_id: ID, body: BODY }],
    ["an empty body", { ...FIRST, body: "" }],
    ["a whitespace-only body", { ...FIRST, body: " \n " }],
    ["a body with a zero-width character", { ...FIRST, body: `Hi${String.fromCodePoint(0x200b)}` }],
    ["a ticket id of 0", { ...FIRST, ticket_id: 0 }],
  ])("refuses %s, 0 dispatches", async (_, args) => {
    const s = await session();

    const result = await callTool(s, TOOL, args);

    expect(result.isError).toBe(true);
    expect(sent()).toEqual([]);
  });
});

describe("forward_ticket: a failure after the send", () => {
  it("a 5xx is may_have_been_sent, not retryable, sent once, and says the forward may have been sent", async () => {
    const s = await session();
    forwardPost({ description: "oops" }, 500);

    const result = await mintThenConfirm(s);

    const error = failure(result);
    expect(error).toMatchObject({
      code: "server",
      http_status: 500,
      retryable: false,
      may_have_been_sent: true,
    });
    expect(error.message).toMatch(
      /The forward may have been sent \(may_have_been_sent\): check the ticket's conversation before sending again/,
    );
    expect(text(result)).not.toMatch(/@/);
    expect(sent()).toEqual([`POST ${FORWARD}`]);
  });

  it("a network error after the POST left is may_have_been_sent, sent once", async () => {
    const s = await session();
    mock
      .get(ORIGIN)
      .intercept({ path: FORWARD, method: "POST" })
      .replyWithError(new Error("socket hang up"));

    const error = failure(await mintThenConfirm(s));

    expect(error).toMatchObject({ code: "network", retryable: false, may_have_been_sent: true });
    expect(error.message).toMatch(/start over without confirm/);
    expect(sent()).toEqual([`POST ${FORWARD}`]);
  });

  it("an answer of another shape (a 2xx with no id) is may_have_been_sent", async () => {
    const s = await session();
    forwardPost({ unexpected: true }, 201);

    const error = failure(await mintThenConfirm(s));

    expect(error).toMatchObject({ retryable: false, may_have_been_sent: true });
  });

  // OD-27 as amended 2026-11-26 (T-089): the same rule as reply_to_ticket.
  it("a 408 is may_have_been_sent, and reads timed out, not refused", async () => {
    const s = await session();
    forwardPost({ description: "Request Timeout" }, 408);

    const error = failure(await mintThenConfirm(s));

    expect(error).toMatchObject({ http_status: 408, retryable: false, may_have_been_sent: true });
    expect(error.message).toMatch(
      /^Freshdesk timed out the request \(HTTP 408\)\. The forward may have been sent/,
    );
    expect(error.message).not.toMatch(/refused/);
    expect(error.message).toMatch(/This send_id is spent/);
    expect(sent()).toEqual([`POST ${FORWARD}`]);
  });

  it("a 409 is Freshdesk's refusal: not may_have_been_sent, the send_id spent", async () => {
    const s = await session();
    const sendId = await mint(s);
    forwardPost({ description: "Conflict" }, 409);
    const args = { ...FIRST, confirm: true, send_id: sendId };

    const error = failure(await callTool(s, TOOL, args));

    expect(error).toMatchObject({ code: "validation", http_status: 409, retryable: false });
    expect(error.may_have_been_sent).toBeUndefined();
    expect(error.message).toMatch(/This send_id is spent/);

    const again = failure(await callTool(s, TOOL, args));
    expect(again.message).toMatch(/already used/);
    expect(sent()).toEqual([`POST ${FORWARD}`]);
  });

  it("a 404 after the POST left is not may_have_been_sent, the send_id spent", async () => {
    const s = await session();
    forwardPost({ description: "Not found" }, 404);

    const error = failure(await mintThenConfirm(s));

    expect(error).toMatchObject({ http_status: 404, retryable: false });
    expect(error.may_have_been_sent).toBeUndefined();
    expect(error.message).toMatch(/This send_id is spent/);
    expect(sent()).toEqual([`POST ${FORWARD}`]);
  });

  it("a 400 is Freshdesk's refusal, the addresses in its errors replaced", async () => {
    const s = await session();
    forwardPost(
      {
        description: "Validation failed",
        errors: [
          { field: "to_emails", message: `${TO} is not a valid email`, code: "invalid_value" },
        ],
      },
      400,
    );

    const result = await mintThenConfirm(s);

    const error = failure(result);
    expect(error).toMatchObject({ code: "validation", http_status: 400, retryable: false });
    expect(error.may_have_been_sent).toBeUndefined();
    expect(error.errors?.[0]?.message).toContain("is not a valid email");
    expect(text(result)).not.toMatch(/@/);
  });

  it("a 429 after a dispatch keeps no retry_after_s: the send_id is spent", async () => {
    const entry: ForwardTicketEntry = {
      send: async () => ({
        ok: false,
        error: {
          code: "rate_limited",
          http_status: 429,
          message: "Freshdesk rate limit reached (HTTP 429).",
          retryable: true,
          retry_after_s: 30,
        },
        attempts: 2,
      }),
    };

    const result = await forwardTicket(entry).handler(
      { ...FIRST, confirm: true, send_id: "x" },
      {} as never,
    );

    expect(result.ok).toBe(false);
    const error = (result as { error: SentError }).error;
    expect(error).toMatchObject({ code: "rate_limited", retryable: false });
    expect(error).not.toHaveProperty("retry_after_s");
    expect(error.may_have_been_sent).toBeUndefined();
  });
});

describe("forward_ticket: registration", () => {
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

  it("its description asks to check the ticket first, says the content leaves Freshdesk and never always allow", async () => {
    const tools = await listTools(await session());
    const description = tools.find((item) => item.name === TOOL)!.description;
    expect(
      description.startsWith("First check with the user that ticket_id is the ticket they mean"),
    ).toBe(true);
    expect(description).toMatch(
      /the ticket's content, and possibly its conversation, leaves Freshdesk/,
    );
    expect(description).toMatch(/Never choose 'always allow' for this tool/);
    expect(description).toMatch(/there is no bcc/);
    expect(description).toMatch(/Cost: 0 API calls without confirm/);
  });
});
