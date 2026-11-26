// T-071 (SPEC §8.2; RFC 2026-11-25-write-safety-core, OD-2 and the owner's
// decision 6): `update_ticket`, on a server from the real registry with
// `write` enabled, through the core's `update_ticket` entry. MockAgent only:
// no write reaches a real account before T-076. Every name, label, tag and
// choice here is invented.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../../src/config.js";
import { createServer } from "../../../src/server.js";
import { createContext } from "../../../src/tools/context.js";
import { MAX_TAGS } from "../../../src/tools/toolsets/write/update-ticket.js";
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
const TOOL = "update_ticket";
const ID = rawTicket.id;

const FIELDS = "/api/v2/ticket_fields";
const AGENTS = "/api/v2/agents?per_page=100";
const GROUPS = "/api/v2/groups?per_page=100";
const TICKET = `/api/v2/tickets/${ID}`;

/** The fixture's fields, with a status that has every state a desk uses. */
const fieldsPayload = schemaFieldsPayload.map((field) =>
  field.name === "status"
    ? {
        ...field,
        choices: {
          "2": ["Open", "Being processed"],
          "3": ["Pending", "Awaiting your reply"],
          "4": ["Resolved", "This ticket is resolved"],
          "5": ["Closed", "This ticket is closed"],
        },
      }
    : field,
);

const dir = mkdtempSync(join(tmpdir(), "freshdesk-mcp-update-ticket-"));
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
  return mock
    .get(ORIGIN)
    .intercept({ path, method })
    .reply(status, body as object, { headers: JSON_TYPE });
}

/** Every request MockAgent saw, as `METHOD path`. */
function sent(): string[] {
  return (mock.getCallHistory()?.calls() ?? []).map((call) => `${call.method} ${call.path}`);
}

