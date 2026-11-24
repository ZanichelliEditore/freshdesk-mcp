import { describe, expect, it } from "vitest";
import { MAX_QUERY_LENGTH } from "../../src/client/resources/search.js";
import type { TicketField } from "../../src/client/resources/ticket-fields.js";
import type { Ticket } from "../../src/client/resources/tickets.js";
import type { TeamConfig } from "../../src/config.js";
import { FrozenMap, type Schema } from "../../src/schema/index.js";
import { ticketKey } from "../../src/schema/output.js";
import {
  buildTicketQuery,
  fieldKey,
  isUncategorized,
  matchesLocal,
  type QueryContext,
  resolveFilter,
  type TicketFilters,
} from "../../src/tools/ticket-query.js";
import { rawTicket, schemaFieldsPayload } from "../fixtures/schema.js";

// Every name, label, tag and value here is invented.

const FIELDS = schemaFieldsPayload as TicketField[];

function schemaWith(
  overrides: {
    fields?: readonly TicketField[];
    agents?: [number, string][];
    groups?: [number, string][];
    agentsTruncated?: boolean;
    groupsTruncated?: boolean;
  } = {},
): Schema {
  return {
    fields: overrides.fields ?? FIELDS,
    agents: {
      names: new FrozenMap(
        overrides.agents ?? [
          [502, "Juniper Vantablack"],
          [503, "Orrin Quell"],
        ],
      ),
      truncated: overrides.agentsTruncated ?? false,
    },
    groups: {
      names: new FrozenMap(
        overrides.groups ?? [
          [703, "Spanner Desk"],
          [704, "Lantern Desk"],
        ],
      ),
      truncated: overrides.groupsTruncated ?? false,
    },
  };
}

function ctxWith(uncategorised_fields?: string[]): QueryContext {
  const team = {
    toolsets: ["core"],
    fields: {},
    forward_allow_list: [],
    limits: {
      reserve_pct: 20,
      floor_pct: 5,
      pacing_rps: 2,
      bulk_cap: 50,
      schema_ttl_s: 3600,
      call_budget: 250,
    },
    ...(uncategorised_fields === undefined ? {} : { uncategorised_fields }),
  } as TeamConfig;
  return { team };
}

function build(filters: TicketFilters, ctx = ctxWith(), schema = schemaWith()) {
  return buildTicketQuery(ctx, schema, filters);
}

function errorText(result: { ok: boolean; error?: { errors?: { message: string }[] } }): string {
  expect(result.ok).toBe(false);
  return (result.error?.errors ?? []).map((entry) => entry.message).join("\n");
}

const ticket = (custom: Record<string, unknown>, extra: Record<string, unknown> = {}): Ticket =>
  ({ ...rawTicket, ...extra, custom_fields: { ...rawTicket.custom_fields, ...custom } }) as Ticket;

