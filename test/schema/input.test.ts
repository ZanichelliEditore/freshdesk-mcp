import { describe, expect, it } from "vitest";
import type { FieldError } from "../../src/client/errors.js";
import type { TicketField } from "../../src/client/resources/ticket-fields.js";
import { readFileSync } from "node:fs";
import { allowSet, type WriteEntry } from "../../src/core/allow-sets.js";
import type { Schema } from "../../src/schema/index.js";
import { type FieldSet, ticketInput } from "../../src/schema/input.js";
import { schemaFieldsPayload } from "../fixtures/schema.js";

/**
 * Every field the fixtures hold: the mapping's own tests are not about allow
 * sets (those are below, with the core's table).
 */
const ALL: FieldSet = {
  defaults: [
    "subject",
    "description",
    "status",
    "priority",
    "source",
    "agent",
    "group",
    "ticket_type",
    "requester",
    "company",
    "product",
  ],
  custom: true,
};

/** A schema built by hand: the mapping needs no HTTP, nor agents or groups. */
function schema(extra: object[] = []): Schema {
  return {
    fields: structuredClone([...schemaFieldsPayload, ...extra]) as TicketField[],
    agents: { names: new Map(), truncated: false },
    groups: { names: new Map(), truncated: false },
  };
}

function body(input: Record<string, unknown>, s: Schema = schema(), allow: FieldSet = ALL) {
  const result = ticketInput(s, input, allow);
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.body;
}

function errors(
  input: Record<string, unknown>,
  s: Schema = schema(),
  allow: FieldSet = ALL,
): FieldError[] {
  const result = ticketInput(s, input, allow);
  if (result.ok) throw new Error(`expected an error, got ${JSON.stringify(result.body)}`);
  expect(result.error).toMatchObject({ code: "validation", http_status: null, retryable: false });
  return result.error.errors ?? [];
}

