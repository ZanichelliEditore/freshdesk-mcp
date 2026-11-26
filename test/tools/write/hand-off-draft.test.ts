// T-074 (SPEC §8.2, §3 C6; RFC 2026-11-25-write-safety-core, invariants 4 to
// 6, OD-2): `hand_off_draft`, on a server from the real registry with `write`
// enabled, through the core's `hand_off_draft` entry (its note, then its
// assignment). MockAgent only: no write reaches a real account before T-076.
// Every id, name and address here is invented.
//
// Owner, 2026-11-26: the note first, then the assignment PUT; a PUT that
// fails after the note is reported with the note's id and not retried; with
// nothing to assign, the note only and no PUT; only allow-listed fields in
// the output, never an email; a note Freshdesk answers `private: false` is an
// error naming the note_id and saying it is public and must be checked.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../../src/config.js";
import { createServer } from "../../../src/server.js";
import { createContext } from "../../../src/tools/context.js";
import { DRAFT_HEADER, handOffDraft } from "../../../src/tools/toolsets/write/hand-off-draft.js";
import { agentPages, groupPages } from "../../fixtures/agents-groups.js";
import { rawTicket, schemaFieldsPayload } from "../../fixtures/schema.js";
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
const TOOL = "hand_off_draft";
const ID = rawTicket.id;
const NOTE_ID = 9001;

const FIELDS = "/api/v2/ticket_fields";
const AGENTS = "/api/v2/agents?per_page=100";
const GROUPS = "/api/v2/groups?per_page=100";
const TICKET = `/api/v2/tickets/${ID}`;
const NOTES = `${TICKET}/notes`;
/** The fixture's agent field. */
const AGENT_FIELD = schemaFieldsPayload.find((field) => field.name === "agent");
const DRAFT = "Hello, the refund was issued today; it reaches your card within 5 days.";

const dir = mkdtempSync(join(tmpdir(), "freshdesk-mcp-hand-off-draft-"));
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

function reply(path: string, body: unknown, method = "GET", status = 200) {
  mock
    .get(ORIGIN)
    .intercept({ path, method })
    .reply(status, body as object, { headers: JSON_TYPE });
}

function email(id: number): string {
  return `agent${id}@example.test`;
}

function replyAgent(id: number, status = 200) {
  reply(
    `/api/v2/agents/${id}`,
    status === 200
      ? { id, contact: { active: true, email: email(id), name: `Agent ${id}` } }
      : { description: "not found" },
    "GET",
    status,
  );
}

/** Freshdesk's note answer: the note, plus whatever `extra` adds. */
function noteAnswer(extra: Record<string, unknown> = {}) {
  return {
    id: NOTE_ID,
    user_id: 77,
    body: `<div>${DRAFT}</div>`,
    body_text: DRAFT,
    incoming: false,
    private: true,
    ticket_id: ID,
    created_at: "2026-11-26T09:00:00Z",
    updated_at: "2026-11-26T09:00:00Z",
    ...extra,
  };
}

function replyNote(answer: unknown = noteAnswer(), status = 201) {
  reply(NOTES, answer, "POST", status);
}

function replyPut(answer: unknown = rawTicket, status = 200) {
  reply(TICKET, answer, "PUT", status);
}

/** Every request MockAgent saw, as `METHOD path`. */
function sent(): string[] {
  return (mock.getCallHistory()?.calls() ?? []).map((call) => `${call.method} ${call.path}`);
}

/** The body of the one request sent with `method`. */
function bodyOf(method: "POST" | "PUT"): Record<string, unknown> {
  const calls = (mock.getCallHistory()?.calls() ?? []).filter((call) => call.method === method);
  expect(calls).toHaveLength(1);
  return JSON.parse(calls[0]!.body as string) as Record<string, unknown>;
}

