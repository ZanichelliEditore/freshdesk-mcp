// T-067 (RFC 2026-11-25-write-safety-core): the core's write resources.
// `putTicket` and `postNote` send the body exactly as given, through
// `requestWithRetry`, so a write is retried on a 429 only and a 5xx comes
// back not retryable. T-080 (RFC 2026-11-26-send-safety-core): `postReply`
// and `postForward` are rows of the same table.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpClient } from "../../src/client/http.js";
import { RateLimiter } from "../../src/client/rate-limit.js";
import {
  postForward,
  postNote,
  postReply,
  putTicket,
  type WriteResult,
} from "../../src/core/resources.js";
import { conversationPages, ticketView } from "../fixtures/tickets.js";
import { type MockAgent, mockDispatcher } from "../support/mock-dispatcher.js";

const DOMAIN = "acme.freshdesk.com";
const ORIGIN = `https://${DOMAIN}`;
const JSON_TYPE = { "content-type": "application/json" };
/** Put in malformed answers: no error message may quote it. */
const CANARY = "Canary-Body-Text-4412";
const NOTE = conversationPages[0]![0]!;
/** Freshdesk's documented reply answer: no `incoming` or `private` (A1, unverified). */
const REPLY = {
  id: 6301,
  user_id: 5001,
  body: "<div>On it.</div>",
  body_text: "On it.",
  ticket_id: 42,
  cc_emails: [],
};
/** Freshdesk's documented forward answer (A2, unverified). */
const FORWARD = {
  id: 6302,
  user_id: 5001,
  body: "<div>Please look.</div>",
  body_text: "Please look.",
  ticket_id: 42,
  to_emails: [],
};

let mock: MockAgent;
let http: HttpClient;

beforeEach(() => {
  // Only the clock and timeouts are fake: the mock's replies need the rest.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
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
  vi.useRealTimers();
  vi.restoreAllMocks();
  await mock.close();
});

/** Runs the fake clock forward until the call settles. */
async function settle<T>(call: Promise<T>): Promise<T> {
  let result: { value: T } | undefined;
  void call.then((value) => {
    result = { value };
  });
  while (result === undefined) {
    await new Promise((resolve) => setImmediate(resolve));
    if (result === undefined) await vi.advanceTimersByTimeAsync(100);
  }
  return result.value;
}

function sent() {
  return mock.getCallHistory()!.calls();
}

function failure<T>(result: WriteResult<T>) {
  if (result.ok) throw new Error("expected an error");
  return result.error;
}

interface Write {
  name: string;
  call: (id: number, body: Record<string, unknown>) => Promise<WriteResult<unknown>>;
  method: "PUT" | "POST";
  path: (id: number) => string;
  answer: Record<string, unknown>;
  status: number;
  noun: string;
}

const writes: Write[] = [
  {
    name: "putTicket",
    call: (id, body) => putTicket(http, id, body),
    method: "PUT",
    path: (id) => `/api/v2/tickets/${id}`,
    answer: ticketView,
    status: 200,
    noun: "a ticket",
  },
  {
    name: "postNote",
    call: (id, body) => postNote(http, id, body),
    method: "POST",
    path: (id) => `/api/v2/tickets/${id}/notes`,
    answer: NOTE,
    status: 201,
    noun: "a note",
  },
  {
    name: "postReply",
    call: (id, body) => postReply(http, id, body),
    method: "POST",
    path: (id) => `/api/v2/tickets/${id}/reply`,
    answer: REPLY,
    status: 201,
    noun: "a reply",
  },
  {
    name: "postForward",
    call: (id, body) => postForward(http, id, body),
    method: "POST",
    path: (id) => `/api/v2/tickets/${id}/forward`,
    answer: FORWARD,
    status: 201,
    noun: "a forward",
  },
];

function on(write: Write, id: number) {
  return mock.get(ORIGIN).intercept({ path: write.path(id), method: write.method });
}