describe("resolveFilter", () => {
  it.each([
    ["status", "Open", 2],
    ["status", " open ", 2],
    ["priority", "High", 3],
    ["type", "incident", "Incident"],
    ["group", "Spanner Desk", 703],
    ["agent", "juniper vantablack", 502],
  ] as const)("resolves %s %j by name to the fixture's id %j", (kind, name, id) => {
    expect(resolveFilter(schemaWith(), kind, name)).toEqual({ ok: true, value: id });
  });

  it.each([
    ["status", 5],
    ["priority", 1],
    ["type", "Question"],
    ["group", 704],
    ["agent", 503],
  ] as const)("resolves %s %j given by id to itself", (kind, id) => {
    expect(resolveFilter(schemaWith(), kind, id)).toEqual({ ok: true, value: id });
  });

  it("refuses an agent name two agents share, listing both ids", () => {
    const schema = schemaWith({
      agents: [
        [502, "Juniper Vantablack"],
        [509, "Juniper Vantablack"],
      ],
    });
    const result = resolveFilter(schema, "agent", "Juniper Vantablack");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("validation");
    expect(result.error.http_status).toBeNull();
    expect(result.error.errors?.[0]?.message).toMatch(/502, 509/);
  });

  it("refuses a group name two groups share, listing both ids", () => {
    const schema = schemaWith({
      groups: [
        [703, "Spanner Desk"],
        [708, "spanner desk"],
      ],
    });
    const text = errorText(resolveFilter(schema, "group", "Spanner Desk"));
    expect(text).toMatch(/703, 708/);
  });

  it.each([
    ["status", "Pending", ["Open", "Closed"]],
    ["priority", "Huge", ["Low", "Urgent"]],
    ["type", "Riddle", ["Question", "Incident"]],
    ["group", "Nowhere Desk", ["Spanner Desk", "Lantern Desk"]],
    ["agent", "Nobody", ["Juniper Vantablack", "Orrin Quell"]],
  ] as const)("refuses an unknown %s name, listing the valid ones", (kind, name, valid) => {
    const text = errorText(resolveFilter(schemaWith(), kind, name));
    for (const option of valid) expect(text).toContain(option);
  });

  it("clips a long list of valid names", () => {
    const groups = Array.from({ length: 200 }, (_, i): [number, string] => [i + 1, `Desk ${i}`]);
    const text = errorText(resolveFilter(schemaWith({ groups }), "group", "Nowhere"));
    expect(text).toMatch(/and \d+ more/);
    expect(text.length).toBeLessThan(600);
  });

  it.each(["agent", "group"] as const)(
    "says the %s list is incomplete for a name not found in a truncated list",
    (kind) => {
      const schema = schemaWith({ agentsTruncated: true, groupsTruncated: true });
      const text = errorText(resolveFilter(schema, kind, "Nobody"));
      expect(text).toMatch(/incomplete/);
      expect(text).toMatch(/id/);
    },
  );

  it("refuses an agent id the complete list lacks, and accepts it when the list is truncated", () => {
    expect(errorText(resolveFilter(schemaWith(), "agent", 999))).toMatch(/999/);
    expect(resolveFilter(schemaWith({ agentsTruncated: true }), "agent", 999)).toEqual({
      ok: true,
      value: 999,
    });
  });

  it("refuses a status id the field does not have", () => {
    expect(errorText(resolveFilter(schemaWith(), "status", 9))).toContain("Open");
  });

  it("refuses a filter whose field the account lacks", () => {
    const fields = FIELDS.filter((field) => field.type !== "default_ticket_type");
    expect(errorText(resolveFilter(schemaWith({ fields }), "type", "Incident"))).toMatch(/type/i);
  });

  it("refuses a value of the wrong kind", () => {
    expect(resolveFilter(schemaWith(), "agent", true as unknown as string).ok).toBe(false);
    expect(resolveFilter(schemaWith(), "agent", 1.5).ok).toBe(false);
  });
});

