import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FreshdeskError } from "../../src/client/errors.js";
import { HttpClient } from "../../src/client/http.js";
import { RateLimiter } from "../../src/client/rate-limit.js";
import {
  CURSOR_MAX_LENGTH,
  type ListCall,
  listEnvelope,
  readCursor,
} from "../../src/tools/list.js";
import { type MockAgent, mockDispatcher } from "../support/mock-dispatcher.js";

const CALL: ListCall = {
  tool: "list_tickets",
  args: { status: "Open", per_page: 30, tags: ["billing", "vip"], range: { from: "2026-11-01" } },
};

/** The cursor an envelope gives for `next` on `call`. */
function cursorFor(call: ListCall, next: number): string {
  const envelope = listEnvelope(call, { items: [], next, api_calls_used: 1 });
  expect(typeof envelope.next_cursor).toBe("string");
  return envelope.next_cursor as string;
}

function withCursor(call: ListCall, cursor: unknown): ListCall {
  return { tool: call.tool, args: { ...call.args, cursor } };
}

function refused(call: ListCall): FreshdeskError {
  const result = readCursor(call);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("unreachable");
  expect(result.error.code).toBe("validation");
  expect(result.error.http_status).toBeNull();
  expect(result.error.retryable).toBe(false);
  return result.error;
}