/** A session on a server from the real registry, built as cli.ts builds it; its schema not loaded. */
async function cold(team: unknown = { toolsets: ["core", "write"] }): Promise<Session> {
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

/** A session whose schema is cached, MockAgent's history cleared: what follows is the tool's alone. */
async function warm(): Promise<Session> {
  const session = await cold();
  reply(FIELDS, schemaFieldsPayload);
  reply(AGENTS, agentPages.flat());
  reply(GROUPS, groupPages.flat());
  expect((await callTool(session, "get_ticket_schema", {})).isError).toBeFalsy();
  mock.clearCallHistory();
  return session;
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
  retryable?: boolean;
  message: string;
  errors?: { field?: string; code?: string; message: string }[];
}

function failure(result: CallResult): SentError {
  expect(result.isError).toBe(true);
  return (JSON.parse(result.content[0]!.text) as { error: SentError }).error;
}

describe("hand_off_draft: the note, then the assignment", () => {
  it("sends one private POST headed DRAFT REPLY with the notify emails, then one PUT of group and agent", async () => {
    const s = await warm();
    replyAgent(502);
    replyNote();
    replyPut();

    const result = await callTool(s, TOOL, {
      ticket_id: ID,
      draft: DRAFT,
      fields: { Agent: "Juniper Vantablack", Group: "Widget Desk" },
      notify_agent_ids: [502],
    });

    expect(output(result)).toEqual({
      ticket_id: ID,
      note_id: NOTE_ID,
      private: true,
      notified_agent_ids: [502],
      assigned: true,
      api_calls_used: 3,
    });
    expect(sent()).toEqual(["GET /api/v2/agents/502", `POST ${NOTES}`, `PUT ${TICKET}`]);
    const note = bodyOf("POST");
    expect(note).toEqual({
      body: `${DRAFT_HEADER}${DRAFT}`,
      private: true,
      notify_emails: [email(502)],
    });
    expect(DRAFT_HEADER.startsWith("DRAFT REPLY")).toBe(true);
    expect(bodyOf("PUT")).toEqual({ responder_id: 502, group_id: 702 });
    expectNoEmail(result);
  });

  it("assigns a group alone, by id", async () => {
    const s = await warm();
    replyNote();
    replyPut();

    const result = await callTool(s, TOOL, { ticket_id: ID, draft: DRAFT, fields: { group: 703 } });

    expect(output(result)).toMatchObject({ assigned: true, api_calls_used: 2 });
    expect(sent()).toEqual([`POST ${NOTES}`, `PUT ${TICKET}`]);
    expect(bodyOf("PUT")).toEqual({ group_id: 703 });
  });

  it("looks a repeated agent id up once and lists it once", async () => {
    const s = await warm();
    replyAgent(502);
    replyNote();
    replyPut();

    const result = await callTool(s, TOOL, {
      ticket_id: ID,
      draft: DRAFT,
      fields: { agent: 502 },
      notify_agent_ids: [502, 502],
    });

    expect(output(result)).toMatchObject({ notified_agent_ids: [502], api_calls_used: 3 });
    expect(sent()).toEqual(["GET /api/v2/agents/502", `POST ${NOTES}`, `PUT ${TICKET}`]);
  });

  it("hands over to a group with the agent cleared: null clears the agent in the same PUT", async () => {
    const s = await warm();
    replyNote();
    replyPut();

    const result = await callTool(s, TOOL, {
      ticket_id: ID,
      draft: DRAFT,
      fields: { group: "Widget Desk", agent: null },
    });

    expect(output(result)).toMatchObject({ assigned: true });
    expect(bodyOf("PUT")).toEqual({ group_id: 702, responder_id: null });
  });

  it("counts a cold schema load in api_calls_used", async () => {
    const s = await cold();
    reply(FIELDS, schemaFieldsPayload);
    reply(AGENTS, agentPages.flat());
    reply(GROUPS, groupPages.flat());
    replyNote();
    replyPut();

    const result = await callTool(s, TOOL, { ticket_id: ID, draft: DRAFT, fields: { agent: 501 } });

    expect(output(result)).toMatchObject({ assigned: true, api_calls_used: 5 });
    expect(sent().slice(-2)).toEqual([`POST ${NOTES}`, `PUT ${TICKET}`]);
  });
});

describe("hand_off_draft: nothing to assign", () => {
  it.each([
    ["no fields", {}],
    ["empty fields", { fields: {} }],
  ])("with %s, posts the note only: no schema load, no PUT", async (_, extra) => {
    const s = await cold();
    replyNote();

    const result = await callTool(s, TOOL, { ticket_id: ID, draft: DRAFT, ...extra });

    expect(output(result)).toEqual({
      ticket_id: ID,
      note_id: NOTE_ID,
      private: true,
      notified_agent_ids: [],
      assigned: false,
      api_calls_used: 1,
    });
    expect(sent()).toEqual([`POST ${NOTES}`]);
    expect(bodyOf("POST")).toEqual({ body: `${DRAFT_HEADER}${DRAFT}`, private: true });
  });
});

describe("hand_off_draft: a refused note sends no PUT", () => {
  it("a ticket that does not exist: the POST's not_found, no PUT", async () => {
    const s = await warm();
    replyNote({ description: "not found" }, 404);

    const result = await callTool(s, TOOL, { ticket_id: ID, draft: DRAFT, fields: { agent: 501 } });

    expect(failure(result)).toMatchObject({ code: "not_found", http_status: 404 });
    expect(sent()).toEqual([`POST ${NOTES}`]);
  });

  it("a note POST answered 5xx: no PUT, the error says the note may have been written", async () => {
    const s = await warm();
    replyNote({ description: "oops" }, 500);

    const result = await callTool(s, TOOL, { ticket_id: ID, draft: DRAFT, fields: { agent: 501 } });

    const error = failure(result);
    expect(error).toMatchObject({ code: "server", http_status: 500, retryable: false });
    expect(error.message).toMatch(/note may have been written/);
    expect(sent()).toEqual([`POST ${NOTES}`]);
  });

  it("an agent to notify that does not resolve: no POST, no PUT", async () => {
    const s = await warm();
    replyAgent(599, 404);

    const result = await callTool(s, TOOL, {
      ticket_id: ID,
      draft: DRAFT,
      fields: { agent: 501 },
      notify_agent_ids: [599],
    });

    const error = failure(result);
    expect(error).toMatchObject({ code: "validation", http_status: null });
    expect(error.errors?.[0]?.field).toBe("notify");
    expect(sent()).toEqual(["GET /api/v2/agents/599"]);
    expectNoEmail(result);
  });

  it("a note answered private: false is an error naming the note_id, saying it is public; no PUT", async () => {
    const s = await warm();
    replyNote(noteAnswer({ private: false }));

    const result = await callTool(s, TOOL, { ticket_id: ID, draft: DRAFT, fields: { agent: 501 } });

    const error = failure(result);
    expect(error.code).toBe("server");
    expect(error.message).toContain(`note_id ${NOTE_ID}`);
    expect(error.message).toMatch(/public/);
    expect(error.message).toMatch(/check/);
    expect(error.message).toMatch(/not assigned|no assignment|assignment was not sent/i);
    expect(sent()).toEqual([`POST ${NOTES}`]);
  });

  it("with nothing to assign, a note answered private: false is still an error naming the note_id", async () => {
    const s = await cold();
    replyNote(noteAnswer({ private: false }));

    const error = failure(await callTool(s, TOOL, { ticket_id: ID, draft: DRAFT }));

    expect(error.message).toContain(`note_id ${NOTE_ID}`);
    expect(error.message).toMatch(/public/);
  });
});

describe("hand_off_draft: a PUT that fails after the note", () => {
  it("a 5xx: one PUT, no retry, the error names the written note and the failed assignment", async () => {
    const s = await warm();
    replyNote();
    replyPut({ description: "oops" }, 500);

    const result = await callTool(s, TOOL, {
      ticket_id: ID,
      draft: DRAFT,
      fields: { agent: "Juniper Vantablack" },
    });

    const error = failure(result);
    expect(error).toMatchObject({ code: "server", http_status: 500, retryable: false });
    expect(error.message).toContain(`note_id ${NOTE_ID}`);
    expect(error.message).toMatch(/may or may not have been applied/);
    expect(error.message).toContain("update_ticket");
    expect(error.message).toMatch(/Do not call hand_off_draft again/);
    expect(error.message).toMatch(/did not retry/);
    expect(sent()).toEqual([`POST ${NOTES}`, `PUT ${TICKET}`]);
  });

  it("a PUT refused rate_limited: not retryable, the assignment not applied, never 'safe to try again'", async () => {
    // The tool on fake entries: the client's 10 s rule, as the core passes it back.
    const tool = handOffDraft({
      note: async () => ({ ok: true, value: noteAnswer(), attempts: 1 }),
      assign: async () => ({
        ok: false,
        error: {
          code: "rate_limited",
          http_status: null,
          message: "Not sent: too little time. Nothing was applied: it is safe to try again.",
          retryable: true,
          retry_after_s: 5,
        },
        attempts: 0,
      }),
    });
    const context = {
      schema: { get: async () => ({ ok: true, schema: { fields: [AGENT_FIELD] }, attempts: 0 }) },
    };

    const result = await tool.handler(
      { ticket_id: ID, draft: DRAFT, fields: { agent: 501 } },
      context as never,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({ code: "rate_limited", retryable: false });
    expect(result.error.retry_after_s).toBeUndefined();
    expect(result.error.message).toContain(`note_id ${NOTE_ID}`);
    expect(result.error.message).toMatch(/assignment was not applied/);
    expect(result.error.message).not.toMatch(/safe to try again/);
  });

  it("a value the core refuses: the note stays, no PUT sent, the error names the note_id", async () => {
    const s = await warm();
    replyNote();

    const result = await callTool(s, TOOL, {
      ticket_id: ID,
      draft: DRAFT,
      fields: { agent: "Nobody Atall" },
    });

    const error = failure(result);
    expect(error).toMatchObject({ code: "validation", http_status: null, retryable: false });
    expect(error.message).toContain(`note_id ${NOTE_ID}`);
    expect(error.message).toMatch(/assignment was not applied/);
    expect(error.errors?.[0]?.field).toBe("agent");
    expect(sent()).toEqual([`POST ${NOTES}`]);
  });

  it("strips addresses from Freshdesk's field errors on the PUT", async () => {
    const s = await warm();
    replyNote();
    replyPut(
      {
        description: "Validation failed",
        errors: [
          { field: "responder_id", message: `No agent ${email(501)} here`, code: "invalid_value" },
        ],
      },
      400,
    );

    const result = await callTool(s, TOOL, { ticket_id: ID, draft: DRAFT, fields: { agent: 501 } });

    const error = failure(result);
    expect(error).toMatchObject({ code: "validation", http_status: 400 });
    expect(error.message).toContain(`note_id ${NOTE_ID}`);
    expect(error.errors?.[0]?.message).toContain("No agent");
    expectNoEmail(result);
  });
});

describe("hand_off_draft: fields outside group and agent", () => {
  it.each([
    ["status", { Status: "Pending" }],
    ["priority", { priority: 4 }],
    ["a custom field", { Hobby: "Kite flying" }],
    ["requester", { requester: 9002 }],
    ["the type", { Type: "Question" }],
    ["agent beside status", { agent: 501, status: 3 }],
  ])("refuses %s as field_not_writable, with nothing sent", async (_, fields) => {
    const s = await warm();

    const error = failure(await callTool(s, TOOL, { ticket_id: ID, draft: DRAFT, fields }));

    expect(error).toMatchObject({ code: "validation", http_status: null });
    expect(error.errors?.map((item) => item.code)).toContain("field_not_writable");
    expect(sent()).toEqual([]);
  });

  it("refuses a field no ticket field is named or labelled, with nothing sent", async () => {
    const s = await warm();

    const error = failure(
      await callTool(s, TOOL, { ticket_id: ID, draft: DRAFT, fields: { Assignee: 501 } }),
    );

    expect(error.errors?.map((item) => item.code)).toEqual(["unknown_field"]);
    expect(sent()).toEqual([]);
  });

  it("refuses one field named twice (API name and label), with nothing sent", async () => {
    const s = await warm();

    const error = failure(
      await callTool(s, TOOL, { ticket_id: ID, draft: DRAFT, fields: { agent: 501, Agent: 502 } }),
    );

    expect(error.errors?.map((item) => item.code)).toEqual(["duplicate_field"]);
    expect(sent()).toEqual([]);
  });

  it("refuses a key that names several fields, with nothing sent", async () => {
    const s = await cold();
    reply(FIELDS, [
      ...schemaFieldsPayload,
      { id: 1099, name: "cf_agent", label: "Agent", type: "custom_text", default: false },
    ]);
    reply(AGENTS, agentPages.flat());
    reply(GROUPS, groupPages.flat());

    const error = failure(
      await callTool(s, TOOL, { ticket_id: ID, draft: DRAFT, fields: { Agent: 501 } }),
    );

    expect(error.errors?.map((item) => item.code)).toEqual(["ambiguous_field"]);
    expect(sent().filter((line) => !line.startsWith("GET "))).toEqual([]);
  });

  it("lists at most 10 field problems and says how many more there are", async () => {
    const s = await warm();
    const fields = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`nope${i}`, 1]));

    const error = failure(await callTool(s, TOOL, { ticket_id: ID, draft: DRAFT, fields }));

    expect(error.errors).toHaveLength(10);
    expect(error.message).toContain("2 more problems are not listed");
    expect(sent()).toEqual([]);
  });

  it("a schema that cannot load refuses the call, with no note", async () => {
    const s = await cold();
    reply(FIELDS, { description: "no" }, "GET", 401);

    const result = await callTool(s, TOOL, { ticket_id: ID, draft: DRAFT, fields: { agent: 501 } });

    expect(result.isError).toBe(true);
    expect(sent().filter((line) => !line.startsWith("GET "))).toEqual([]);
  });
});

