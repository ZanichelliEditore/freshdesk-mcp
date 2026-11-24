import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpClient } from "../../../src/client/http.js";
import { RateLimiter } from "../../../src/client/rate-limit.js";
import { getCompany } from "../../../src/client/resources/companies.js";
import { getContact } from "../../../src/client/resources/contacts.js";
import { type MockAgent, mockDispatcher } from "../../support/mock-dispatcher.js";

const DOMAIN = "acme.freshdesk.com";
const ORIGIN = `https://${DOMAIN}`;
const JSON_TYPE = { "content-type": "application/json" };
/** Put in malformed bodies: no error message may quote it. */
const CANARY = "Canary-Body-Text-7781";

// Synthetic `GET /api/v2/contacts/{id}` and `GET /api/v2/companies/{id}`
// bodies in the shape Freshdesk's API v2 documents. Every name, number and
// address is invented. They carry the keys the module must drop.
const contactView = {
  id: 8801,
  name: "Ada Sprocket",
  email: "ada.sprocket@example.com",
  company_id: 9001,
  phone: "+00 000 0000001",
  mobile: "+00 000 0000002",
  address: "1 Nowhere Lane, Sampletown",
  twitter_id: "ada_sprocket_example",
  unique_external_id: "ext-8801",
  other_emails: ["ada.other@example.com"],
  job_title: "Chief Squeak Officer",
  description: "Prefers mornings.",
  custom_fields: { cf_birthday: "2000-01-01" },
  active: true,
  created_at: "2026-01-01T10:00:00Z",
};

const companyView = {
  id: 9001,
  name: "Widget Works",
  description: "Makes widgets.",
  note: "Pays late.",
  domains: ["widgetworks.example.com"],
  custom_fields: { cf_vat: "XX000000" },
  health_score: "Happy",
  account_tier: "Premium",
  created_at: "2026-01-01T10:00:00Z",
};

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

/** Queue one reply to `GET <pathname>`, whatever its query. */
function reply(pathname: string, status: number, body: unknown) {
  mock
    .get(ORIGIN)
    .intercept({ path: (path: string) => path.split("?")[0] === pathname, method: "GET" })
    .reply(status, body as object, { headers: JSON_TYPE });
}

function urls(): URL[] {
  return mock
    .getCallHistory()!
    .calls()
    .map((call) => new URL(call.fullUrl));
}

function ok<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error("expected a success");
  return result as Extract<T, { ok: true }>;
}

function failure<T extends { ok: boolean }>(result: T) {
  if (result.ok) throw new Error("expected an error");
  return (result as unknown as { error: { code: string; message: string } }).error;
}

/** A local `validation` naming the parameter, with no request sent. */
function expectRefused(result: { ok: boolean }, name: string) {
  expect(failure(result)).toEqual({
    code: "validation",
    http_status: null,
    message: `Not sent: ${name} is not a valid value.`,
    retryable: false,
  });
  expect(urls()).toHaveLength(0);
}

