// T-072 (SPEC §8.2, §3 C4; RFC 2026-11-25-write-safety-core, invariants 4 to
// 6): `add_note`, on a server from the real registry with `write` enabled,
// through the core's `add_note` entry. MockAgent only: no write reaches a
// real account before T-076. Every id, name and address here is invented.
//
// Owner, 2026-11-26: the tool returns only allow-listed fields of Freshdesk's
// note answer, and no email, the notified agents' or any other, ever appears
// in its output.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../../src/config.js";
import { createServer } from "../../../src/server.js";
import { createContext } from "../../../src/tools/context.js";
import { type AddNoteEntry, addNote } from "../../../src/tools/toolsets/write/add-note.js";
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
const TOOL = "add_note";
const ID = 4242;
const NOTES = `/api/v2/tickets/${ID}/notes`;
const BODY = "Can someone from billing check the refund on this one?";

const dir = mkdtempSync(join(tmpdir(), "freshdesk-mcp-add-note-"));
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

function email(id: number): string {
  return `agent${id}@example.test`;
}

function replyAgent(id: number, contact: Record<string, unknown> = {}, status = 200) {
  mock
    .get(ORIGIN)
    .intercept({ path: `/api/v2/agents/${id}`, method: "GET" })
    .reply(
      status,
      status === 200
        ? { id, contact: { active: true, email: email(id), name: `Agent ${id}`, ...contact } }
        : { description: "not found" },
      { headers: JSON_TYPE },
    );
}

/** Freshdesk's note answer: the note, plus whatever `extra` adds. */
function noteAnswer(extra: Record<string, unknown> = {}) {
  return {
    id: 9001,
    user_id: 77,
    body: `<div>${BODY}</div>`,
    body_text: BODY,
    incoming: false,
    private: true,
    ticket_id: ID,
    created_at: "2026-11-26T09:00:00Z",
    updated_at: "2026-11-26T09:00:00Z",
    ...extra,
  };
}