describe.each(writes)("$name", (write) => {
  it("sends the body exactly as given to the right path, and parses the answer", async () => {
    const body = { status: 4, custom_fields: { cf_colour: "Red", cf_x: null }, tags: ["a"] };
    on(write, 42).reply(write.status, write.answer, { headers: JSON_TYPE });

    const result = await settle(write.call(42, body));

    expect(result).toMatchObject({ ok: true, attempts: 1 });
    if (result.ok) expect(result.value).toMatchObject({ id: write.answer.id });
    const [call] = sent();
    expect(sent()).toHaveLength(1);
    expect(call!.method).toBe(write.method);
    expect(call!.path).toBe(write.path(42));
    expect(call!.headers).toMatchObject({ "content-type": "application/json" });
    expect(JSON.parse(call!.body as string)).toEqual(body);
  });

  it("sends an empty body as an empty object", async () => {
    on(write, 7).reply(write.status, write.answer, { headers: JSON_TYPE });

    await settle(write.call(7, {}));

    expect(JSON.parse(sent()[0]!.body as string)).toEqual({});
  });

  it.each([500, 502, 503])(
    "does not retry a %i and returns it with retryable: false",
    async (status) => {
      on(write, 42).reply(status, "");
      on(write, 42).reply(write.status, write.answer, { headers: JSON_TYPE });

      const result = await settle(write.call(42, { status: 2 }));

      expect(failure(result)).toMatchObject({
        code: "server",
        http_status: status,
        retryable: false,
      });
      expect(result.attempts).toBe(1);
      expect(sent()).toHaveLength(1);
    },
  );

  it.each([301, 302, 307])(
    "does not follow or retry a %i and returns it with retryable: false",
    async (status) => {
      on(write, 42).reply(status, "", { headers: { location: `${ORIGIN}/elsewhere` } });
      on(write, 42).reply(write.status, write.answer, { headers: JSON_TYPE });

      const result = await settle(write.call(42, { status: 2 }));

      expect(failure(result)).toMatchObject({
        code: "server",
        http_status: status,
        retryable: false,
      });
      expect(result.attempts).toBe(1);
      expect(sent()).toHaveLength(1);
    },
  );

  it("does not retry a timeout and returns it with retryable: false", async () => {
    on(write, 42).reply(write.status, write.answer, { headers: JSON_TYPE }).delay(60_000);
    on(write, 42).reply(write.status, write.answer, { headers: JSON_TYPE });

    const result = await settle(write.call(42, { status: 2 }));

    expect(failure(result)).toMatchObject({ code: "network", retryable: false });
    expect(sent()).toHaveLength(1);
  });

  it("retries a 429 after the limiter's wait, and counts both attempts", async () => {
    on(write, 42).reply(429, "", { headers: { "retry-after": "1" } });
    on(write, 42).reply(write.status, write.answer, { headers: JSON_TYPE });
    const started = Date.now();

    const result = await settle(write.call(42, { status: 2 }));

    expect(result).toMatchObject({ ok: true, attempts: 2 });
    expect(sent()).toHaveLength(2);
    expect(sent().map((call) => JSON.parse(call.body as string))).toEqual([
      { status: 2 },
      { status: 2 },
    ]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(1000);
  });

  it("gives up after four 429s, as rate_limited with every attempt counted", async () => {
    on(write, 42)
      .reply(429, "", { headers: { "retry-after": "1" } })
      .times(4);
    on(write, 42).reply(write.status, write.answer, { headers: JSON_TYPE });

    const result = await settle(write.call(42, { status: 2 }));

    expect(failure(result)).toMatchObject({ code: "rate_limited", http_status: 429 });
    expect(result.attempts).toBe(4);
    expect(sent()).toHaveLength(4);
  });

  it("sends the body as it read at the call on every attempt, whatever it answers later", async () => {
    on(write, 42).reply(429, "", { headers: { "retry-after": "1" } });
    on(write, 42).reply(write.status, write.answer, { headers: JSON_TYPE });
    let reads = 0;
    const body: Record<string, unknown> = {
      get private() {
        reads += 1;
        return reads === 1;
      },
    };
    const call = write.call(42, body);
    body.extra = "added later";

    const result = await settle(call);

    expect(result).toMatchObject({ ok: true, attempts: 2 });
    expect(sent().map((c) => JSON.parse(c.body as string))).toEqual([
      { private: true },
      { private: true },
    ]);
    expect(reads).toBe(1);
  });

  it.each<[string, () => Record<string, unknown>]>([
    ["whose top-level toJSON returns null", () => ({ toJSON: () => null })],
    ["whose top-level toJSON returns a string", () => ({ toJSON: () => "status=5" })],
    ["whose top-level toJSON returns a list", () => ({ toJSON: () => [{ status: 5 }] })],
    ["whose top-level toJSON returns undefined", () => ({ toJSON: () => undefined })],
  ])("refuses a body %s as validation, with nothing sent", async (_, body) => {
    const result = await settle(write.call(42, body()));

    expect(result).toEqual({
      ok: false,
      error: {
        code: "validation",
        http_status: null,
        message: "Not sent: the body is not a JSON object.",
        retryable: false,
      },
      attempts: 0,
    });
    expect(mock.getCallHistory()?.calls() ?? []).toHaveLength(0);
  });

  it.each<[string, () => Record<string, unknown>]>([
    ["a BigInt", () => ({ status: 10n })],
    [
      "a cycle",
      () => {
        const body: Record<string, unknown> = { status: 2 };
        body.self = body;
        return body;
      },
    ],
    [
      "a toJSON that throws",
      () => ({
        toJSON: () => {
          throw new Error("boom");
        },
      }),
    ],
  ])(
    "resolves a body holding %s to validation, with nothing sent, not a rejection",
    async (_, body) => {
      const result = await settle(write.call(42, body()));

      expect(result).toEqual({
        ok: false,
        error: {
          code: "validation",
          http_status: null,
          message: "Not sent: the body cannot be sent as JSON.",
          retryable: false,
        },
        attempts: 0,
      });
      expect(mock.getCallHistory()?.calls() ?? []).toHaveLength(0);
    },
  );

  it("returns a 4xx unchanged, not retried", async () => {
    on(write, 42).reply(
      400,
      { description: "Validation failed", errors: [{ field: "status", code: "invalid_value" }] },
      { headers: JSON_TYPE },
    );

    const result = await settle(write.call(42, { status: 99 }));

    expect(failure(result)).toMatchObject({ code: "validation", http_status: 400 });
    expect(sent()).toHaveLength(1);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1, Infinity, "42" as never])(
    "refuses id %s as validation, with nothing sent",
    async (id) => {
      const result = await settle(write.call(id, { status: 2 }));

      expect(result).toEqual({
        ok: false,
        error: {
          code: "validation",
          http_status: null,
          message: "Not sent: ticket id is not a valid value.",
          retryable: false,
        },
        attempts: 0,
      });
      expect(mock.getCallHistory()?.calls() ?? []).toHaveLength(0);
    },
  );

  it.each<[string, (answer: Record<string, unknown>) => unknown]>([
    ["an answer that is not an object", () => [CANARY]],
    ["an answer without an id", (answer) => ({ ...answer, id: undefined, note: CANARY })],
    ["an id that is not a whole number", (answer) => ({ ...answer, id: CANARY })],
    ["a fractional id", (answer) => ({ ...answer, id: 1.5 })],
    ["an empty object", () => ({})],
  ])("refuses %s as server, saying the write may be applied", async (_, edit) => {
    on(write, 42).reply(write.status, edit(write.answer) as object, { headers: JSON_TYPE });

    const result = await settle(write.call(42, { status: 2 }));

    expect(result).toEqual({
      ok: false,
      error: {
        code: "server",
        http_status: write.status,
        message: `Freshdesk sent ${write.noun} in an unexpected shape (HTTP ${write.status}): the write may have been applied.`,
        retryable: false,
      },
      attempts: 1,
    });
    expect(JSON.stringify(result)).not.toContain(CANARY);
    expect(sent()).toHaveLength(1);
  });
});

// T-080 review (RFC 2026-11-26-send-safety-core, OD-27): a send's answer
// hands the caller its conversation id and nothing else, so no address
// Freshdesk echoes can reach a tool; an id that is not positive is another
// shape (the send may have happened, but nothing names it).
describe.each(writes.filter((w) => w.name === "postReply" || w.name === "postForward"))(
  "$name's answer",
  (write) => {
    it("keeps the id alone, dropping every address and the body Freshdesk echoes", async () => {
      on(write, 42).reply(
        write.status,
        {
          ...write.answer,
          to_emails: ["someone@example.com"],
          cc_emails: ["other@example.com"],
          from_email: "support@example.com",
          note: CANARY,
        },
        { headers: JSON_TYPE },
      );

      const result = await settle(write.call(42, { body: "x" }));

      expect(result).toEqual({ ok: true, value: { id: write.answer.id }, attempts: 1 });
    });

    it.each([0, -1])("refuses an answer whose id is %i as server, not sent: true", async (id) => {
      on(write, 42).reply(write.status, { ...write.answer, id }, { headers: JSON_TYPE });

      const result = await settle(write.call(42, { body: "x" }));

      expect(failure(result)).toEqual({
        code: "server",
        http_status: write.status,
        message: `Freshdesk sent ${write.noun} in an unexpected shape (HTTP ${write.status}): the write may have been applied.`,
        retryable: false,
      });
      expect(result.attempts).toBe(1);
    });
  },
);
