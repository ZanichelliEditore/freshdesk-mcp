import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../../src/config.js";
import { createServer } from "../../../src/server.js";
import { createContext } from "../../../src/tools/context.js";
import { NAME_CAP } from "../../../src/tools/format.js";
import { CHOICE_CAP } from "../../../src/tools/toolsets/core/get-ticket-schema.js";
import { agentPages, groupPages } from "../../fixtures/agents-groups.js";
import {
  ticketFieldsPayload,
  ticketFieldsWithEntityChoices,
} from "../../fixtures/ticket-fields.js";
import { callTool, listTools, open, type Session } from "../../support/mcp-session.js";
import { type MockAgent, mockDispatcher } from "../../support/mock-dispatcher.js";

const DOMAIN = "acme.freshdesk.com";
const ORIGIN = `https://${DOMAIN}`;
const FIELDS = "/api/v2/ticket_fields";
const AGENTS = "/api/v2/agents?per_page=100";
const GROUPS = "/api/v2/groups?per_page=100";
const TOOL = "get_ticket_schema";

const dir = mkdtempSync(join(tmpdir(), "freshdesk-mcp-schema-tool-"));
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

const TEAM = {
  fields: {
    " PRODUCT ": { meaning: "Which kit the customer writes about." },
    cf_colour: { meaning: "The paint colour.", hidden: true },
  },
};