function replyNote(answer: unknown = noteAnswer(), status = 201) {
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
async function session(team: unknown = { toolsets: ["core", "write"] }): Promise<Session> {
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

/** The whole text the tool sent back. */
function text(result: CallResult): string {
  return result.content.map((item) => item.text).join("\n");
}

/** No address of any shape: nothing with an `@`. */
function expectNoEmail(result: CallResult): void {
  expect(text(result)).not.toMatch(/@/);
}

function output(result: CallResult): Record<string, unknown> {
  expect(result.isError).toBeFalsy();
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
}

interface SentError {
  code: string;
  http_status: number | null;
  message: string;
  errors?: { field?: string; code?: string; message: string }[];
}

function failure(result: CallResult): SentError {
  expect(result.isError).toBe(true);
  return (JSON.parse(result.content[0]!.text) as { error: SentError }).error;
}

describe("add_note: a private note", () => {
  it("sends one POST with private: true and the resolved emails, after one GET per agent", async () => {
    const s = await session();
    replyAgent(501);
    replyAgent(502);
    replyNote();

    const result = await callTool(s, TOOL, {
      ticket_id: ID,
      body: BODY,
      notify_agent_ids: [501, 502],
    });

    expect(output(result)).toEqual({
      ticket_id: ID,
      note_id: 9001,
      private: true,
      notified_agent_ids: [501, 502],
      api_calls_used: 3,
    });
    expect(sent()).toEqual(["GET /api/v2/agents/501", "GET /api/v2/agents/502", `POST ${NOTES}`]);
    expect(postBody()).toEqual({
      body: BODY,
      private: true,
      notify_emails: [email(501), email(502)],
    });
    expectNoEmail(result);
  });

  it("with no agents to notify, sends one POST, no GET and no notify_emails", async () => {
    const s = await session();
    replyNote();

    const result = await callTool(s, TOOL, { ticket_id: ID, body: BODY });

    expect(output(result)).toEqual({
      ticket_id: ID,
      note_id: 9001,
      private: true,
      notified_agent_ids: [],
      api_calls_used: 1,
    });
    expect(sent()).toEqual([`POST ${NOTES}`]);
    expect(postBody()).toEqual({ body: BODY, private: true });
  });

  it("an empty notify list is no agents: one POST, no GET", async () => {
    const s = await session();
    replyNote();

    const result = await callTool(s, TOOL, { ticket_id: ID, body: BODY, notify_agent_ids: [] });

    expect(output(result)).toMatchObject({ notified_agent_ids: [], api_calls_used: 1 });
    expect(sent()).toEqual([`POST ${NOTES}`]);
  });

  it("looks a repeated agent id up once and lists it once", async () => {
    const s = await session();
    replyAgent(501);
    replyNote();

    const result = await callTool(s, TOOL, {
      ticket_id: ID,
      body: BODY,
      notify_agent_ids: [501, 501],
    });

    expect(output(result)).toMatchObject({ notified_agent_ids: [501], api_calls_used: 2 });
    expect(sent()).toEqual(["GET /api/v2/agents/501", `POST ${NOTES}`]);
    expect(postBody()).toEqual({ body: BODY, private: true, notify_emails: [email(501)] });
  });
});

describe("add_note: a note Freshdesk answers as public", () => {
  it("is an error naming the note_id, saying the note is public and must be checked", async () => {
    const s = await session();
    replyAgent(501);
    replyNote(noteAnswer({ private: false }));

    const result = await callTool(s, TOOL, { ticket_id: ID, body: BODY, notify_agent_ids: [501] });

    const error = failure(result);
    expect(error.code).toBe("server");
    expect(error.message).toContain("note_id 9001");
    expect(error.message).toMatch(/public/);
    expect(error.message).toMatch(/check/);
    expect(sent()).toEqual(["GET /api/v2/agents/501", `POST ${NOTES}`]);
    expectNoEmail(result);
  });
});

describe("add_note: inputs it refuses, with nothing sent", () => {
  it.each([
    ["private: true", { private: true }],
    ["private: false", { private: false }],
    ["notify_emails", { notify_emails: ["someone@example.test"] }],
    ["user_id", { user_id: 77 }],
    ["incoming", { incoming: true }],
  ])("refuses a %s input as a validation error, 0 dispatches", async (_, extra) => {
    const s = await session();

    const result = await callTool(s, TOOL, { ticket_id: ID, body: BODY, ...extra });

    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/^Input validation error/);
    expect(sent()).toEqual([]);
    expectNoEmail(result);
  });

  it.each([
    ["an empty body", { ticket_id: ID, body: "" }],
    ["no body", { ticket_id: ID }],
    ["a ticket id of 0", { ticket_id: 0, body: BODY }],
    [
      "an agent id that is not a whole number",
      { ticket_id: ID, body: BODY, notify_agent_ids: [1.5] },
    ],
    ["an agent name for an id", { ticket_id: ID, body: BODY, notify_agent_ids: ["Agent 501"] }],
  ])("refuses %s, 0 dispatches", async (_, args) => {
    const s = await session();

    const result = await callTool(s, TOOL, args);

    expect(result.isError).toBe(true);
    expect(sent()).toEqual([]);
  });

  it("takes exactly 10 distinct agents, repeats not counted: 10 GETs, one POST", async () => {
    const s = await session();
    const ids = Array.from({ length: 10 }, (_, i) => 501 + i);
    for (const id of ids) replyAgent(id);
    replyNote();

    const result = await callTool(s, TOOL, {
      ticket_id: ID,
      body: BODY,
      notify_agent_ids: [...ids, 501, 510],
    });

    expect(output(result)).toMatchObject({ notified_agent_ids: ids, api_calls_used: 11 });
    expect(sent()).toHaveLength(11);
    expectNoEmail(result);
  });

  it("refuses more than 10 distinct agents before any request", async () => {
    const s = await session();

    const error = failure(
      await callTool(s, TOOL, {
        ticket_id: ID,
        body: BODY,
        notify_agent_ids: Array.from({ length: 11 }, (_, i) => 501 + i),
      }),
    );

    expect(error).toMatchObject({ code: "validation", http_status: null });
    expect(error.errors?.map((item) => item.code)).toEqual(["too_many"]);
    expect(sent()).toEqual([]);
  });
});

describe("add_note: an agent that does not resolve refuses the note", () => {
  it("an id with no agent (404): no POST, the error names the id, never an address", async () => {
    const s = await session();
    replyAgent(501);
    replyAgent(599, {}, 404);

    const result = await callTool(s, TOOL, {
      ticket_id: ID,
      body: BODY,
      notify_agent_ids: [501, 599],
    });

    const error = failure(result);
    expect(error).toMatchObject({ code: "validation", http_status: null });
    expect(error.errors?.[0]?.field).toBe("notify");
    expect(error.errors?.[0]?.message).toContain("599");
    expect(sent()).toEqual(["GET /api/v2/agents/501", "GET /api/v2/agents/599"]);
    expectNoEmail(result);
  });

  it("an inactive agent: no POST", async () => {
    const s = await session();
    replyAgent(501, { active: false });

    const result = await callTool(s, TOOL, { ticket_id: ID, body: BODY, notify_agent_ids: [501] });

    expect(failure(result).errors?.map((item) => item.code)).toEqual(["inactive"]);
    expect(sent()).toEqual(["GET /api/v2/agents/501"]);
    expectNoEmail(result);
  });
});

describe("add_note: no email ever reaches the output", () => {
  it("returns only the allow-listed fields when the answer echoes every address it can", async () => {
    const s = await session();
    replyAgent(501);
    replyNote(
      noteAnswer({
        notified_to: [email(501)],
        notify_emails: [email(501)],
        to_emails: ["customer@example.test"],
        cc_emails: ["cc@example.test"],
        bcc_emails: ["bcc@example.test"],
        support_email: "support@example.test",
        from_email: "from@example.test",
        body: "<div>Write to agent501@example.test</div>",
        body_text: "Write to agent501@example.test",
      }),
    );

    const result = await callTool(s, TOOL, { ticket_id: ID, body: BODY, notify_agent_ids: [501] });

    expect(Object.keys(output(result)).sort()).toEqual([
      "api_calls_used",
      "note_id",
      "notified_agent_ids",
      "private",
      "ticket_id",
    ]);
    expectNoEmail(result);
  });

  it("strips addresses from Freshdesk's field errors when the POST is refused", async () => {
    const s = await session();
    replyAgent(501);
    replyNote(
      {
        description: "Validation failed",
        errors: [
          {
            field: "notify_emails",
            message: `There is no agent with the email ${email(501)}`,
            code: "invalid_value",
          },
          { field: "someone@example.test", message: "odd field", code: "x@y.z" },
        ],
      },
      400,
    );

    const result = await callTool(s, TOOL, { ticket_id: ID, body: BODY, notify_agent_ids: [501] });

    const error = failure(result);
    expect(error).toMatchObject({ code: "validation", http_status: 400 });
    expect(error.errors).toHaveLength(2);
    expect(error.errors?.[0]?.message).toContain("There is no agent with the email");
    expectNoEmail(result);
  });

  it("a ticket that does not exist gives not_found, after the lookups, with no address", async () => {
    const s = await session();
    replyAgent(501);
    replyNote({ description: "not found" }, 404);

    const result = await callTool(s, TOOL, { ticket_id: ID, body: BODY, notify_agent_ids: [501] });

    expect(failure(result)).toMatchObject({ code: "not_found", http_status: 404 });
    expect(sent()).toEqual(["GET /api/v2/agents/501", `POST ${NOTES}`]);
    expectNoEmail(result);
  });
});

describe("add_note: registration", () => {
  it("is listed with write, not destructive, and its description says private and list_agents", async () => {
    const tools = await listTools(await session({ toolsets: ["core", "write"] }));
    const tool = tools.find((item) => item.name === TOOL);
    expect(tool).toBeDefined();
    expect(tool?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    });
    expect(tool?.description).toMatch(/private/i);
    expect(tool?.description).toContain("list_agents");
    expect(tool?.description).toMatch(/never reaches the requester/);
  });

  it("is absent without write in the team file", async () => {
    const tools = await listTools(await session({ toolsets: ["core"] }));
    expect(tools.map((item) => item.name)).not.toContain(TOOL);
  });
});