describe("ticketInput: field names", () => {
  it("accepts a field's API name and its label alike", () => {
    expect(body({ cf_colour: "Teal" })).toEqual({ custom_fields: { cf_colour: "Teal" } });
    expect(body({ Colour: "Teal" })).toEqual({ custom_fields: { cf_colour: "Teal" } });
  });

  it("matches a label in any case, trimmed, in any Unicode form", () => {
    expect(body({ "  cOLOUR ": "Teal" })).toEqual({ custom_fields: { cf_colour: "Teal" } });
    const accented = {
      id: 2001,
      name: "cf_cafe",
      label: "Caf" + String.fromCharCode(0xe9), // precomposed
      type: "custom_text",
      default: false,
    };
    expect(body({ ["CAFE" + String.fromCharCode(0x301)]: "x" }, schema([accented]))).toEqual({
      custom_fields: { cf_cafe: "x" },
    });
  });

  it("matches an API name exactly: case counts", () => {
    expect(errors({ CF_COLOUR: "Teal" })).toEqual([
      expect.objectContaining({ field: "CF_COLOUR", code: "unknown_field" }),
    ]);
  });

  it("refuses a key that is one field's API name and another's label, naming both", () => {
    // `product` is the API name of "Catalogue"; "Product" is the label of cf_kit.
    const [error] = errors({ product: 7001 });
    expect(error).toMatchObject({ field: "product", code: "ambiguous_field" });
    expect(error!.message).toContain('"cf_kit", "product"');
    // Each stays reachable by a key that names it alone.
    expect(body({ Catalogue: 7001 })).toEqual({ product_id: 7001 });
    expect(body({ Product: "Tools > Spanners" })).toMatchObject({
      custom_fields: { cf_kit: "Tools", cf_family: "Spanners" },
    });
  });

  it("puts a default field at the top level under its ticket key", () => {
    expect(body({ Subject: "Hi", Agent: 502, Group: 703, Requester: 9001 })).toEqual({
      subject: "Hi",
      responder_id: 502,
      group_id: 703,
      requester_id: 9001,
    });
  });

  it("refuses an unknown field, naming it", () => {
    const [error] = errors({ Flavour: "Mint" });
    expect(error).toMatchObject({ field: "Flavour", code: "unknown_field" });
    expect(error!.message).toContain("Flavour");
  });

  it("refuses a nested level's own name: only its top field is a field", () => {
    expect(errors({ cf_family: "Sprockets" })).toEqual([
      expect.objectContaining({ field: "cf_family", code: "unknown_field" }),
    ]);
  });

  it("refuses a label two fields share, listing their API names", () => {
    const twin = { id: 2002, name: "cf_hue", label: "colour", type: "custom_text", default: false };
    const [error] = errors({ Colour: "Teal" }, schema([twin]));
    expect(error).toMatchObject({ field: "Colour", code: "ambiguous_field" });
    expect(error!.message).toContain("cf_colour");
    expect(error!.message).toContain("cf_hue");
    // The API name still picks one.
    expect(body({ cf_hue: "x" }, schema([twin]))).toEqual({ custom_fields: { cf_hue: "x" } });
  });

  it("refuses the same field given twice, by label and by API name", () => {
    expect(errors({ Colour: "Teal", cf_colour: "Amber" })).toEqual([
      expect.objectContaining({ field: "cf_colour", code: "duplicate_field" }),
    ]);
  });

  it("reports every invalid field, not only the first", () => {
    expect(errors({ Flavour: 1, Colour: "Mauve", Status: "Gone" }).map((e) => e.field)).toEqual([
      "Flavour",
      "Colour",
      "Status",
    ]);
  });

  it("is safe with keys and labels named like Object.prototype members", () => {
    const odd = [
      { id: 2003, name: "cf_ctor", label: "constructor", type: "custom_text", default: false },
      {
        id: 2004,
        name: "cf_proto",
        label: "__proto__",
        type: "custom_dropdown",
        default: false,
        choices: ["toString", "hasOwnProperty"],
      },
    ];
    const input = JSON.parse('{"constructor": "c", "__proto__": "toString"}') as Record<
      string,
      unknown
    >;
    const out = body(input, schema(odd));
    expect(out).toEqual({ custom_fields: { cf_ctor: "c", cf_proto: "toString" } });
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    // Not resolved through the prototype chain when no field has the name.
    expect(errors({ toString: "x" })).toEqual([
      expect.objectContaining({ field: "toString", code: "unknown_field" }),
    ]);
  });

  it("returns an empty body for an empty input", () => {
    expect(body({})).toEqual({});
  });
});

describe("ticketInput: values", () => {
  it("passes a value with no choices through unchanged", () => {
    expect(body({ Hobby: "Kite flying", Notes: 42 })).toEqual({
      custom_fields: { cf_hobby: "Kite flying", cf_notes: 42 },
    });
  });

  it("passes null through: it clears the field", () => {
    expect(body({ Colour: null, Agent: null })).toEqual({
      custom_fields: { cf_colour: null },
      responder_id: null,
    });
  });

  it("matches a dropdown choice in any case and sends Freshdesk's spelling", () => {
    expect(body({ Colour: " teal " })).toEqual({ custom_fields: { cf_colour: "Teal" } });
    expect(body({ Type: "incident" })).toEqual({ type: "Incident" });
  });

  it("prefers an exact choice to one that only folds alike", () => {
    const pair = {
      id: 2005,
      name: "cf_size",
      label: "Size",
      type: "custom_dropdown",
      default: false,
      choices: ["XL", "xl"],
    };
    expect(body({ Size: "xl" }, schema([pair]))).toEqual({ custom_fields: { cf_size: "xl" } });
    expect(errors({ Size: "Xl" }, schema([pair]))).toEqual([
      expect.objectContaining({ field: "Size", code: "ambiguous_choice" }),
    ]);
  });

  it("refuses a dropdown value not among the choices, listing them", () => {
    const [error] = errors({ Colour: "Mauve" });
    expect(error).toMatchObject({ field: "Colour", code: "invalid_choice" });
    expect(error!.message).toContain("Mauve");
    expect(error!.message).toContain('"Amber", "Teal"');
  });

  it("refuses a value that is not a string where a choice is due", () => {
    expect(errors({ Colour: 1 })).toEqual([
      expect.objectContaining({ field: "Colour", code: "invalid_choice" }),
    ]);
  });

  it("refuses every value when a dropdown's choices are null", () => {
    const fields = schema();
    fields.fields.find((f) => f.name === "cf_colour")!.choices = null;
    const [error] = errors({ Colour: "Teal" }, fields);
    expect(error).toMatchObject({ code: "invalid_choice" });
    expect(error!.message).toContain("(none)");
  });

  it("turns a status, priority or source name into its id", () => {
    expect(body({ Status: "closed", Priority: "Urgent", Source: "phone" })).toEqual({
      status: 5,
      priority: 4,
      source: 3,
    });
  });

  it("accepts a status, priority or source id that exists", () => {
    expect(body({ Status: 2, Priority: 1, Source: 2 })).toEqual({
      status: 2,
      priority: 1,
      source: 2,
    });
  });

  it("refuses an unknown status, priority or source, listing the names", () => {
    const [status, priority, source] = errors({ Status: 9, Priority: "Meh", Source: "Fax" });
    expect(status).toMatchObject({ field: "Status", code: "invalid_choice" });
    expect(status!.message).toContain('"Open", "Closed"');
    expect(priority!.message).toContain('"Low", "Medium", "High", "Urgent"');
    expect(source!.message).toContain('"Email", "Portal", "Phone"');
  });
});