describe("getContact", () => {
  const VIEW = "/api/v2/contacts/8801";

  it("returns name, email and company id, and nothing else", async () => {
    reply(VIEW, 200, contactView);

    const result = ok(await getContact(http, 8801));

    // `toEqual` on the whole object: every other key, phone, mobile and
    // address among them, is absent.
    expect(result.contact).toEqual({
      name: "Ada Sprocket",
      email: "ada.sprocket@example.com",
      company_id: 9001,
    });
    expect(Object.keys(result.contact).sort()).toEqual(["company_id", "email", "name"]);
    expect(result.contact).not.toHaveProperty("phone");
    expect(result.contact).not.toHaveProperty("mobile");
    expect(result.contact).not.toHaveProperty("address");
    const text = JSON.stringify(result);
    for (const value of [contactView.phone, contactView.mobile, contactView.address]) {
      expect(text).not.toContain(value);
    }
    expect(result.attempts).toBe(1);
    const sent = urls();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.pathname).toBe(VIEW);
    expect(sent[0]!.search).toBe("");
  });

  it("gives company_id: null for a contact with no company", async () => {
    reply(VIEW, 200, { ...contactView, company_id: null });

    expect(ok(await getContact(http, 8801)).contact.company_id).toBeNull();
  });

  it("gives company_id: null when the key is missing", async () => {
    const withoutCompany: Record<string, unknown> = { ...contactView };
    delete withoutCompany.company_id;
    reply(VIEW, 200, withoutCompany);

    expect(ok(await getContact(http, 8801)).contact.company_id).toBeNull();
  });

  it("gives email: null for a contact with no email (a phone-only contact)", async () => {
    reply(VIEW, 200, { ...contactView, email: null });

    const contact = ok(await getContact(http, 8801)).contact;

    expect(contact).toEqual({ name: "Ada Sprocket", email: null, company_id: 9001 });
  });

  it.each([0, -1, 1.5, Number.NaN, 2 ** 53, "8801"])(
    "refuses the id %s with nothing sent",
    async (id) => {
      expectRefused(await getContact(http, id as number), "id");
    },
  );

  it("passes the deadline on: one already passed sends nothing and is network", async () => {
    reply(VIEW, 200, contactView);

    expect(failure(await getContact(http, 8801, Date.now() - 1))).toMatchObject({
      code: "network",
      http_status: null,
      retryable: true,
    });
    expect(urls()).toHaveLength(0);
  });

  it("returns a 404 as not_found", async () => {
    reply("/api/v2/contacts/8999", 404, { message: CANARY });

    const error = failure(await getContact(http, 8999));

    expect(error).toMatchObject({ code: "not_found", http_status: 404, retryable: false });
    expect(JSON.stringify(error)).not.toContain(CANARY);
  });

  it.each([
    ["a missing name", { ...contactView, name: undefined, description: CANARY }],
    ["a missing email key", { ...contactView, email: undefined, description: CANARY }],
    ["a numeric email", { ...contactView, email: 42, description: CANARY }],
    ["a string company_id", { ...contactView, company_id: CANARY }],
    ["a fractional company_id", { ...contactView, company_id: 1.5, description: CANARY }],
    ["an array", [contactView, CANARY]],
    ["null", null],
  ])("refuses %s as server, with no body text", async (_, body) => {
    reply(VIEW, 200, body);

    const error = failure(await getContact(http, 8801));

    expect(error).toEqual({
      code: "server",
      http_status: 200,
      message: "Freshdesk sent a contact in an unexpected shape (HTTP 200).",
      retryable: false,
    });
    expect(JSON.stringify(error)).not.toContain(CANARY);
  });
});

describe("getCompany", () => {
  const VIEW = "/api/v2/companies/9001";

  it("returns id and name, and nothing else", async () => {
    reply(VIEW, 200, companyView);

    const result = ok(await getCompany(http, 9001));

    expect(result.company).toEqual({ id: 9001, name: "Widget Works" });
    expect(Object.keys(result.company).sort()).toEqual(["id", "name"]);
    expect(result.attempts).toBe(1);
    const sent = urls();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.pathname).toBe(VIEW);
    expect(sent[0]!.search).toBe("");
  });

  it.each([0, -1, 1.5, Number.NaN, 2 ** 53, "9001"])(
    "refuses the id %s with nothing sent",
    async (id) => {
      expectRefused(await getCompany(http, id as number), "id");
    },
  );

  it("passes the deadline on: one already passed sends nothing and is network", async () => {
    reply(VIEW, 200, companyView);

    expect(failure(await getCompany(http, 9001, Date.now() - 1))).toMatchObject({
      code: "network",
      http_status: null,
      retryable: true,
    });
    expect(urls()).toHaveLength(0);
  });

  it("returns a 404 as not_found", async () => {
    reply("/api/v2/companies/9999", 404, { message: CANARY });

    const error = failure(await getCompany(http, 9999));

    expect(error).toMatchObject({ code: "not_found", http_status: 404, retryable: false });
    expect(JSON.stringify(error)).not.toContain(CANARY);
  });

  it.each([
    ["a missing name", { ...companyView, name: undefined, note: CANARY }],
    ["a null id", { ...companyView, id: null, note: CANARY }],
    ["a string id", { ...companyView, id: CANARY }],
    ["a numeric name", { ...companyView, name: 42, note: CANARY }],
    ["an array", [companyView, CANARY]],
  ])("refuses %s as server, with no body text", async (_, body) => {
    reply(VIEW, 200, body);

    const error = failure(await getCompany(http, 9001));

    expect(error).toEqual({
      code: "server",
      http_status: 200,
      message: "Freshdesk sent a company in an unexpected shape (HTTP 200).",
      retryable: false,
    });
    expect(JSON.stringify(error)).not.toContain(CANARY);
  });
});
