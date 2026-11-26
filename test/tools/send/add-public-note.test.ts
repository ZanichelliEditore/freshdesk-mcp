// T-088 (SPEC §8.2, §9; RFC 2026-11-26-send-safety-core, OD-20, OD-21,
// OD-24, OD-26, OD-27 as amended 2026-11-26 (T-089), OD-30, threat 1):
// `add_public_note`, on a server from the real registry with `send` enabled,
// through the core's `add_public_note` entry. MockAgent only: no send
// reaches a real account before T-087. Every id, name and address here is
// invented.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../../src/config.js";
import { createServer } from "../../../src/server.js";
import { createContext } from "../../../src/tools/context.js";
import {
  type AddPublicNoteEntry,
  addPublicNote,
} from "../../../src/tools/toolsets/send/add-public-note.js";
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
const TOOL = "add_public_note";
const ID = 4242;
const NOTES = `/api/v2/tickets/${ID}/notes`;
const BODY = "Hi,\nwe have shipped the replacement <today> & will follow up.";
const TEAM = { toolsets: ["core", "send"], forward_allow_list: ["@example.test"] };

const dir = mkdtempSync(join(tmpdir(), "freshdesk-mcp-public-note-"));
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

/** Freshdesk's note answer, echoing every address it can. */
const ANSWER = {
  id: 7003,
  user_id: 77,
  body: "<div>Hi,<br>we have shipped the replacement.</div>",
  body_text: "Hi, we have shipped the replacement.",
  ticket_id: ID,
  incoming: false,
  private: false,
  notified_to: ["customer@example.test"],
  support_email: "support@acme.example.test",
  to_emails: ["customer@example.test"],
  created_at: "2026-11-26T09:00:00Z",
};