/** The schema with `field`'s choices replaced, and its agents or groups list. */
function withNames(
  field: "agent" | "group",
  choices: Record<string, number>,
  names: [number, string][] = [],
): Schema {
  const s = schema();
  s.fields.find((f) => f.name === field)!.choices = choices;
  const list = { names: new Map(names), truncated: false };
  return field === "agent" ? { ...s, agents: list } : { ...s, groups: list };
}

describe("ticketInput: agent and group", () => {
  it("turns an exact agent or group name into its id", () => {
    expect(body({ Agent: "Juniper Vantablack", Group: "Spanner Desk" })).toEqual({
      responder_id: 502,
      group_id: 703,
    });
  });

  it("matches a name folded: any case, trimmed, any Unicode form", () => {
    expect(body({ Agent: "  juniper VANTABLACK ", Group: "sprocket desk" })).toEqual({
      responder_id: 502,
      group_id: 701,
    });
    const s = withNames("agent", { ["Ren" + String.fromCharCode(0xe9)]: 531 });
    expect(body({ Agent: "REN" + "E" + String.fromCharCode(0x301) }, s)).toEqual({
      responder_id: 531,
    });
  });

  it("accepts an id among the choices' values", () => {
    expect(body({ Agent: 501, Group: 702 })).toEqual({ responder_id: 501, group_id: 702 });
  });

  it("refuses an unknown name or id, listing the valid names", () => {
    for (const [input, names] of [
      [{ Agent: "Nobody" }, '"Quill Ottersby", "Juniper Vantablack", "Ferro Lumen"'],
      [{ Agent: 504 }, '"Quill Ottersby", "Juniper Vantablack", "Ferro Lumen"'],
      [{ Group: "Nowhere Desk" }, '"Sprocket Desk", "Widget Desk", "Spanner Desk"'],
      [{ Group: 704 }, '"Sprocket Desk", "Widget Desk", "Spanner Desk"'],
    ] as const) {
      const [error] = errors(input);
      expect(error).toMatchObject({ field: Object.keys(input)[0], code: "invalid_choice" });
      expect(error!.message).toContain(names);
    }
  });

  it("refuses an id given as a string or a value of another kind", () => {
    for (const value of ["502", true, { id: 502 }, [502]]) {
      expect(errors({ Agent: value })[0]).toMatchObject({ code: "invalid_choice" });
    }
  });

  it("refuses a name that folds like two choices, none exact, listing both ids", () => {
    const s = withNames("agent", { "Ann Lee": 511, "ann lee": 512 });
    const [error] = errors({ Agent: "ANN LEE" }, s);
    expect(error).toMatchObject({ field: "Agent", code: "ambiguous_choice" });
    expect(error!.message).toContain("511");
    expect(error!.message).toContain("512");
    // An exact name still picks one, and so does each id.
    expect(body({ Agent: "ann lee" }, s)).toEqual({ responder_id: 512 });
    expect(body({ Agent: 511 }, s)).toEqual({ responder_id: 511 });
  });

  it.each(["agent", "group"] as const)(
    "refuses a %s name two ids share in its list, though the choices keep one",
    (field) => {
      // JSON keeps the last of two equal keys: the choices hold one id, the
      // agents or groups list both.
      const s = withNames(field, { "Sam Roe": 522 }, [
        [521, "Sam Roe"],
        [522, "sam roe "],
        [523, "Other"],
      ]);
      const key = field === "agent" ? "Agent" : "Group";
      const [error] = errors({ [key]: "Sam Roe" }, s);
      expect(error).toMatchObject({ field: key, code: "ambiguous_choice" });
      expect(error!.message).toContain("521");
      expect(error!.message).toContain("522");
      expect(error!.message).not.toContain("523");
      expect(body({ [key]: 522 }, s)).toEqual({
        [field === "agent" ? "responder_id" : "group_id"]: 522,
      });
    },
  );

  it("clips a long list of valid names", () => {
    const many = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`Agent ${i}`, i + 1]));
    const [error] = errors({ Agent: "Nobody" }, withNames("agent", many));
    expect(error!.message.length).toBeLessThanOrEqual(500);
    expect(error!.message).toMatch(/… and \d+ more\.$/);
  });

  it("refuses every agent when the choices are absent: an id is not passed through", () => {
    const s = schema();
    s.fields.find((f) => f.name === "agent")!.choices = null;
    const [error] = errors({ Agent: 502 }, s);
    expect(error).toMatchObject({ code: "invalid_choice" });
    expect(error!.message).toContain("(none)");
    // null still clears it.
    expect(body({ Agent: null }, s)).toEqual({ responder_id: null });
  });

  it("still refuses product: with a name → id record its choices are not checked", () => {
    const s = schema();
    s.fields.find((f) => f.name === "product")!.choices = { Gizmos: 7001 };
    for (const value of ["Gizmos", 7001]) {
      expect(errors({ Catalogue: value }, s)[0]).toMatchObject({
        field: "Catalogue",
        code: "unsupported_field",
      });
    }
  });
});

