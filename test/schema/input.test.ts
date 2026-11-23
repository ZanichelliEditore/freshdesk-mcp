import { describe, expect, it } from "vitest";
import type { FieldError } from "../../src/client/errors.js";
import type { TicketField } from "../../src/client/resources/ticket-fields.js";
import type { Schema } from "../../src/schema/index.js";
import { ticketInput } from "../../src/schema/input.js";
import { schemaFieldsPayload } from "../fixtures/schema.js";

/** A schema built by hand: the mapping needs no HTTP, nor agents or groups. */
function schema(extra: object[] = []): Schema {
  return {
    fields: structuredClone([...schemaFieldsPayload, ...extra]) as TicketField[],
    agents: { names: new Map(), truncated: false },
    groups: { names: new Map(), truncated: false },
  };
}

function body(input: Record<string, unknown>, s: Schema = schema()) {
  const result = ticketInput(s, input);
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.body;
}

function errors(input: Record<string, unknown>, s: Schema = schema()): FieldError[] {
  const result = ticketInput(s, input);
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
      label: "Café",
      type: "custom_text",
      default: false,
    };
    expect(body({ CAFÉ: "x" }, schema([accented]))).toEqual({
      custom_fields: { cf_cafe: "x" },
    });
  });

  it("matches an API name exactly: case counts", () => {
    expect(errors({ CF_COLOUR: "Teal" })).toEqual([
      expect.objectContaining({ field: "CF_COLOUR", code: "unknown_field" }),
    ]);
  });

  it("prefers an API name to another field's label", () => {
    // `product` is the API name of "Catalogue"; "Product" is the label of cf_kit.
    expect(body({ product: 7001 })).toEqual({ product_id: 7001 });
    expect(body({ Product: "Tools" })).toEqual({ custom_fields: { cf_kit: "Tools" } });
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
    expect(error!.message).toContain("Amber, Teal");
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
    expect(status!.message).toContain("Open, Closed");
    expect(priority!.message).toContain("Low, Medium, High, Urgent");
    expect(source!.message).toContain("Email, Portal, Phone");
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

  it("accepts a path that stops before the last level", () => {
    expect(body({ Product: "Gadgets > Widgets" })).toEqual({
      custom_fields: { cf_kit: "Gadgets", cf_family: "Widgets" },
    });
    expect(body({ Product: "Tools" })).toEqual({ custom_fields: { cf_kit: "Tools" } });
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
    expect(error!.message).toContain("Gadgets, Tools");
  });

  it("refuses an invalid second level, listing the choices under the first", () => {
    const [error] = errors({ Product: "Tools > Sprockets > Red sprocket" });
    expect(error).toMatchObject({ code: "invalid_choice" });
    expect(error!.message).toContain("level Family under Tools");
    expect(error!.message).toContain(": Spanners.");
  });

  it("refuses an invalid third level, listing the choices under the second", () => {
    const [error] = errors({ Product: "Gadgets > Sprockets > Small widget" });
    expect(error).toMatchObject({ code: "invalid_choice" });
    expect(error!.message).toContain("level Model under Gadgets > Sprockets");
    expect(error!.message).toContain("Blue sprocket, Red sprocket");
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