describe("buildTicketQuery: the nine filters", () => {
  it.each([
    [{ status: "Open" }, "status:2"],
    [{ priority: "High" }, "priority:3"],
    [{ group: "Spanner Desk" }, "group_id:703"],
    [{ agent: 502 }, "agent_id:502"],
    [{ type: "incident" }, "type:'Incident'"],
    [{ tag: "billing" }, "tag:'billing'"],
  ] as [TicketFilters, string][])("%j gives the search query %j", (filters, query) => {
    expect(build(filters)).toEqual({ ok: true, endpoint: "search", query });
  });

  it("created_between is a search widened by a day each side, with the exact days checked locally", () => {
    expect(build({ created_between: { from: "2026-01-01", to: "2026-01-31" } })).toEqual({
      ok: true,
      endpoint: "search",
      query: "created_at:>'2025-12-31' AND created_at:<'2026-02-01'",
      created_between: { from: "2026-01-01", to: "2026-01-31" },
    });
  });

  it("created_between of one day is accepted, and the local check keeps that day only", () => {
    const result = build({ created_between: { from: "2026-03-01", to: "2026-03-01" } });
    expect(result).toMatchObject({
      ok: true,
      query: "created_at:>'2026-02-28' AND created_at:<'2026-03-02'",
    });
    if (!result.ok) throw new Error("expected ok");
    const at = (created_at: unknown) => ticket({}, { created_at });
    expect(matchesLocal(result, at("2026-03-01T00:00:00Z"))).toBe(true);
    expect(matchesLocal(result, at("2026-03-01T23:59:59Z"))).toBe(true);
    expect(matchesLocal(result, at("2026-03-02T00:30:00+01:00"))).toBe(true);
    expect(matchesLocal(result, at("2026-02-28T23:59:59Z"))).toBe(false);
    expect(matchesLocal(result, at("2026-03-02T00:00:00Z"))).toBe(false);
    expect(matchesLocal(result, at(undefined))).toBe(false);
    expect(matchesLocal(result, at("soon"))).toBe(false);
  });

  it("updated_since alone is the list endpoint's parameter, as a UTC instant", () => {
    expect(build({ updated_since: "2026-01-02T12:30:00+01:00" })).toEqual({
      ok: true,
      endpoint: "list",
      list: { updated_since: "2026-01-02T11:30:00Z" },
    });
  });

  it("uncategorized alone is the list endpoint with the local check", () => {
    expect(build({ uncategorized: true })).toEqual({
      ok: true,
      endpoint: "list",
      list: {},
      uncategorized: [{ field: "cf_kit", key: "cf_model", custom: true }],
    });
  });

  it("no filter is the list endpoint with no parameter; uncategorized false is no filter", () => {
    const plain = { ok: true, endpoint: "list", list: {} };
    expect(build({})).toEqual(plain);
    expect(build({ uncategorized: false })).toEqual(plain);
  });

  it("joins several filters with AND, updated_since as a day of updated_at", () => {
    expect(
      build({
        status: "Open",
        agent: "Orrin Quell",
        tag: "late reply",
        updated_since: "2026-01-02T23:30:00-02:00",
        uncategorized: true,
      }),
    ).toEqual({
      ok: true,
      endpoint: "search",
      query: "status:2 AND agent_id:503 AND tag:'late reply' AND updated_at:>'2026-01-02'",
      uncategorized: [{ field: "cf_kit", key: "cf_model", custom: true }],
      updated_since: "2026-01-03T01:30:00Z",
    });
  });

  it("with a search filter, updated_since is a day earlier in the query and the instant checked locally", () => {
    const result = build({ status: "Open", updated_since: "2026-01-01T10:00:00Z" });
    expect(result).toEqual({
      ok: true,
      endpoint: "search",
      query: "status:2 AND updated_at:>'2025-12-31'",
      updated_since: "2026-01-01T10:00:00Z",
    });
    if (!result.ok) throw new Error("expected ok");
    const at = (updated_at: unknown) => ticket({}, { updated_at });
    expect(matchesLocal(result, at("2026-01-01T10:00:00Z"))).toBe(true);
    expect(matchesLocal(result, at("2026-01-01T11:00:00+01:00"))).toBe(true);
    expect(matchesLocal(result, at("2026-01-01T09:59:59Z"))).toBe(false);
    expect(matchesLocal(result, at(undefined))).toBe(false);
  });

  it("matchesLocal with no local check keeps every ticket, and applies uncategorized", () => {
    const plain = build({ status: "Open" });
    if (!plain.ok) throw new Error("expected ok");
    expect(matchesLocal(plain, ticket({ cf_model: null }))).toBe(true);
    const checked = build({ status: "Open", uncategorized: true });
    if (!checked.ok) throw new Error("expected ok");
    expect(matchesLocal(checked, ticket({ cf_model: null }))).toBe(true);
    expect(matchesLocal(checked, ticket({}))).toBe(false);
  });

  it.each([1, "yes", null])("refuses a non-boolean uncategorized %j", (value) => {
    const text = errorText(build({ uncategorized: value as unknown as boolean }));
    expect(text).toMatch(/uncategorized/);
  });

  it("uncategorized with updated_since only stays on the list endpoint", () => {
    expect(build({ uncategorized: true, updated_since: "2026-01-02T00:00:00Z" })).toMatchObject({
      ok: true,
      endpoint: "list",
      list: { updated_since: "2026-01-02T00:00:00Z" },
    });
  });
});