describe("ticketInput: nested fields", () => {
  it("resolves a 3-level path to the three API fields", () => {
    expect(body({ Product: "Gadgets > Sprockets > Red sprocket" })).toEqual({
      custom_fields: { cf_kit: "Gadgets", cf_family: "Sprockets", cf_model: "Red sprocket" },
    });
  });

  it("matches each level in any case and trims around the separator", () => {
    expect(body({ cf_kit: " tools >  spanners > LEFT SPANNER " })).toEqual({
      custom_fields: { cf_kit: "Tools", cf_family: "Spanners", cf_model: "Left spanner" },
    });
  });

  it("resolves a 2-level path", () => {
    expect(body({ Shelf: "South > Middle" })).toEqual({
      custom_fields: { cf_shelf: "South", cf_tier: "Middle" },
    });
  });

  it("orders the levels by their `level`, not by list order", () => {
    const s = schema();
    s.fields.find((f) => f.name === "cf_kit")!.nested_ticket_fields!.reverse();
    expect(body({ Product: "Gadgets > Widgets > Small widget" }, s)).toEqual({
      custom_fields: { cf_kit: "Gadgets", cf_family: "Widgets", cf_model: "Small widget" },
    });
  });

  it("splits only on ' > ': a choice may hold '>'", () => {
    const weights = {
      id: 2006,
      name: "cf_load",
      label: "Load",
      type: "nested_field",
      default: false,
      choices: { Heavy: [">5 kg"] },
      nested_ticket_fields: [{ name: "cf_band", label: "Band", level: 2 }],
    };
    expect(body({ Load: "Heavy > >5 kg" }, schema([weights]))).toEqual({
      custom_fields: { cf_load: "Heavy", cf_band: ">5 kg" },
    });
  });

  it("sends null for the levels after a path that stops early", () => {
    expect(body({ Product: "Gadgets > Widgets" })).toEqual({
      custom_fields: { cf_kit: "Gadgets", cf_family: "Widgets", cf_model: null },
    });
    expect(body({ Product: "Tools" })).toEqual({
      custom_fields: { cf_kit: "Tools", cf_family: null, cf_model: null },
    });
  });

  it("clears every level on null", () => {
    expect(body({ Product: null })).toEqual({
      custom_fields: { cf_kit: null, cf_family: null, cf_model: null },
    });
  });

  it("refuses an invalid first level, listing the first level's choices", () => {
    const [error] = errors({ Product: "Gizmos > Sprockets > Red sprocket" });
    expect(error).toMatchObject({ field: "Product", code: "invalid_choice" });
    expect(error!.message).toContain("Gizmos");
    expect(error!.message).toContain("level Product");
    expect(error!.message).toContain('"Gadgets", "Tools"');
  });

  it("refuses an invalid second level, listing the choices under the first", () => {
    const [error] = errors({ Product: "Tools > Sprockets > Red sprocket" });
    expect(error).toMatchObject({ code: "invalid_choice" });
    expect(error!.message).toContain("level Family under Tools");
    expect(error!.message).toContain(': "Spanners".');
  });

  it("refuses an invalid third level, listing the choices under the second", () => {
    const [error] = errors({ Product: "Gadgets > Sprockets > Small widget" });
    expect(error).toMatchObject({ code: "invalid_choice" });
    expect(error!.message).toContain("level Model under Gadgets > Sprockets");
    expect(error!.message).toContain('"Blue sprocket", "Red sprocket"');
  });

  it("refuses a path longer than the field's levels", () => {
    const [error] = errors({ Shelf: "North > Top > Left" });
    expect(error).toMatchObject({ field: "Shelf", code: "invalid_choice" });
    expect(error!.message).toContain("2 levels");
  });

  it("refuses an empty level and a value that is not a string", () => {
    expect(errors({ Product: "Gadgets >  > Red sprocket" })[0]).toMatchObject({
      code: "invalid_choice",
    });
    expect(errors({ Product: "" })[0]).toMatchObject({ code: "invalid_choice" });
    expect(errors({ Product: ["Gadgets"] })[0]).toMatchObject({ code: "invalid_choice" });
  });
});

