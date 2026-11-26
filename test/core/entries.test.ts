// T-068 (RFC 2026-11-25-write-safety-core, invariants 2, 3, 5, 6): the write
// path's entry points. They exist only when the team file enables `write`;
// each ticket entry builds its body through `ticketInput` with its own allow
// set and sends nothing else; each note entry builds the note itself, private
// always, from a closed key set. An entry never rejects.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TicketField } from "../../src/client/resources/ticket-fields.js";
import { allowSet, type WriteEntry } from "../../src/core/allow-sets.js";
import type { WriteResult } from "../../src/core/resources.js";
import {
  createWritePath,
  type TicketChange,
  type WriteEntries,
} from "../../src/core/write-path.js";
import type { Schema } from "../../src/schema/index.js";
import { schemaFieldsPayload } from "../fixtures/schema.js";
import { conversationPages, ticketView } from "../fixtures/tickets.js";
import { type MockAgent, mockDispatcher } from "../support/mock-dispatcher.js";

const DOMAIN = "acme.freshdesk.com";
const ORIGIN = `https://${DOMAIN}`;
const JSON_TYPE = { "content-type": "application/json" };
const limits = { reserve_pct: 20, floor_pct: 5, pacing_rps: 2 };
const NOTE = conversationPages[0]![0]!;

let mock: MockAgent;

beforeEach(() => {
  mock = mockDispatcher();
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await mock.close();
});

function writePath(toolsets: string[]) {
  return createWritePath({
    domain: DOMAIN,
    apiKey: "k3y",
    dispatcher: mock,
    limits,
    toolsets,
    forwardAllowList: [],
  });
}

function entries(): WriteEntries {
  const { entries } = writePath(["core", "write"]);
  if (entries === undefined) throw new Error("expected entries");
  return entries;
}

/** A schema built by hand, as test/schema/input.test.ts does. */
function schema(fields: object[] = schemaFieldsPayload): Schema {
  return {
    fields: structuredClone(fields) as TicketField[],
    agents: { names: new Map(), truncated: false },
    groups: { names: new Map(), truncated: false },
  };
}

function dispatched(): number {
  return mock.getCallHistory()?.calls().length ?? 0;
}

function sentBody(): unknown {
  const calls = mock.getCallHistory()!.calls();
  expect(calls).toHaveLength(1);
  return JSON.parse(calls[0]!.body as string);
}

function failure<T>(result: WriteResult<T>) {
  if (result.ok) throw new Error(`expected an error, got ${JSON.stringify(result.value)}`);
  return result.error;
}

function onPut(id = 42) {
  return mock.get(ORIGIN).intercept({ path: `/api/v2/tickets/${id}`, method: "PUT" });
}

function onNote(id = 42) {
  return mock.get(ORIGIN).intercept({ path: `/api/v2/tickets/${id}/notes`, method: "POST" });
}

describe("the entries exist only when write is enabled", () => {
  it.each([
    [["core"], ["view"]],
    [
      ["core", "send"],
      ["view", "sends"],
    ],
    [["send"], ["view", "sends"]],
  ])("toolsets %j give no entries object", (toolsets, keys) => {
    const path = writePath(toolsets);

    expect("entries" in path).toBe(false);
    // `send` builds its own entries (T-082, test/core/send-entries.test.ts), never write's.
    expect(Object.keys(path)).toEqual(keys);
  });

  it.each([[["core", "write"]], [["write"]], [["core", "write", "send"]]])(
    "toolsets %j give one frozen entry per write tool",
    (toolsets) => {
      const { entries } = writePath(toolsets);

      expect(Object.keys(entries!).sort()).toEqual([
        "add_note",
        "categorize_tickets",
        "hand_off_draft",
        "update_ticket",
      ]);
      expect(Object.isFrozen(entries)).toBe(true);
      for (const entry of Object.values(entries!)) expect(Object.isFrozen(entry)).toBe(true);
    },
  );
});

interface TicketCase {
  entry: WriteEntry;
  call: (entries: WriteEntries, change: TicketChange) => Promise<WriteResult<unknown>>;
  allowed: Record<string, unknown>;
  body: Record<string, unknown>;
}

const ticketCases: TicketCase[] = [
  {
    entry: "update_ticket",
    call: (e, change) => e.update_ticket.update(change),
    allowed: { status: "Closed", Priority: "High", Agent: 501, cf_hobby: "Kites" },
    body: { status: 5, priority: 3, responder_id: 501, custom_fields: { cf_hobby: "Kites" } },
  },
  {
    entry: "categorize_tickets",
    call: (e, change) => e.categorize_tickets.update(change),
    allowed: { Type: "Incident", cf_colour: "Teal" },
    body: { type: "Incident", custom_fields: { cf_colour: "Teal" } },
  },
  {
    entry: "hand_off_draft",
    call: (e, change) => e.hand_off_draft.assign(change),
    allowed: { agent: 502, group: 701 },
    body: { responder_id: 502, group_id: 701 },
  },
];