describe("buildTicketQuery: values cannot add a clause", () => {
  it("keeps a tag containing ' OR ' one quoted value", () => {
    expect(build({ tag: "late OR tag:early" })).toEqual({
      ok: true,
      endpoint: "search",
      query: "tag:'late OR tag:early'",
    });
  });

  it.each([
    "x' OR tag:'y",
    'x" OR tag:"y',
    "x\\' OR status:2",
    "a\\b",
    "a\nOR b",
    "a\u0000b",
    "a\u200Bb",
  ])("refuses the tag %j, which cannot be quoted safely, with no query", (tag) => {
    const result = build({ status: "Open", tag });
    expect(result).not.toHaveProperty("query");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("validation");
    expect(result.error.errors?.[0]?.field).toBe("tag");
  });

  it("refuses a blank tag", () => {
    expect(build({ tag: "  " }).ok).toBe(false);
  });

  it("refuses a ticket type whose own name cannot be quoted", () => {
    const fields = FIELDS.map((field) =>
      field.type === "default_ticket_type" ? { ...field, choices: ["Rock'n'roll"] } : field,
    );
    const text = errorText(build({ type: "Rock'n'roll" }, ctxWith(), schemaWith({ fields })));
    expect(text).toMatch(/quote/);
  });

  it("refuses a ticket type whose own name holds a control character", () => {
    const fields = FIELDS.map((field) =>
      field.type === "default_ticket_type" ? { ...field, choices: ["Line\nbreak"] } : field,
    );
    expect(build({ type: "Line\nbreak" }, ctxWith(), schemaWith({ fields })).ok).toBe(false);
  });

  it("names the choices of an ambiguous type through plainName", () => {
    const fields = FIELDS.map((field) =>
      field.type === "default_ticket_type"
        ? { ...field, choices: ["<b>Incident</b>", "<B>incident</B>"] }
        : field,
    );
    const text = errorText(resolveFilter(schemaWith({ fields }), "type", "<b>incident</b>"));
    expect(text).not.toContain("<b>Incident</b>");
    expect(text).toMatch(/several/);
  });

  it("accepts a query of exactly Freshdesk's length, quotes included", () => {
    // "tag:'…'" is the tag plus 8 characters.
    const tag = "t".repeat(MAX_QUERY_LENGTH - 8);
    const result = build({ tag });
    expect(result).toEqual({ ok: true, endpoint: "search", query: `tag:'${tag}'` });
    expect(`"tag:'${tag}'"`).toHaveLength(MAX_QUERY_LENGTH);
    expect(build({ tag: `${tag}t` }).ok).toBe(false);
  });

  it("refuses filters whose query would pass Freshdesk's length", () => {
    const tag = "t".repeat(MAX_QUERY_LENGTH);
    expect(errorText(build({ tag }))).toMatch(String(MAX_QUERY_LENGTH));
  });
});