describe("ticketInput: fail-closed edges", () => {
  it("checks a field of another type against its list of choices", () => {
    const multi = {
      id: 2007,
      name: "cf_tags",
      label: "Tags",
      type: "custom_multi_select_dropdown",
      default: false,
      choices: ["A"],
    };
    const s = schema([multi]);
    expect(ticketInput(s, { Tags: { any: "object" } }, ALL).ok).toBe(false);
    expect(errors({ Tags: "B" }, s)[0]).toMatchObject({ code: "invalid_choice" });
    expect(body({ Tags: "a" }, s)).toEqual({ custom_fields: { cf_tags: "A" } });
  });

  it("refuses a field of another type whose choices are not a list", () => {
    const odd = {
      id: 2008,
      name: "cf_odd",
      label: "Odd",
      type: "custom_future_kind",
      default: false,
      choices: { Low: 1 },
    };
    expect(errors({ Odd: "Low" }, schema([odd]))[0]).toMatchObject({
      field: "Odd",
      code: "unsupported_field",
    });
  });

  it("passes a field of another type through when its choices are empty", () => {
    const text = {
      id: 2009,
      name: "cf_memo",
      label: "Memo",
      type: "custom_text",
      default: false,
      choices: [],
    };
    expect(body({ Memo: "hello" }, schema([text]))).toEqual({
      custom_fields: { cf_memo: "hello" },
    });
  });

  it("refuses a key whose value lands where another key's already did", () => {
    // A field named like a nested level of Product.
    const alias = {
      id: 2010,
      name: "cf_family",
      label: "Family alias",
      type: "custom_text",
      default: false,
    };
    expect(errors({ Product: "Tools", "Family alias": "x" }, schema([alias]))).toEqual([
      expect.objectContaining({ field: "Family alias", code: "duplicate_field" }),
    ]);
  });

  it("refuses a status name two ids share", () => {
    const s = schema();
    s.fields.find((f) => f.name === "status")!.choices = {
      "2": ["Open", "a"],
      "3": ["Open", "b"],
    };
    expect(errors({ Status: "Open" }, s)[0]).toMatchObject({ code: "ambiguous_choice" });
    expect(body({ Status: 3 }, s)).toEqual({ status: 3 });
  });

  it("refuses a status name that folds like two others, none exact", () => {
    const s = schema();
    s.fields.find((f) => f.name === "status")!.choices = {
      "2": ["Open", "a"],
      "3": ["OPEN", "b"],
    };
    expect(errors({ Status: "open" }, s)[0]).toMatchObject({ code: "ambiguous_choice" });
  });

  it("refuses an ambiguous choice on a nested level", () => {
    const sizes = {
      id: 2011,
      name: "cf_garment",
      label: "Garment",
      type: "nested_field",
      default: false,
      choices: { Shirt: ["XL", "xl"] },
      nested_ticket_fields: [{ name: "cf_fit", label: "Fit", level: 2 }],
    };
    expect(errors({ Garment: "Shirt > Xl" }, schema([sizes]))[0]).toMatchObject({
      code: "ambiguous_choice",
    });
  });

  it("refuses a status id given as a string", () => {
    expect(errors({ Status: "2" })[0]).toMatchObject({ code: "invalid_choice" });
  });

  it("does not offer a status whose key is not a whole number", () => {
    const s = schema();
    s.fields.find((f) => f.name === "status")!.choices = { "2": ["Open", "a"], x: ["Weird", "b"] };
    const [error] = errors({ Status: "Weird" }, s);
    expect(error).toMatchObject({ code: "invalid_choice" });
    expect(error!.message).not.toContain('Weird",');
    expect(error!.message).toContain('Valid choices: "Open".');
  });

  it("refuses a path whose separator is not exactly ' > '", () => {
    expect(errors({ Product: "Gadgets>Sprockets" })[0]).toMatchObject({ code: "invalid_choice" });
    expect(errors({ Product: "Gadgets >Sprockets" })[0]).toMatchObject({ code: "invalid_choice" });
  });

  it("clips a long echoed value and a long list of choices", () => {
    const many = {
      id: 2012,
      name: "cf_city",
      label: "City",
      type: "custom_dropdown",
      default: false,
      choices: Array.from({ length: 200 }, (_, i) => `Town number ${i}`),
    };
    const [error] = errors({ City: "z".repeat(5000) }, schema([many]));
    expect(error!.message.length).toBeLessThanOrEqual(500);
    expect(error!.message).toContain("…");
    expect(error!.message).toMatch(/… and \d+ more\.$/);
    expect(error!.message).not.toContain("z".repeat(100));
  });

  it("clips a message that quotes a long field label", () => {
    const long = {
      id: 2013,
      name: "cf_long",
      label: "L".repeat(1000),
      type: "custom_dropdown",
      default: false,
      choices: ["A"],
    };
    const [error] = errors({ cf_long: "B" }, schema([long]));
    expect(error!.message.length).toBeLessThanOrEqual(500);
  });

  it("clips a long key and caps the number of errors", () => {
    const input = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`k${i}`, 1]));
    const result = ticketInput(schema(), { ["q".repeat(1000)]: 1, ...input }, ALL);
    if (result.ok) throw new Error("expected an error");
    expect(result.error.errors).toHaveLength(50);
    expect(result.error.errors![0]!.field!.length).toBeLessThanOrEqual(500);
    expect(result.error.errors![0]!.message).not.toContain("q".repeat(100));
    expect(result.error.message).toContain("11 more problems are not listed");
  });
});