describe("hand_off_draft: inputs it refuses, with nothing sent", () => {
  it.each([
    ["private: false", { private: false }],
    ["notify_emails", { notify_emails: ["someone@example.test"] }],
    ["user_id", { user_id: 77 }],
    ["body", { body: "<p>raw</p>" }],
  ])("refuses a %s input as a validation error, 0 dispatches", async (_, extra) => {
    const s = await cold();

    const result = await callTool(s, TOOL, { ticket_id: ID, draft: DRAFT, ...extra });

    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/^Input validation error/);
    expect(sent()).toEqual([]);
  });

  it.each([
    ["an empty draft", { ticket_id: ID, draft: "" }],
    ["no draft", { ticket_id: ID }],
    ["a ticket id of 0", { ticket_id: 0, draft: DRAFT }],
  ])("refuses %s, 0 dispatches", async (_, args) => {
    const s = await cold();

    const result = await callTool(s, TOOL, args);

    expect(result.isError).toBe(true);
    expect(sent()).toEqual([]);
  });
});

describe("hand_off_draft: no email ever reaches the output", () => {
  it("returns only the allow-listed fields when the note answer echoes every address it can", async () => {
    const s = await warm();
    replyAgent(502);
    replyNote(
      noteAnswer({
        notified_to: [email(502)],
        notify_emails: [email(502)],
        to_emails: ["customer@example.test"],
        cc_emails: ["cc@example.test"],
        support_email: "support@example.test",
        body_text: "Write to agent502@example.test",
      }),
    );
    replyPut({ ...rawTicket, email: "requester@example.test" });

    const result = await callTool(s, TOOL, {
      ticket_id: ID,
      draft: DRAFT,
      fields: { agent: 502 },
      notify_agent_ids: [502],
    });

    expect(Object.keys(output(result)).sort()).toEqual([
      "api_calls_used",
      "assigned",
      "note_id",
      "notified_agent_ids",
      "private",
      "ticket_id",
    ]);
    expectNoEmail(result);
  });

  it("strips addresses from Freshdesk's field errors when the note is refused", async () => {
    const s = await warm();
    replyAgent(502);
    replyNote(
      {
        description: "Validation failed",
        errors: [{ field: "notify_emails", message: `No ${email(502)}`, code: "invalid_value" }],
      },
      400,
    );

    const result = await callTool(s, TOOL, {
      ticket_id: ID,
      draft: DRAFT,
      fields: { agent: 502 },
      notify_agent_ids: [502],
    });

    expect(failure(result)).toMatchObject({ code: "validation", http_status: 400 });
    expect(sent()).toEqual(["GET /api/v2/agents/502", `POST ${NOTES}`]);
    expectNoEmail(result);
  });
});

describe("hand_off_draft: registration", () => {
  it("is listed with write, its description says DRAFT REPLY, private and list_agents", async () => {
    const tools = await listTools(await cold({ toolsets: ["core", "write"] }));
    const tool = tools.find((item) => item.name === TOOL);
    expect(tool).toBeDefined();
    expect(tool?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    });
    expect(tool?.description).toContain("DRAFT REPLY");
    expect(tool?.description).toMatch(/private/i);
    expect(tool?.description).toContain("list_agents");
    expect(tool?.description).toMatch(/never reaches the requester/);
  });

  it("is absent without write in the team file", async () => {
    const tools = await listTools(await cold({ toolsets: ["core"] }));
    expect(tools.map((item) => item.name)).not.toContain(TOOL);
  });
});