describe("buildTicketQuery: dates", () => {
  it.each([
    "2026-01-02T12:30:00",
    "2026-01-02T12:30:00+0100",
    "2026-02-30T00:00:00Z",
    "2026-01-02",
    "yesterday",
    "2026-01-02T25:00:00Z",
    "2026-01-02T12:60:00Z",
    "2026-01-02T12:00:00+24:00",
  ])("refuses updated_since %j", (value) => {
    expect(errorText(build({ updated_since: value }))).toMatch(/updated_since|ISO/);
  });

  it.each([
    [{ from: "2026-02-30", to: "2026-03-05" }],
    [{ from: "2026-1-2", to: "2026-03-05" }],
    [{ from: "2026-03-05", to: "2026-03-01" }],
    [{ from: "2026-03-05" }],
  ])("refuses created_between %j", (range) => {
    expect(build({ created_between: range as { from: string; to: string } }).ok).toBe(false);
  });

  it("reports every problem in one validation error", () => {
    const result = build({ status: "Pending", agent: "Nobody", tag: "a'b" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/nothing was sent/);
    expect(result.error.errors?.map((entry) => entry.field)).toEqual(["status", "agent", "tag"]);
  });
});

describe("uncategorized", () => {
  it("follows the default rule: the last level of the first nested field", () => {
    const checks = build({ uncategorized: true });
    if (!checks.ok) throw new Error("expected ok");
    const keys = checks.uncategorized ?? [];
    expect(isUncategorized(keys, ticket({ cf_model: null }))).toBe(true);
    expect(isUncategorized(keys, ticket({ cf_model: "" }))).toBe(true);
    const absent: Record<string, unknown> = { ...rawTicket.custom_fields };
    delete absent.cf_model;
    expect(isUncategorized(keys, { ...rawTicket, custom_fields: absent } as Ticket)).toBe(true);
    expect(isUncategorized(keys, ticket({}))).toBe(false);
    // Another nested field, empty, is not the default rule's.
    expect(isUncategorized(keys, ticket({ cf_tier: null }))).toBe(false);
  });

  it.each([
    [["Colour"], [{ field: "cf_colour", key: "cf_colour", custom: true }]],
    [["cf_shelf"], [{ field: "cf_shelf", key: "cf_tier", custom: true }]],
    // A level's name selects its nested field, as rows.ts does.
    [[" tier "], [{ field: "cf_shelf", key: "cf_tier", custom: true }]],
    [["Family"], [{ field: "cf_kit", key: "cf_model", custom: true }]],
    [
      ["Type", "Group"],
      [
        { field: "group", key: "group_id", custom: false },
        { field: "ticket_type", key: "type", custom: false },
      ],
    ],
  ])("follows uncategorised_fields %j", (listed, expected) => {
    const result = build({ uncategorized: true }, ctxWith(listed));
    if (!result.ok) throw new Error("expected ok");
    expect(result.uncategorized).toEqual(expect.arrayContaining(expected));
    expect(result.uncategorized).toHaveLength(expected.length);
  });

  it("with uncategorised_fields set, a ticket with any listed field empty", () => {
    const result = build({ uncategorized: true }, ctxWith(["Colour", "Tier"]));
    if (!result.ok) throw new Error("expected ok");
    const keys = result.uncategorized ?? [];
    expect(isUncategorized(keys, ticket({}))).toBe(false);
    expect(isUncategorized(keys, ticket({ cf_colour: null }))).toBe(true);
    expect(isUncategorized(keys, ticket({ cf_tier: "" }))).toBe(true);
    // The default rule's field is not listed: its emptiness does not count.
    expect(isUncategorized(keys, ticket({ cf_model: null }))).toBe(false);
  });

  it("reads a default field at the ticket's top level", () => {
    const result = build({ uncategorized: true }, ctxWith(["Group"]));
    if (!result.ok) throw new Error("expected ok");
    const keys = result.uncategorized ?? [];
    expect(isUncategorized(keys, ticket({}, { group_id: null }))).toBe(true);
    expect(isUncategorized(keys, ticket({}, { group_id: 703 }))).toBe(false);
  });

  it("is refused when no field defines it", () => {
    const fields = FIELDS.filter((field) => field.type !== "nested_field");
    expect(errorText(build({ uncategorized: true }, ctxWith(), schemaWith({ fields })))).toMatch(
      /uncategori/,
    );
    expect(errorText(build({ uncategorized: true }, ctxWith(["No such field"])))).toMatch(
      /uncategori/,
    );
  });

  it("finds a field where output.ts reads it", () => {
    for (const field of FIELDS) {
      expect(fieldKey(field.name, field.default)).toBe(ticketKey(field.name, field.default));
    }
  });
});