/** Default fields no set may hold: the fixtures lack description and due_by. */
const NEVER_FIELDS = [
  {
    id: 2101,
    name: "description",
    label: "Description",
    type: "default_description",
    default: true,
  },
  { id: 2102, name: "due_by", label: "Due by", type: "default_due_by", default: true },
];

/** Keys naming each of them alone (`product` alone is ambiguous in the fixture). */
const NEVER: Record<string, unknown> = {
  Catalogue: 7001,
  Requester: 9001,
  Subject: "Hi",
  Description: "Text",
  Source: "Email",
  "Due by": "2026-12-01T00:00:00Z",
};

const ENTRIES: WriteEntry[] = ["update_ticket", "categorize_tickets", "hand_off_draft", "add_note"];

/** One allowed field per set, with the body it builds; `add_note` has none. */
const ALLOWED: Record<WriteEntry, [Record<string, unknown>, Record<string, unknown>] | null> = {
  update_ticket: [
    { Status: "Closed", Priority: "High", Type: "Incident", Agent: 502, Group: 703, Hobby: "x" },
    {
      status: 5,
      priority: 3,
      type: "Incident",
      responder_id: 502,
      group_id: 703,
      custom_fields: { cf_hobby: "x" },
    },
  ],
  categorize_tickets: [{ Type: "Question" }, { type: "Question" }],
  hand_off_draft: [
    { Agent: 502, Group: 703 },
    { responder_id: 502, group_id: 703 },
  ],
  add_note: null,
};