describe("add_note: an address in any error text is replaced", () => {
  /** The tool on a fake entry that refuses with `message` and one field error. */
  async function refusedWith(text: string) {
    const entry: AddNoteEntry = {
      note: async () => ({
        ok: false,
        error: {
          code: "validation",
          http_status: 400,
          message: `Refused for ${text} today`,
          retryable: false,
          errors: [{ field: text, code: text, message: `bad ${text}, really` }],
        },
        attempts: 1,
      }),
    };
    const tool = addNote(entry);
    return tool.handler({ ticket_id: ID, body: BODY }, {} as never);
  }

  it.each([
    ["plain", "agent501@example.test"],
    ["fullwidth", "agent501\uFF20example.test"],
    ["decimal entity", "agent501&#64;example.test"],
    ["padded decimal entity", "agent501&#064example.test"],
    ["hex entity", "agent501&#x40;example.test"],
    ["named entity", "agent501&commat;example.test"],
    ["lone at sign", "@"],
  ])(
    "replaces a %s address in the message, the field, the code and the field message",
    async (_, address) => {
      const result = await refusedWith(address);

      expect(result.ok).toBe(false);
      const json = JSON.stringify(result);
      expect(json).not.toContain("example.test");
      expect(json).not.toMatch(/@|\uFF20|&#|&commat;/i);
      if (!result.ok) {
        expect(result.error.message).toBe("Refused for [address] today");
        expect(result.error.errors).toEqual([
          { field: "[address]", code: "[address]", message: "bad [address] really" },
        ]);
      }
    },
  );
});