function notePost(answer: unknown = ANSWER, status = 201) {
  mock
    .get(ORIGIN)
    .intercept({ path: NOTES, method: "POST" })
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

const FIRST = { ticket_id: ID, body: BODY };

/** The first call: no confirm. Returns its `send_id`. */
async function mint(s: Session, tool = TOOL, args: Record<string, unknown> = FIRST) {
  const value = output(await callTool(s, tool, args));
  expect(typeof value.send_id).toBe("string");
  return value.send_id as string;
}

/** Mints with FIRST, then confirms the same arguments; returns the confirm's result. */
async function mintThenConfirm(s: Session): Promise<CallResult> {
  const sendId = await mint(s);
  return callTool(s, TOOL, { ...FIRST, confirm: true, send_id: sendId });
}

describe("add_public_note: two calls", () => {
  it("without confirm sends nothing and returns the Not sent result, ticket id first, with a send_id", async () => {
    const s = await session();

    const value = output(await callTool(s, TOOL, FIRST));

    expect(sent()).toEqual([]);
    expect(Object.keys(value)[0]).toBe("ticket_id");
    expect(value).toMatchObject({
      ticket_id: ID,
      sent: false,
      body: BODY,
      recipients: { to: ["the ticket's requester"], cc: [] },
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

  it("with confirm: true and that send_id sends one POST to /notes whose body is exactly {body, private: false}", async () => {
    const s = await session();
    notePost();

    const result = await mintThenConfirm(s);

    expect(output(result)).toEqual({
      sent: true,
      ticket_id: ID,
      conversation_id: 7003,
      api_calls_used: 1,
    });
    expect(sent()).toEqual([`POST ${NOTES}`]);
    expect(postBody()).toEqual({
      body: "Hi,<br>we have shipped the replacement &lt;today&gt; &amp; will follow up.",
      private: false,
    });
  });

  it("returns no email address when Freshdesk's answer echoes several", async () => {
    const s = await session();
    notePost();

    const result = await mintThenConfirm(s);

    expect(result.isError).toBeFalsy();
    expect(text(result)).not.toMatch(/@/);
  });

  it("works with an empty allow-list: a public note takes no recipient", async () => {
    const s = await session({ toolsets: ["send"], forward_allow_list: [] });
    notePost();

    expect(output(await mintThenConfirm(s))).toMatchObject({ sent: true });
  });

  it("a second confirm of the same send_id sends nothing more", async () => {
    const s = await session();
    const sendId = await mint(s);
    notePost();
    const args = { ...FIRST, confirm: true, send_id: sendId };
    output(await callTool(s, TOOL, args));

    const error = failure(await callTool(s, TOOL, args));

    expect(error).toMatchObject({ code: "validation", http_status: null });
    expect(error.message).toMatch(/already used/);
    expect(sent()).toEqual([`POST ${NOTES}`]);
  });
});

describe("add_public_note: a confirm that does not match sends nothing", () => {
  it("confirm: true with no send_id: validation, 0 dispatches", async () => {
    const s = await session();

    const error = failure(await callTool(s, TOOL, { ...FIRST, confirm: true }));

    expect(error).toMatchObject({ code: "validation", http_status: null });
    expect(sent()).toEqual([]);
  });

  it.each([
    ["another body", { body: `${BODY} Thanks.` }],
    ["another ticket", { ticket_id: ID + 1 }],
  ])("a send_id minted for the first call, confirmed with %s: 0 dispatches", async (_, change) => {
    const s = await session();
    const sendId = await mint(s);

    const result = await callTool(s, TOOL, { ...FIRST, ...change, confirm: true, send_id: sendId });

    expect(failure(result)).toMatchObject({ code: "validation", http_status: null });
    expect(sent()).toEqual([]);
  });

  it("a send_id minted by reply_to_ticket for the same ticket and body: 0 dispatches", async () => {
    const s = await session();
    // A reply with no cc has the public note's recipients: only the tool differs.
    const sendId = await mint(s, "reply_to_ticket");

    const result = await callTool(s, TOOL, { ...FIRST, confirm: true, send_id: sendId });

    expect(failure(result)).toMatchObject({ code: "validation", http_status: null });
    expect(sent()).toEqual([]);
  });
});

describe("add_public_note: inputs it refuses, with nothing sent", () => {
  it.each([
    ["private", { private: false }],
    ["notify_emails", { notify_emails: ["someone@example.test"] }],
    ["user_id", { user_id: 77 }],
    ["incoming", { incoming: true }],
    ["cc", { cc: ["someone@example.test"] }],
    ["to", { to: ["someone@example.test"] }],
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
    ["an empty body", { ...FIRST, body: "" }],
    ["a ticket id of 0", { ...FIRST, ticket_id: 0 }],
  ])("refuses %s at the input, 0 dispatches", async (_, args) => {
    const s = await session();

    const result = await callTool(s, TOOL, args);

    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/^Input validation error/);
    expect(sent()).toEqual([]);
  });

  it.each([
    ["a whitespace-only body", { ...FIRST, body: " \n " }],
    ["a body with a zero-width character", { ...FIRST, body: `Hi${String.fromCodePoint(0x200b)}` }],
  ])("the core refuses %s as a body error, 0 dispatches", async (_, args) => {
    const s = await session();

    const error = failure(await callTool(s, TOOL, args));

    expect(error).toMatchObject({ code: "validation", http_status: null });
    expect(error.errors?.[0]?.field).toBe("body");
    expect(sent()).toEqual([]);
  });
});

describe("add_public_note: a failure after the send", () => {
  it("a 5xx is may_have_been_sent, not retryable, sent once, and says the public note may have been sent", async () => {
    const s = await session();
    notePost({ description: "oops" }, 500);

    const result = await mintThenConfirm(s);

    const error = failure(result);
    expect(error).toMatchObject({
      code: "server",
      http_status: 500,
      retryable: false,
      may_have_been_sent: true,
    });
    expect(error.message).toMatch(
      /The public note may have been sent \(may_have_been_sent\): check the ticket's conversation before sending again/,
    );
    expect(text(result)).not.toMatch(/@/);
    expect(sent()).toEqual([`POST ${NOTES}`]);
  });

  it("a network error after the POST left is may_have_been_sent, sent once, naming no address", async () => {
    const s = await session();
    mock
      .get(ORIGIN)
      .intercept({ path: NOTES, method: "POST" })
      .replyWithError(new Error("socket hang up for customer@example.test"));

    const result = await mintThenConfirm(s);

    const error = failure(result);
    expect(error).toMatchObject({ code: "network", retryable: false, may_have_been_sent: true });
    expect(error.message).toMatch(/start over without confirm/);
    expect(error.message).toMatch(/The public note may have been sent/);
    expect(text(result)).not.toMatch(/@/);
    expect(sent()).toEqual([`POST ${NOTES}`]);
  });

  it("an answer of another shape (a 2xx with no id) is may_have_been_sent", async () => {
    const s = await session();
    notePost({ unexpected: true }, 201);

    const error = failure(await mintThenConfirm(s));

    expect(error).toMatchObject({ retryable: false, may_have_been_sent: true });
  });

  // OD-27 as amended 2026-11-26 (T-089): the rule ./outcome.ts shares.
  it("a 408 is may_have_been_sent, and reads timed out, not refused", async () => {
    const s = await session();
    notePost({ description: "Request Timeout" }, 408);

    const error = failure(await mintThenConfirm(s));

    expect(error).toMatchObject({ http_status: 408, retryable: false, may_have_been_sent: true });
    expect(error.message).toMatch(
      /^Freshdesk timed out the request \(HTTP 408\)\. The public note may have been sent/,
    );
    expect(error.message).not.toMatch(/refused/);
    expect(error.message).toMatch(/This send_id is spent/);
    expect(sent()).toEqual([`POST ${NOTES}`]);
  });

  it("a 409 is Freshdesk's refusal: not may_have_been_sent, the send_id spent", async () => {
    const s = await session();
    const sendId = await mint(s);
    notePost({ description: "Conflict" }, 409);
    const args = { ...FIRST, confirm: true, send_id: sendId };

    const error = failure(await callTool(s, TOOL, args));

    expect(error).toMatchObject({ code: "validation", http_status: 409, retryable: false });
    expect(error.may_have_been_sent).toBeUndefined();
    expect(error.message).toMatch(/This send_id is spent/);

    const again = failure(await callTool(s, TOOL, args));
    expect(again.message).toMatch(/already used/);
    expect(sent()).toEqual([`POST ${NOTES}`]);
  });

  it("a 400 is Freshdesk's refusal, the addresses in its errors replaced", async () => {
    const s = await session();
    notePost(
      {
        description: "Validation failed",
        errors: [
          {
            field: "body",
            message: "customer@example.test cannot be notified",
            code: "invalid_value",
          },
        ],
      },
      400,
    );

    const result = await mintThenConfirm(s);

    const error = failure(result);
    expect(error).toMatchObject({ code: "validation", http_status: 400, retryable: false });
    expect(error.may_have_been_sent).toBeUndefined();
    expect(error.errors?.[0]?.message).toContain("cannot be notified");
    expect(text(result)).not.toMatch(/@/);
  });

  it("a 429 after a dispatch keeps no retry_after_s: the send_id is spent", async () => {
    const entry: AddPublicNoteEntry = {
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

    const result = await addPublicNote(entry).handler(
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

describe("add_public_note: registration", () => {
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

  it("its description asks to check the ticket first, says who sees it, the CCs and never always allow", async () => {
    const tools = await listTools(await session());
    const description = tools.find((item) => item.name === TOOL)!.description;
    expect(
      description.startsWith("First check with the user that ticket_id is the ticket they mean"),
    ).toBe(true);
    expect(description).toMatch(
      /the requester, usually a customer, can see it and may be emailed by Freshdesk/,
    );
    expect(description).toContain(
      "Freshdesk may also copy the ticket's existing CC addresses, which this tool does not check.",
    );
    expect(description).toMatch(/Never choose 'always allow' for this tool/);
    expect(description).toMatch(/Cost: 0 API calls without confirm/);
  });
});