/** One field outside each set. */
const OUTSIDE: Record<WriteEntry, Record<string, unknown>> = {
  update_ticket: { Subject: "Hi" },
  categorize_tickets: { Status: "Open" },
  hand_off_draft: { Type: "Question" },
  add_note: { Hobby: "x" },
};

function refused(
  allow: FieldSet,
  input: Record<string, unknown>,
  s: Schema = schema(NEVER_FIELDS),
) {
  const result = ticketInput(s, input, allow);
  if (result.ok) throw new Error(`expected an error, got ${JSON.stringify(result.body)}`);
  expect(result.error).toMatchObject({ code: "validation", http_status: null, retryable: false });
  return result.error.errors ?? [];
}

describe("ticketInput: allow sets", () => {
  it.each(ENTRIES.filter((entry) => ALLOWED[entry] !== null))(
    "%s: builds an allowed field",
    (entry) => {
      const [input, built] = ALLOWED[entry]!;
      expect(body(input, schema(NEVER_FIELDS), allowSet(entry))).toEqual(built);
    },
  );

  it.each(ENTRIES)(
    "%s: refuses a field outside the set as field_not_writable, naming the set's fields",
    (entry) => {
      const set = allowSet(entry);
      const [key] = Object.keys(OUTSIDE[entry]);
      const problems = refused(set, OUTSIDE[entry]);
      expect(problems).toEqual([
        expect.objectContaining({ field: key, code: "field_not_writable" }),
      ]);
      const message = problems[0]!.message;
      for (const name of set.defaults) expect(message).toContain(`"${name}"`);
      expect(message).toContain(set.custom ? "any custom field" : "no custom field");
      if (set.defaults.length === 0) expect(message).toContain("no default field");
    },
  );

  it.each(ENTRIES)(
    "%s: builds nothing when an allowed and a refused field come together",
    (entry) => {
      const allowed = ALLOWED[entry]?.[0] ?? {};
      const problems = refused(allowSet(entry), { ...allowed, ...OUTSIDE[entry] });
      expect(problems.map((p) => p.code)).toEqual(["field_not_writable"]);
    },
  );

  it.each(ENTRIES)(
    "%s: refuses product, requester, subject, description, source and due_by",
    (entry) => {
      expect(refused(allowSet(entry), NEVER)).toEqual(
        Object.keys(NEVER).map((key) =>
          expect.objectContaining({ field: key, code: "field_not_writable" }),
        ),
      );
    },
  );

  it("refuses a field no schema has as unknown, whatever the set", () => {
    // Without the synthetic due_by field, due_by is still refused.
    for (const entry of ENTRIES) {
      expect(refused(allowSet(entry), { due_by: "2026-12-01" }, schema())).toEqual([
        expect.objectContaining({ field: "due_by", code: "unknown_field" }),
      ]);
    }
  });

  it("add_note: refuses every field, custom included", () => {
    const s = schema(NEVER_FIELDS);
    // `product` alone is ambiguous in the fixture: its label names it alone.
    const input = Object.fromEntries(
      s.fields.map((field) => [field.name === "product" ? field.label : field.name, null]),
    );
    const problems = refused(allowSet("add_note"), input, s);
    expect(problems).toHaveLength(s.fields.length);
    for (const problem of problems) expect(problem.code).toBe("field_not_writable");
  });

  it("categorize_tickets: refuses status, priority, group and agent", () => {
    expect(
      refused(allowSet("categorize_tickets"), {
        Status: "Open",
        Priority: "Low",
        Group: 703,
        Agent: 502,
      }).map((p) => [p.field, p.code]),
    ).toEqual([
      ["Status", "field_not_writable"],
      ["Priority", "field_not_writable"],
      ["Group", "field_not_writable"],
      ["Agent", "field_not_writable"],
    ]);
  });

  it("categorize_tickets: takes any custom field, nested and added later included", () => {
    const later = {
      id: 2103,
      name: "cf_later",
      label: "Later",
      type: "custom_text",
      default: false,
    };
    expect(
      body(
        {
          Colour: "Teal",
          Product: "Tools > Spanners",
          Shelf: "North > Top",
          Hobby: "chess",
          Notes: null,
          Later: "x",
        },
        schema([later]),
        allowSet("categorize_tickets"),
      ),
    ).toEqual({
      custom_fields: {
        cf_colour: "Teal",
        cf_kit: "Tools",
        cf_family: "Spanners",
        cf_model: null,
        cf_shelf: "North",
        cf_tier: "Top",
        cf_hobby: "chess",
        cf_notes: null,
        cf_later: "x",
      },
    });
  });

  it("hand_off_draft: takes agent and group by name, built as their ids", () => {
    expect(
      body(
        { Agent: "ferro lumen", Group: "Widget Desk" },
        schema(NEVER_FIELDS),
        allowSet("hand_off_draft"),
      ),
    ).toEqual({ responder_id: 503, group_id: 702 });
  });

  it("checks the set before the value: a refused field's choices are not listed", () => {
    const [problem] = refused(allowSet("hand_off_draft"), { Status: "Nope" });
    expect(problem).toMatchObject({ code: "field_not_writable" });
    expect(problem!.message).not.toContain("Open");
  });

  it("takes a default field only by its own name, not a custom field named like it", () => {
    const lookalike = {
      id: 2104,
      name: "cf_status",
      label: "status",
      type: "custom_text",
      default: false,
    };
    // The key "status" is the default field's API name and the custom one's label.
    expect(
      refused({ defaults: [], custom: true }, { Status: "Open" }, schema([lookalike])),
    ).toEqual([expect.objectContaining({ code: "ambiguous_field" })]);
    expect(
      refused({ defaults: ["cf_status"], custom: false }, { cf_status: "x" }, schema([lookalike])),
    ).toEqual([expect.objectContaining({ code: "field_not_writable" })]);
  });

  it.each([
    ["no set", undefined],
    ["null", null],
    ["an empty object", {}],
    ["a string", "update_ticket"],
    ["defaults not an array", { defaults: "status", custom: true }],
    ["a default not a string", { defaults: [1], custom: true }],
    ["custom not a boolean", { defaults: [], custom: "yes" }],
    ["custom missing", { defaults: ["status"] }],
  ])("throws TypeError for %s", (_, allow) => {
    const call = ticketInput as (s: Schema, i: Record<string, unknown>, a?: unknown) => unknown;
    expect(() => call(schema(), { Status: "Open" }, allow)).toThrow(TypeError);
    expect(() => call(schema(), {}, allow)).toThrow(TypeError);
  });

  it("does not import src/core: the set is a plain value the caller passes", () => {
    const source = readFileSync(new URL("../../src/schema/input.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/from\s+["']\.\.\/core\//);
    expect(source).not.toMatch(/import\(\s*["']\.\.\/core\//);
  });
});