/** Each default field, with its label: the key given (the fixture's `product` API name is also a label). */
const DEFAULT_FIELDS = schemaFieldsPayload
  .filter((field) => (field as { default: boolean }).default)
  .map((field) => ({ name: field.name, label: field.label }));

describe.each(ticketCases)("$entry's ticket entry", (c) => {
  it("sends the fields of its own set, as ticketInput builds them, to PUT /tickets/{id}", async () => {
    onPut().reply(200, ticketView, { headers: JSON_TYPE });

    const result = await c.call(entries(), { schema: schema(), id: 42, fields: c.allowed });

    expect(result).toMatchObject({ ok: true, attempts: 1 });
    expect(sentBody()).toEqual(c.body);
  });

  const outside = DEFAULT_FIELDS.filter(({ name }) => !allowSet(c.entry).defaults.includes(name));

  it.each(outside)(
    "refuses the default field $name as field_not_writable, sending nothing",
    async ({ label }) => {
      const result = await c.call(entries(), {
        schema: schema(),
        id: 42,
        fields: { ...c.allowed, [label]: 1 },
      });

      const error = failure(result);
      expect(error).toMatchObject({ code: "validation", http_status: null, retryable: false });
      expect(error.errors).toEqual([
        expect.objectContaining({ field: label, code: "field_not_writable" }),
      ]);
      expect(result.attempts).toBe(0);
      expect(dispatched()).toBe(0);
    },
  );

  if (!allowSet(c.entry).custom) {
    it("refuses a custom field as field_not_writable, sending nothing", async () => {
      const result = await c.call(entries(), {
        schema: schema(),
        id: 42,
        fields: { cf_colour: "Teal" },
      });

      expect(failure(result).errors).toEqual([
        expect.objectContaining({ field: "cf_colour", code: "field_not_writable" }),
      ]);
      expect(dispatched()).toBe(0);
    });
  }

  it("refuses a body key outside its set that a forged schema builds, sending nothing", async () => {
    // A default field of the set, forged as a nested field whose second level
    // is named requester_id: ticketInput would put that key at the top level.
    const name = allowSet(c.entry).defaults[0]!;
    const forged = schema([
      {
        id: 1,
        name,
        label: "Forged",
        type: "nested_field",
        default: true,
        choices: { A: ["B"] },
        nested_ticket_fields: [{ name: "requester_id", label: "Who", level: 2 }],
      },
    ]);

    const result = await c.call(entries(), { schema: forged, id: 42, fields: { Forged: "A > B" } });

    expect(failure(result)).toMatchObject({
      code: "validation",
      http_status: null,
      message: "Not sent: the body holds a key this tool cannot set.",
    });
    expect(result.attempts).toBe(0);
    expect(dispatched()).toBe(0);
  });

  it("resolves a value JSON cannot carry to validation, sending nothing", async () => {
    // cf_hobby is free text in the fixture: ticketInput passes the value on,
    // so the snapshot in write() is what meets it. (hand_off_draft takes no
    // custom field, so its refusal comes earlier: still no rejection.)
    const result = await c.call(entries(), {
      schema: schema(),
      id: 42,
      fields: { cf_hobby: 10n },
    });

    expect(failure(result)).toMatchObject({
      code: "validation",
      http_status: null,
      ...(allowSet(c.entry).custom && { message: "Not sent: the body cannot be sent as JSON." }),
    });
    expect(dispatched()).toBe(0);
  });

  it("refuses a change that sets no field, sending nothing", async () => {
    const result = await c.call(entries(), { schema: schema(), id: 42, fields: {} });

    expect(failure(result)).toMatchObject({
      code: "validation",
      http_status: null,
      message: "Not sent: the change sets no field.",
    });
    expect(dispatched()).toBe(0);
  });

  it.each<[string, unknown]>([
    ["null", null],
    [
      "a change whose fields read throws",
      {
        schema: schema(),
        id: 42,
        get fields() {
          throw new Error("boom");
        },
      },
    ],
    ["a change with no schema", { id: 42, fields: { status: "Closed" } }],
  ])("resolves %s, given by a cast, to validation, sending nothing", async (_, change) => {
    const result = await c.call(entries(), change as TicketChange);

    expect(failure(result)).toMatchObject({ code: "validation", http_status: null });
    expect(result.attempts).toBe(0);
    expect(dispatched()).toBe(0);
  });

  if (!allowSet(c.entry).tags) {
    it("does not send tags given by a cast", async () => {
      onPut().reply(200, ticketView, { headers: JSON_TYPE });
      const change = { schema: schema(), id: 42, fields: c.allowed, tags: ["x"] };

      await c.call(entries(), change as TicketChange);

      expect(sentBody()).toEqual(c.body);
    });
  }
});

