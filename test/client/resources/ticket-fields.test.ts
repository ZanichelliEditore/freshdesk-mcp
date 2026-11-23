import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpClient } from "../../../src/client/http.js";
import { RateLimiter } from "../../../src/client/rate-limit.js";
import {
  listTicketFields,
  type TicketFieldsResult,
} from "../../../src/client/resources/ticket-fields.js";
import { nestedChoices, ticketFieldsPayload } from "../../fixtures/ticket-fields.js";
import { type MockAgent, mockDispatcher } from "../../support/mock-dispatcher.js";

const DOMAIN = "acme.freshdesk.com";
const ORIGIN = `https://${DOMAIN}`;
const PATH = "/api/v2/ticket_fields";
const JSON_TYPE = { "content-type": "application/json" };
/** Put in malformed bodies: no error message may quote it. */
const CANARY = "Canary-Body-Text-7781";

let mock: MockAgent;
let http: HttpClient;

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  mock = mockDispatcher();
  http = new HttpClient({
    domain: DOMAIN,
    apiKey: "k3y-Secret-Value-123",
    dispatcher: mock,
    limiter: new RateLimiter({ reserve_pct: 20, floor_pct: 5, pacing_rps: 2 }),
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await mock.close();
});

function reply(status: number, body: unknown) {
  mock
    .get(ORIGIN)
    .intercept({ path: PATH, method: "GET" })
    .reply(status, body as object, { headers: JSON_TYPE });
}

function fields(result: TicketFieldsResult) {
  if (!result.ok) throw new Error(`expected fields, got ${result.error.code}`);
  return result.fields;
}

function failure(result: TicketFieldsResult) {
  if (result.ok) throw new Error("expected an error");
  return result.error;
}

function clone(): Record<string, unknown>[] {
  return structuredClone(ticketFieldsPayload) as Record<string, unknown>[];
}

/** A payload with field `index` changed. */
function change(index: number, edit: (field: Record<string, unknown>) => void) {
  return () => {
    const payload = clone();
    edit(payload[index]!);
    return payload;
  };
}

describe("listTicketFields: a well-formed payload", () => {
  it("sends one GET to /ticket_fields and yields every field's label in order", async () => {
    reply(200, ticketFieldsPayload);

    const result = fields(await listTicketFields(http));

    expect(result.map((field) => field.label)).toEqual([
      "Subject",
      "Status",
      "Priority",
      "Colour",
      "Product",
    ]);
    expect(result.map((field) => field.name)).toEqual([
      "subject",
      "status",
      "priority",
      "cf_colour",
      "cf_kit",
    ]);
    const calls = mock.getCallHistory()!.calls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "GET", path: PATH });
  });

  it("yields the nested field's 3-level choice tree and its level labels", async () => {
    reply(200, ticketFieldsPayload);

    const product = fields(await listTicketFields(http)).find((f) => f.name === "cf_kit")!;

    expect(product.type).toBe("nested_field");
    expect(product.choices).toEqual({
      Gadgets: {
        Sprockets: ["Blue sprocket", "Red sprocket"],
        Widgets: ["Small widget"],
      },
      Tools: { Spanners: ["Left spanner", "Right spanner"] },
    });
    expect(product.nested_ticket_fields?.map((level) => [level.level, level.label])).toEqual([
      [2, "Family"],
      [3, "Model"],
    ]);
  });

  it("keeps a dropdown's list, a status's names and a priority's ids", async () => {
    reply(200, ticketFieldsPayload);

    const byName = new Map(fields(await listTicketFields(http)).map((f) => [f.name, f]));

    expect(byName.get("cf_colour")?.choices).toEqual(["Amber", "Teal"]);
    expect(byName.get("status")?.choices).toEqual({
      "2": ["Open", "Being processed"],
      "5": ["Closed", "This ticket is closed"],
    });
    expect(byName.get("priority")?.choices).toEqual({ Low: 1, Medium: 2, High: 3, Urgent: 4 });
    expect(byName.get("subject")?.choices).toBeUndefined();
  });

  it("passes keys it does not know through", async () => {
    const payload = clone();
    payload[0]!.portal_cc = "all";
    reply(200, payload);

    const [subject] = fields(await listTicketFields(http));

    expect(subject).toMatchObject({ portal_cc: "all", required_for_agents: true, id: 1001 });
  });

  it("accepts a 2-level nested tree and an empty list", async () => {
    const payload = clone();
    payload[4]!.choices = { Gadgets: ["Sprockets"] };
    reply(200, payload);
    expect(fields(await listTicketFields(http))[4]!.choices).toEqual({ Gadgets: ["Sprockets"] });

    reply(200, []);
    expect(fields(await listTicketFields(http))).toEqual([]);
  });

  it("takes a null `choices` or `nested_ticket_fields` as absent", async () => {
    const payload = clone();
    payload[0]!.choices = null;
    payload[4]!.nested_ticket_fields = null;
    reply(200, payload);

    const result = fields(await listTicketFields(http));

    expect(result[0]!.choices).toBeNull();
    expect(result[4]!.nested_ticket_fields).toBeNull();
    expect(result[4]!.choices).toEqual(nestedChoices);
  });
});