/** A session on a server from the real registry, built as cli.ts builds it. */
async function sessionFor(team: unknown = TEAM): Promise<Session> {
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

function reply(path: string, body: unknown, status = 200) {
  mock
    .get(ORIGIN)
    .intercept({ path, method: "GET" })
    .reply(status, body as object, { headers: { "content-type": "application/json" } });
}

/** Queue one full schema load: fields, one page of agents, one of groups. */
function queueLoad(fields: unknown = ticketFieldsPayload) {
  reply(FIELDS, fields);
  reply(AGENTS, agentPages[1]);
  reply(GROUPS, groupPages[1]);
}

function sent(): number {
  return mock.getCallHistory()?.calls().length ?? 0;
}

interface FieldOut {
  label: string;
  name: string;
  type: string;
  choices?: unknown[];
  choices_not_shown?: number;
  levels?: unknown[];
  meaning?: string;
}

async function schemaFields(session: Session): Promise<FieldOut[]> {
  const result = await callTool(session, TOOL, {});
  expect(result.isError).toBeFalsy();
  return (JSON.parse(result.content[0].text) as { fields: FieldOut[] }).fields;
}

function byName(fields: FieldOut[], name: string): FieldOut {
  const found = fields.find((field) => field.name === name);
  if (found === undefined) throw new Error(`no field ${name}`);
  return found;
}

describe("get_ticket_schema: the listing", () => {
  it("is listed read-only, with its cold and warm cost in the description", async () => {
    const tools = await listTools(await sessionFor());
    const tool = tools.find((listed) => listed.name === TOOL);
    expect(tool?.annotations.readOnlyHint).toBe(true);
    expect(tool?.annotations.destructiveHint).toBe(false);
    expect(tool?.description).toMatch(/Cost: 0 API calls while the schema is cached.*a cold load/s);
  });
});

describe("get_ticket_schema: the fields", () => {
  it("returns each fixture field's label, API name, type and choices", async () => {
    queueLoad();
    const fields = await schemaFields(await sessionFor());
    expect(fields.map((field) => [field.label, field.name, field.type])).toEqual([
      ["Subject", "subject", "default_subject"],
      ["Status", "status", "default_status"],
      ["Priority", "priority", "default_priority"],
      ["Colour", "cf_colour", "custom_dropdown"],
      ["Product", "cf_kit", "nested_field"],
    ]);
    expect(byName(fields, "subject").choices).toBeUndefined();
    expect(byName(fields, "status").choices).toEqual([
      { id: 2, name: "Open", customer_name: "Being processed" },
      { id: 5, name: "Closed", customer_name: "This ticket is closed" },
    ]);
    expect(byName(fields, "priority").choices).toEqual([
      { id: 1, name: "Low" },
      { id: 2, name: "Medium" },
      { id: 3, name: "High" },
      { id: 4, name: "Urgent" },
    ]);
    expect(byName(fields, "cf_colour").choices).toEqual(["Amber", "Teal"]);
  });

  it("returns the 3-level field as a tree, with its levels", async () => {
    queueLoad();
    const product = byName(await schemaFields(await sessionFor()), "cf_kit");
    expect(product.choices).toEqual([
      {
        name: "Gadgets",
        choices: [
          { name: "Sprockets", choices: ["Blue sprocket", "Red sprocket"] },
          { name: "Widgets", choices: ["Small widget"] },
        ],
      },
      {
        name: "Tools",
        choices: [{ name: "Spanners", choices: ["Left spanner", "Right spanner"] }],
      },
    ]);
    expect(product.levels).toEqual([
      { label: "Family", name: "cf_family", level: 2 },
      { label: "Model", name: "cf_model", level: 3 },
    ]);
  });

  it("carries the team meaning, matched by label or API name whatever the case", async () => {
    queueLoad();
    const fields = await schemaFields(await sessionFor());
    expect(byName(fields, "cf_kit").meaning).toBe("Which kit the customer writes about.");
    expect(byName(fields, "cf_colour").meaning).toBe("The paint colour.");
    expect(byName(fields, "status")).not.toHaveProperty("meaning");
  });

  it("lists a field the team file marks hidden like any other: hidden is not applied here", async () => {
    queueLoad();
    const hidden = byName(await schemaFields(await sessionFor()), "cf_colour");
    queueLoad();
    const shown = byName(
      await schemaFields(
        await sessionFor({ fields: { cf_colour: { meaning: "The paint colour." } } }),
      ),
      "cf_colour",
    );
    expect(hidden).toEqual(shown);
    expect(hidden).not.toHaveProperty("hidden");
  });
});

describe("get_ticket_schema: admin-set names", () => {
  it("strips HTML from a label and a choice name and caps them", async () => {
    const long = "x".repeat(NAME_CAP + 20);
    queueLoad([
      {
        id: 2001,
        name: "cf_region",
        label: `<b>Region</b> ${long}`,
        type: "custom_dropdown",
        default: false,
        choices: ["<i>North</i>", `<script>x</script>South ${long}`],
      },
    ]);
    const [field] = await schemaFields(await sessionFor());
    expect(field.label).not.toContain("<");
    expect(field.label.startsWith("Region x")).toBe(true);
    expect(Array.from(field.label)).toHaveLength(NAME_CAP + 1);
    expect(field.label.endsWith("…")).toBe(true);
    const [north, south] = field.choices as string[];
    expect(north).toBe("North");
    expect(south).not.toContain("<");
    expect(Array.from(south)).toHaveLength(NAME_CAP + 1);
    expect(south.endsWith("…")).toBe(true);
  });

  it("returns a name → id record (agent, group, product) as {id, name}", async () => {
    queueLoad(ticketFieldsWithEntityChoices);
    const fields = await schemaFields(await sessionFor());
    expect(byName(fields, "responder_id").choices).toEqual([
      { id: 70411, name: "Quill Pemberton" },
      { id: 70412, name: "Oriel Vantasse" },
    ]);
    expect(byName(fields, "group_id").choices).toEqual([
      { id: 70421, name: "Harbour desk" },
      { id: 70422, name: "Lantern desk" },
      { id: 70423, name: "Meadow desk" },
    ]);
    expect(byName(fields, "product").choices).toEqual([{ id: 70431, name: "Zephyr kit" }]);
  });

  it("gives id null for a record value that is not a number", async () => {
    queueLoad([
      {
        id: 2004,
        name: "group_id",
        label: "Group",
        type: "default_group",
        default: true,
        choices: { "<b>Harbour</b> desk": ["not an id"] },
      },
    ]);
    const [field] = await schemaFields(await sessionFor());
    expect(field.choices).toEqual([{ id: null, name: "Harbour desk" }]);
  });

  it("passes a status key that is not a whole number through plainName", async () => {
    queueLoad([
      {
        id: 2005,
        name: "status",
        label: "Status",
        type: "default_status",
        default: true,
        choices: { "<i>x9</i>": ["<b>Odd</b>", "Odd for customers"] },
      },
    ]);
    const [field] = await schemaFields(await sessionFor());
    expect(field.choices).toEqual([{ id: "x9", name: "Odd", customer_name: "Odd for customers" }]);
  });

  it.each([
    [CHOICE_CAP, undefined],
    [CHOICE_CAP + 1, 1],
  ])("with %i choices lists the first CHOICE_CAP, choices_not_shown %s", async (count, cut) => {
    const choices = Array.from({ length: count }, (_, i) => `Choice ${i}`);
    queueLoad([
      {
        id: 2006,
        name: "cf_edge",
        label: "Edge",
        type: "custom_dropdown",
        default: false,
        choices,
      },
    ]);
    const [field] = await schemaFields(await sessionFor());
    expect(field.choices).toEqual(choices.slice(0, CHOICE_CAP));
    expect(field.choices_not_shown).toBe(cut);
    if (cut === undefined) expect(field).not.toHaveProperty("choices_not_shown");
  });

  it("cuts a choice list over the cap and says how many were not shown", async () => {
    const choices = Array.from({ length: CHOICE_CAP + 7 }, (_, i) => `Choice ${i}`);
    queueLoad([
      {
        id: 2002,
        name: "cf_many",
        label: "Many",
        type: "custom_dropdown",
        default: false,
        choices,
      },
    ]);
    const [field] = await schemaFields(await sessionFor());
    expect(field.choices).toEqual(choices.slice(0, CHOICE_CAP));
    expect(field.choices_not_shown).toBe(7);
  });

  it("counts every level of a tree against the cap, and marks each cut list", async () => {
    const tree = Object.fromEntries(
      Array.from({ length: 3 }, (_, i) => [
        `Top ${i}`,
        Array.from({ length: CHOICE_CAP }, (_, j) => `Leaf ${i}.${j}`),
      ]),
    );
    queueLoad([
      {
        id: 2003,
        name: "cf_deep",
        label: "Deep",
        type: "nested_field",
        default: false,
        choices: tree,
      },
    ]);
    const [field] = await schemaFields(await sessionFor());
    expect(field).not.toHaveProperty("choices_not_shown");
    const tops = field.choices as { name: string; choices: string[]; choices_not_shown?: number }[];
    expect(tops.map((top) => top.name)).toEqual(["Top 0", "Top 1", "Top 2"]);
    expect(tops[0].choices).toHaveLength(CHOICE_CAP - 3);
    expect(tops[0].choices_not_shown).toBe(3);
    expect(tops[1].choices).toEqual([]);
    expect(tops[1].choices_not_shown).toBe(CHOICE_CAP);
  });
});

describe("get_ticket_schema: the cache", () => {
  it("sends no request for a second call within the TTL", async () => {
    queueLoad();
    const session = await sessionFor();
    const first = await schemaFields(session);
    expect(sent()).toBe(3);
    const second = await schemaFields(session);
    expect(sent()).toBe(3);
    expect(second).toEqual(first);
  });

  it("returns a failed load's error code as isError, and the next call loads again", async () => {
    reply(FIELDS, { message: "nope" }, 403);
    const session = await sessionFor();
    const failed = await callTool(session, TOOL, {});
    expect(failed.isError).toBe(true);
    expect(JSON.parse(failed.content[0].text).error.code).toBe("forbidden");
    expect(sent()).toBe(1);

    queueLoad();
    const fields = await schemaFields(session);
    expect(sent()).toBe(4);
    expect(fields).toHaveLength(ticketFieldsPayload.length);
  });
});