/** The body of the one PUT sent. */
function putBody(): unknown {
  const puts = (mock.getCallHistory()?.calls() ?? []).filter((call) => call.method === "PUT");
  expect(puts).toHaveLength(1);
  return JSON.parse(puts[0]!.body as string);
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

function queueSchema() {
  reply(FIELDS, fieldsPayload);
  reply(AGENTS, agentPages.flat());
  reply(GROUPS, groupPages.flat());
}

/** A session whose schema is cached, MockAgent's history cleared: what follows is the tool's alone. */
async function warm(): Promise<Session> {
  const session = await cold();
  queueSchema();
  expect((await callTool(session, "get_ticket_schema", {})).isError).toBeFalsy();
  mock.clearCallHistory();
  return session;
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

describe("update_ticket: a change of fields", () => {
  it("sends one PUT with ids for a status, an agent and a custom field given by label", async () => {
    const session = await warm();
    reply(TICKET, { ...rawTicket, status: 3, responder_id: 502 }, "PUT");

    const result = await callTool(session, TOOL, {
      ticket_id: ID,
      fields: { Status: "Pending", Agent: "Juniper Vantablack", Hobby: "Kite flying" },
    });

    expect(output(result)).toEqual({ ticket_id: ID, changed: true, api_calls_used: 1 });
    expect(sent()).toEqual([`PUT ${TICKET}`]);
    expect(putBody()).toEqual({
      status: 3,
      responder_id: 502,
      custom_fields: { cf_hobby: "Kite flying" },
    });
  });

  it.each([
    ["Resolved", 4],
    ["Closed", 5],
  ])("allows status %s: one PUT with status %i", async (status, id) => {
    const session = await warm();
    reply(TICKET, { ...rawTicket, status: id }, "PUT");

    const result = await callTool(session, TOOL, { ticket_id: ID, fields: { status } });

    expect(output(result)).toMatchObject({ ticket_id: ID, changed: true });
    expect(putBody()).toEqual({ status: id });
  });

  it("counts a cold schema load in api_calls_used", async () => {
    const session = await cold();
    queueSchema();
    reply(TICKET, rawTicket, "PUT");

    const result = await callTool(session, TOOL, { ticket_id: ID, fields: { Priority: "High" } });

    expect(output(result)).toEqual({ ticket_id: ID, changed: true, api_calls_used: 4 });
    expect(putBody()).toEqual({ priority: 3 });
  });

  it.each([
    ["requester", { requester: 9002 }],
    ["Subject", { Subject: "A new subject" }],
  ])("refuses a %s input as field_not_writable, with nothing sent", async (_name, fields) => {
    const session = await warm();

    const error = failure(await callTool(session, TOOL, { ticket_id: ID, fields }));

    expect(error).toMatchObject({ code: "validation", http_status: null });
    expect(error.errors?.map((item) => item.code)).toEqual(["field_not_writable"]);
    expect(sent()).toEqual([]);
  });

  it("refuses a top-level key it does not name (subject beside fields), with nothing sent", async () => {
    const session = await warm();

    const result = await callTool(session, TOOL, {
      ticket_id: ID,
      subject: "A new subject",
      fields: { Status: "Closed" },
    });

    expect(result.isError).toBe(true);
    expect(sent()).toEqual([]);
  });

  it("refuses the whole change when one field is not writable: no PUT for the others", async () => {
    const session = await warm();

    const error = failure(
      await callTool(session, TOOL, {
        ticket_id: ID,
        fields: { Status: "Closed", requester: 9002 },
      }),
    );

    expect(error.errors?.map((item) => item.code)).toEqual(["field_not_writable"]);
    expect(sent()).toEqual([]);
  });

  it("passes Freshdesk's refusal of the PUT on, as an error", async () => {
    const session = await warm();
    reply(TICKET, { description: "Validation failed", errors: [] }, "PUT", 400);

    const error = failure(await callTool(session, TOOL, { ticket_id: ID, fields: { status: 5 } }));

    expect(error).toMatchObject({ code: "validation", http_status: 400 });
    expect(sent()).toEqual([`PUT ${TICKET}`]);
  });
});

describe("update_ticket: tags", () => {
  const current = { ...rawTicket, tags: ["alpha", "Beta", "kite"] };

  it("merges tags_add and tags_remove into the current tags: one GET, one PUT", async () => {
    const session = await warm();
    reply(TICKET, current);
    reply(TICKET, { ...current, tags: ["Beta", "kite", "gamma"] }, "PUT");

    const result = await callTool(session, TOOL, {
      ticket_id: ID,
      tags_add: ["gamma", "beta"],
      tags_remove: ["ALPHA", "absent"],
    });

    expect(output(result)).toEqual({
      ticket_id: ID,
      changed: true,
      tags: ["Beta", "kite", "gamma"],
      api_calls_used: 2,
    });
    expect(sent()).toEqual([`GET ${TICKET}`, `PUT ${TICKET}`]);
    expect(putBody()).toEqual({ tags: ["Beta", "kite", "gamma"] });
  });

  it("sends the fields and the merged tags in the same PUT", async () => {
    const session = await warm();
    reply(TICKET, current);
    reply(TICKET, current, "PUT");

    await callTool(session, TOOL, {
      ticket_id: ID,
      fields: { Group: "Widget Desk" },
      tags_remove: ["kite"],
    });

    expect(putBody()).toEqual({ group_id: 702, tags: ["alpha", "Beta"] });
  });

  it("sends no PUT when the merge leaves the tags as they are and no field changes", async () => {
    const session = await warm();
    reply(TICKET, current);

    const result = await callTool(session, TOOL, {
      ticket_id: ID,
      tags_add: ["KITE"],
      tags_remove: ["absent"],
    });

    expect(output(result)).toEqual({ ticket_id: ID, changed: false, api_calls_used: 1 });
    expect(sent()).toEqual([`GET ${TICKET}`]);
  });

  it("sends the fields without tags when the merge leaves the tags as they are", async () => {
    const session = await warm();
    reply(TICKET, current);
    reply(TICKET, current, "PUT");

    await callTool(session, TOOL, { ticket_id: ID, fields: { priority: 4 }, tags_add: ["alpha"] });

    expect(putBody()).toEqual({ priority: 4 });
  });

  it("treats a ticket with no tags key as having none", async () => {
    const session = await warm();
    reply(TICKET, rawTicket);
    reply(TICKET, rawTicket, "PUT");

    await callTool(session, TOOL, { ticket_id: ID, tags_add: ["gamma"] });

    expect(putBody()).toEqual({ tags: ["gamma"] });
  });

  it.each([
    ["a string", "alpha"],
    ["a list holding a number", ["alpha", 7]],
    ["null", null],
  ])("refuses, with no PUT, a current tag list that is %s", async (_what, tags) => {
    const session = await warm();
    reply(TICKET, { ...rawTicket, tags });

    const error = failure(await callTool(session, TOOL, { ticket_id: ID, tags_add: ["gamma"] }));

    expect(error).toMatchObject({ code: "server" });
    expect(sent()).toEqual([`GET ${TICKET}`]);
  });

  it("passes on a failed read of the current tags, with no PUT", async () => {
    const session = await warm();
    reply(TICKET, { description: "not found" }, "GET", 404);

    const error = failure(await callTool(session, TOOL, { ticket_id: ID, tags_add: ["gamma"] }));

    expect(error).toMatchObject({ code: "not_found", http_status: 404 });
    expect(sent()).toEqual([`GET ${TICKET}`]);
  });

  it("refuses a tag both added and removed, before any request", async () => {
    const session = await warm();

    const error = failure(
      await callTool(session, TOOL, { ticket_id: ID, tags_add: ["kite"], tags_remove: ["Kite"] }),
    );

    expect(error).toMatchObject({ code: "validation", http_status: null });
    expect(sent()).toEqual([]);
  });

  it(`refuses more than ${MAX_TAGS} tags in a list, before any request`, async () => {
    const session = await warm();
    const many = Array.from({ length: MAX_TAGS + 1 }, (_, i) => `tag${i}`);

    const result = await callTool(session, TOOL, { ticket_id: ID, tags_add: many });

    expect(result.isError).toBe(true);
    expect(sent()).toEqual([]);
  });
});

describe("update_ticket: a call that changes nothing", () => {
  it.each([
    ["no fields and no tags", {}],
    ["empty fields and empty tag lists", { fields: {}, tags_add: [], tags_remove: [] }],
  ])("refuses %s, before any request (the schema load included)", async (_what, args) => {
    const session = await cold();

    const error = failure(await callTool(session, TOOL, { ticket_id: ID, ...args }));

    expect(error).toMatchObject({ code: "validation", http_status: null });
    expect(sent()).toEqual([]);
  });
});

describe("update_ticket: as listed", () => {
  it("says that automations may act and that Resolved or Closed may email the requester", async () => {
    const tools = await listTools(await cold());
    const tool = tools.find((listed) => listed.name === TOOL);

    expect(tool?.description).toContain(
      "Freshdesk automations may act on the change, as for an agent's edit.",
    );
    expect(tool?.description).toContain(
      "Setting the status to Resolved or Closed may make Freshdesk email the requester and send a satisfaction survey.",
    );
    expect(tool?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    });
  });
});