describe("update_ticket's tags", () => {
  it("sends the tags given, beside the fields", async () => {
    onPut().reply(200, ticketView, { headers: JSON_TYPE });

    await entries().update_ticket.update({
      schema: schema(),
      id: 42,
      fields: { Priority: "Low" },
      tags: ["vip", "billing"],
    });

    expect(sentBody()).toEqual({ priority: 1, tags: ["vip", "billing"] });
  });

  it("sends an empty list, which clears the tags", async () => {
    onPut().reply(200, ticketView, { headers: JSON_TYPE });

    await entries().update_ticket.update({ schema: schema(), id: 42, fields: {}, tags: [] });

    expect(sentBody()).toEqual({ tags: [] });
  });

  it.each<[string, unknown]>([
    ["not a list", "vip"],
    ["a list with a number", ["vip", 3]],
    ["a list with null", [null]],
  ])("refuses tags that are %s as validation on tags, sending nothing", async (_, tags) => {
    const result = await entries().update_ticket.update({
      schema: schema(),
      id: 42,
      fields: {},
      tags: tags as string[],
    });

    const error = failure(result);
    expect(error).toMatchObject({ code: "validation", http_status: null });
    expect(error.errors).toEqual([expect.objectContaining({ field: "tags" })]);
    expect(dispatched()).toBe(0);
  });

  it("sends the list it checked, read once, whatever an element answers later", async () => {
    onPut().reply(200, ticketView, { headers: JSON_TYPE });
    let reads = 0;
    const tags: string[] = [];
    Object.defineProperty(tags, 0, {
      enumerable: true,
      get() {
        reads += 1;
        return reads === 1 ? "vip" : 3;
      },
    });

    await entries().update_ticket.update({ schema: schema(), id: 42, fields: {}, tags });

    expect(sentBody()).toEqual({ tags: ["vip"] });
    expect(reads).toBe(1);
  });
});

it("a note entry has no private input (make typecheck fails on one)", () => {
  // Never called: the proof is `make typecheck`, which fails if a `private`
  // key becomes a valid input of either note entry.
  const typeOnly = (e: WriteEntries) => [
    // @ts-expect-error: add_note's note entry takes no `private`.
    e.add_note.note({ id: 42, body: "x", private: false }),
    // @ts-expect-error: hand_off_draft's note entry takes no `private`.
    e.hand_off_draft.note({ id: 42, body: "x", private: false }),
  ];
  void typeOnly;
});

interface NoteCase {
  name: string;
  call: (
    entries: WriteEntries,
    note: { id: number; body: string },
  ) => Promise<WriteResult<unknown>>;
}

const noteCases: NoteCase[] = [
  { name: "add_note", call: (e, note) => e.add_note.note(note) },
  { name: "hand_off_draft", call: (e, note) => e.hand_off_draft.note(note) },
];

describe.each(noteCases)("$name's note entry", (c) => {
  it("sends the body with private: true, and nothing else, to POST /tickets/{id}/notes", async () => {
    onNote().reply(201, NOTE, { headers: JSON_TYPE });

    const result = await c.call(entries(), { id: 42, body: "<p>Checked the logs.</p>" });

    expect(result).toMatchObject({ ok: true, attempts: 1 });
    expect(sentBody()).toEqual({ body: "<p>Checked the logs.</p>", private: true });
  });

  it("never sends private: false, user_id, incoming, attachments or notify_emails given by a cast", async () => {
    onNote().reply(201, NOTE, { headers: JSON_TYPE });
    const note = {
      id: 42,
      body: "hello",
      private: false,
      user_id: 8801,
      incoming: true,
      attachments: ["file"],
      notify_emails: ["someone@example.com"],
    };

    await c.call(entries(), note);

    expect(sentBody()).toEqual({ body: "hello", private: true });
  });

  it.each<[string, unknown]>([
    ["a BigInt", 10n],
    ["undefined", undefined],
    ["null", null],
    ["a number", 3],
    ["an object", { text: "x" }],
  ])(
    "resolves a body that is %s, given by a cast, to validation on body, sending nothing",
    async (_, body) => {
      const result = await c.call(entries(), { id: 42, body: body as string });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({
          code: "validation",
          http_status: null,
          retryable: false,
          errors: [expect.objectContaining({ field: "body", code: "invalid_value" })],
        }),
        attempts: 0,
      });
      expect(dispatched()).toBe(0);
    },
  );

  it.each<[string, unknown]>([
    ["null", null],
    [
      "a note whose body read throws",
      {
        id: 42,
        get body() {
          throw new Error("boom");
        },
      },
    ],
  ])("resolves %s, given by a cast, to validation, sending nothing", async (_, note) => {
    const result = await c.call(entries(), note as { id: number; body: string });

    expect(failure(result)).toMatchObject({ code: "validation", http_status: null });
    expect(dispatched()).toBe(0);
  });

  it("refuses an id that is not a positive whole number, sending nothing", async () => {
    const result = await c.call(entries(), { id: 0, body: "x" });

    expect(failure(result)).toMatchObject({ code: "validation", http_status: null });
    expect(dispatched()).toBe(0);
  });
});