describe("listTicketFields: a `__proto__` key in the body", () => {
  // Sent as text: an object literal's `__proto__` would not be an own key.
  function replyText(text: string) {
    mock
      .get(ORIGIN)
      .intercept({ path: PATH, method: "GET" })
      .reply(200, text, { headers: JSON_TYPE });
  }
  const field = '"id":1,"name":"x","label":"x","type":"t","default":false';

  it("in `choices` does not change the parsed object's prototype", async () => {
    replyText(`[{${field},"choices":{"__proto__":["A"]}}]`);

    const [parsed] = fields(await listTicketFields(http));

    expect(Object.getPrototypeOf(parsed!.choices)).toBe(Object.prototype);
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });

  it("on a field does not change its prototype or Object's", async () => {
    replyText(`[{${field},"__proto__":{"polluted":"yes"}}]`);

    const [parsed] = fields(await listTicketFields(http));

    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    expect((parsed as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("listTicketFields: a malformed payload", () => {
  const cases: [string, () => unknown][] = [
    ["a body that is not a list", () => ({ fields: ticketFieldsPayload, note: CANARY })],
    ["a field that is not an object", () => [...clone(), CANARY]],
    [
      "a field without a label",
      () => {
        const p = clone();
        delete p[3]!.label;
        p[3]!.name = CANARY;
        return p;
      },
    ],
    [
      "a label that is not a string",
      () => {
        const p = clone();
        p[1]!.label = 42;
        return p;
      },
    ],
    [
      "an id that is not a whole number",
      () => {
        const p = clone();
        p[0]!.id = "1001";
        return p;
      },
    ],
    [
      "a choice tree with a number at the third level",
      () => {
        const p = clone();
        p[4]!.choices = { ...nestedChoices, Tools: { Spanners: [CANARY, 7] } };
        return p;
      },
    ],
    [
      "a choice tree four levels deep",
      () => {
        const p = clone();
        p[4]!.choices = { Gadgets: { Sprockets: { Blue: [CANARY] } } };
        return p;
      },
    ],
    [
      "a nested level without its level number",
      () => {
        const p = clone();
        p[4]!.nested_ticket_fields = [{ name: "cf_family", label: CANARY }];
        return p;
      },
    ],
    [
      "a nested level number that is not whole",
      change(4, (f) => {
        f.nested_ticket_fields = [{ name: "cf_family", label: "Family", level: 2.5 }];
      }),
    ],
    [
      "choices that mix ids and lists of names",
      change(2, (f) => {
        f.choices = { Low: 1, Medium: [CANARY] };
      }),
    ],
    [
      "an empty name",
      change(0, (f) => {
        f.name = "";
      }),
    ],
    [
      "an empty label",
      change(0, (f) => {
        f.label = "";
      }),
    ],
    [
      "a field without `default`",
      change(0, (f) => {
        delete f.default;
      }),
    ],
    [
      "a `default` that is not a boolean",
      change(0, (f) => {
        f.default = "false";
      }),
    ],
    [
      "a field without `type`",
      change(0, (f) => {
        delete f.type;
      }),
    ],
  ];

  it.each(cases)("refuses %s as server, with the real status and no body text", async (_, body) => {
    reply(200, body());

    const error = failure(await listTicketFields(http));

    expect(error).toEqual({
      code: "server",
      http_status: 200,
      message: "Freshdesk sent ticket fields in an unexpected shape (HTTP 200).",
      retryable: false,
    });
    expect(JSON.stringify(error)).not.toContain(CANARY);
  });

  it("reports the status the shape came with", async () => {
    reply(203, { note: CANARY });

    expect(failure(await listTicketFields(http))).toMatchObject({
      code: "server",
      http_status: 203,
    });
  });
});

describe("listTicketFields: an HTTP failure", () => {
  it("returns the client's error unchanged", async () => {
    reply(403, {});

    expect(failure(await listTicketFields(http))).toMatchObject({
      code: "forbidden",
      http_status: 403,
    });
  });
});

describe("listTicketFields: a caller's deadline", () => {
  it("is passed on: one already passed sends nothing and comes back as network", async () => {
    reply(200, ticketFieldsPayload);

    expect(failure(await listTicketFields(http, Date.now() - 1))).toMatchObject({
      code: "network",
      http_status: null,
      retryable: true,
    });
    expect(mock.getCallHistory()?.calls() ?? []).toHaveLength(0);
  });

  it("one still ahead leaves the list as it was", async () => {
    reply(200, ticketFieldsPayload);

    expect(fields(await listTicketFields(http, Date.now() + 5000))).toHaveLength(
      ticketFieldsPayload.length,
    );
  });
});