describe("listEnvelope", () => {
  it("always has items, has_more and api_calls_used; no next_cursor without more", () => {
    const envelope = listEnvelope(CALL, { items: [1, 2], api_calls_used: 3 });
    expect(envelope).toEqual({ items: [1, 2], has_more: false, api_calls_used: 3 });
    expect(Object.hasOwn(envelope, "next_cursor")).toBe(false);
    expect(Object.hasOwn(envelope, "truncated")).toBe(false);
  });

  it("an empty list with no call made still has every key", () => {
    expect(listEnvelope(CALL, { items: [], api_calls_used: 0 })).toEqual({
      items: [],
      has_more: false,
      api_calls_used: 0,
    });
  });

  it.each([0, 1, 250])("next %i gives has_more and a next_cursor", (next) => {
    const envelope = listEnvelope(CALL, { items: ["a"], next, api_calls_used: 1 });
    expect(envelope.has_more).toBe(true);
    expect(typeof envelope.next_cursor).toBe("string");
  });

  it("next_cursor is present exactly when has_more is true", () => {
    for (const next of [undefined, 0, 7]) {
      const envelope = listEnvelope(CALL, {
        items: [],
        ...(next === undefined ? {} : { next }),
        api_calls_used: 1,
      });
      expect(Object.hasOwn(envelope, "next_cursor")).toBe(envelope.has_more);
    }
  });

  it("a source cut by a cap gives truncated: true; an uncut one has no truncated", () => {
    expect(listEnvelope(CALL, { items: [], truncated: true, api_calls_used: 10 })).toEqual({
      items: [],
      has_more: false,
      truncated: true,
      api_calls_used: 10,
    });
    const uncut = listEnvelope(CALL, { items: [], truncated: false, api_calls_used: 1 });
    expect(Object.hasOwn(uncut, "truncated")).toBe(false);
  });

  it("truncated is carried beside has_more", () => {
    const envelope = listEnvelope(CALL, {
      items: [],
      next: 5,
      truncated: true,
      api_calls_used: 2,
    });
    expect(envelope.has_more).toBe(true);
    expect(envelope.truncated).toBe(true);
  });

  it.each([-1, 1.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "a next that is not a whole number (%s) throws",
    (next) => {
      expect(() => listEnvelope(CALL, { items: [], next, api_calls_used: 1 })).toThrow(TypeError);
    },
  );
});

describe("readCursor: round trip", () => {
  it("no cursor is position 0", () => {
    expect(readCursor(CALL)).toEqual({ ok: true, position: 0 });
  });

  it.each([0, 1, 100, 123_456, Number.MAX_SAFE_INTEGER])("position %i round-trips", (n) => {
    expect(readCursor(withCursor(CALL, cursorFor(CALL, n)))).toEqual({ ok: true, position: n });
  });

  it("decodes to a whole number only: the result has no other key", () => {
    const result = readCursor(withCursor(CALL, cursorFor(CALL, 42)));
    expect(Object.keys(result).sort()).toEqual(["ok", "position"]);
    if (!result.ok) throw new Error("unreachable");
    expect(Number.isSafeInteger(result.position)).toBe(true);
  });

  it("the argument order does not matter, at the top or nested", () => {
    const reordered: ListCall = {
      tool: CALL.tool,
      args: {
        range: { from: "2026-11-01" },
        tags: ["billing", "vip"],
        per_page: 30,
        status: "Open",
      },
    };
    expect(readCursor(withCursor(reordered, cursorFor(CALL, 9)))).toEqual({
      ok: true,
      position: 9,
    });
  });

  it("the cursor argument itself is not part of the digest", () => {
    const first = withCursor(CALL, cursorFor(CALL, 30));
    const second = cursorFor(first, 60);
    expect(readCursor(withCursor(CALL, second))).toEqual({ ok: true, position: 60 });
  });

  it("a cursor is short, and has no character a URL, host or path needs", () => {
    const cursor = cursorFor(CALL, Number.MAX_SAFE_INTEGER);
    expect(cursor.length).toBeLessThanOrEqual(CURSOR_MAX_LENGTH);
    expect(cursor).toMatch(/^[0-9]+\.[A-Za-z0-9_-]+$/);
  });
});

describe("readCursor: refused before anything is sent", () => {
  it("a cursor used with another tool", () => {
    const cursor = cursorFor(CALL, 30);
    refused(withCursor({ tool: "search_tickets", args: CALL.args }, cursor));
  });

  const changed: [string, Record<string, unknown>][] = [
    ["a value changed", { ...CALL.args, status: "Closed" }],
    ["a value's type changed", { ...CALL.args, per_page: "30" }],
    ["an argument added", { ...CALL.args, agent: "Ada" }],
    ["an argument added as null", { ...CALL.args, agent: null }],
    ["an argument removed", { status: "Open", per_page: 30, tags: ["billing", "vip"] }],
    ["an array's order changed", { ...CALL.args, tags: ["vip", "billing"] }],
    ["an array item added", { ...CALL.args, tags: ["billing", "vip", "x"] }],
    ["a nested value changed", { ...CALL.args, range: { from: "2026-11-02" } }],
    ["a nested key added", { ...CALL.args, range: { from: "2026-11-01", to: "2026-11-30" } }],
  ];
  it.each(changed)("a cursor used with %s", (_name, args) => {
    const cursor = cursorFor(CALL, 30);
    refused(withCursor({ tool: CALL.tool, args }, cursor));
  });

  it("a cursor whose position was edited (digest covers the position)", () => {
    const [, digest] = cursorFor(CALL, 30).split(".");
    for (const position of ["0", "29", "31", "60", "9007199254740991"]) {
      refused(withCursor(CALL, `${position}.${digest}`));
    }
  });

  it("a cursor whose digest was edited", () => {
    const cursor = cursorFor(CALL, 30);
    const last = cursor.at(-1) === "A" ? "B" : "A";
    refused(withCursor(CALL, cursor.slice(0, -1) + last));
  });

  it("a digest taken from another position", () => {
    const [, digest] = cursorFor(CALL, 60).split(".");
    refused(withCursor(CALL, `30.${digest}`));
  });

  it("a cursor over the length cap, even one that ends in a valid cursor", () => {
    const valid = cursorFor(CALL, 30);
    const error = refused(
      withCursor(CALL, "0".repeat(CURSOR_MAX_LENGTH + 1 - valid.length) + valid),
    );
    expect(error.message).toMatch(/longer/);
    refused(withCursor(CALL, "1".repeat(CURSOR_MAX_LENGTH + 1)));
    refused(withCursor(CALL, "x".repeat(1_000_000)));
  });

  const undecodable: [string, unknown][] = [
    ["empty", ""],
    ["no dot", "30"],
    ["no digest", "30."],
    ["no position", ".abc"],
    ["two dots", "1.2.abc"],
    ["negative", "-1.abc"],
    ["fraction", "1.5"],
    ["leading zero", "030.abc"],
    ["leading space", " 30.abc"],
    ["exponent", "1e3.abc"],
    ["over the safe integer", "9007199254740992.abc"],
    ["a URL", "https://evil.example/api/v2/tickets"],
    ["a host", "evil.example"],
    ["a path", "/api/v2/tickets?page=2"],
    ["a protocol-relative URL", "//evil.example/x"],
    ["base64 of a URL", Buffer.from("https://evil.example/").toString("base64")],
    ["a digest with a slash", `1.${"a".repeat(42)}/`],
    ["a number", 30],
    ["null", null],
    ["an object", { position: 30 }],
    ["an array", ["30"]],
  ];
  it.each(undecodable)("a cursor that does not decode: %s", (_name, cursor) => {
    const error = refused(withCursor(CALL, cursor));
    expect(error.message).not.toMatch(/longer/);
  });

  it("no refusal quotes the cursor", () => {
    const marker = "Zq9Marker";
    for (const cursor of [marker, `1.${marker}`, marker.repeat(20)]) {
      expect(refused(withCursor(CALL, cursor)).message).not.toContain(marker);
    }
  });
});

describe("readCursor before a request: nothing is sent on a refusal", () => {
  const DOMAIN = "acme.freshdesk.com";
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

  /** The shape every list tool takes: read the cursor, and only then send. */
  async function fakeTool(call: ListCall): Promise<FreshdeskError | number> {
    const cursor = readCursor(call);
    if (!cursor.ok) return cursor.error;
    const result = await http.request({
      method: "GET",
      path: "/tickets",
      query: { page: cursor.position + 1 },
    });
    return result.ok ? cursor.position : result.error;
  }

  function sent(): number {
    return (mock.getCallHistory()?.calls() ?? []).length;
  }

  it("a good cursor sends (the control)", async () => {
    mock
      .get(`https://${DOMAIN}`)
      .intercept({ path: "/api/v2/tickets?page=31", method: "GET" })
      .reply(200, [], { headers: { "content-type": "application/json" } });
    expect(await fakeTool(withCursor(CALL, cursorFor(CALL, 30)))).toBe(30);
    expect(sent()).toBe(1);
  });

  it.each([
    ["another tool", { tool: "search_tickets", args: { ...CALL.args } }],
    ["an argument changed", { tool: CALL.tool, args: { ...CALL.args, status: "Closed" } }],
  ])("a cursor used with %s", async (_name, call) => {
    const error = await fakeTool(withCursor(call, cursorFor(CALL, 30)));
    expect(error).toMatchObject({ code: "validation", http_status: null });
    expect(sent()).toBe(0);
  });

  it.each([
    ["over the cap", "1".repeat(CURSOR_MAX_LENGTH + 1)],
    ["not decoding", "https://evil.example/x"],
    ["a tampered digest", "30.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"],
  ])("a cursor %s", async (_name, cursor) => {
    const error = await fakeTool(withCursor(CALL, cursor));
    expect(error).toMatchObject({ code: "validation", http_status: null });
    expect(sent()).toBe(0);
  });
});
