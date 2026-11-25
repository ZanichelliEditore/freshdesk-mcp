import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FreshdeskError } from "../../src/client/errors.js";
import { HttpClient } from "../../src/client/http.js";
import { RateLimiter } from "../../src/client/rate-limit.js";
import {
  CURSOR_MAX_LENGTH,
  type CursorResult,
  type IdsCursorResult,
  idsCursor,
  idsCursorMaxLength,
  type ListCall,
  listEnvelope,
  readCursor,
  readIdsCursor,
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

/** A bound no test position reaches, for the cases that test something else. */
const ANY = Number.MAX_SAFE_INTEGER;

function withCursor(call: ListCall, cursor: unknown): ListCall {
  return { tool: call.tool, args: { ...call.args, cursor } };
}

function refused(call: ListCall): FreshdeskError {
  const result = readCursor(call, ANY);
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
    expect(readCursor(CALL, ANY)).toEqual({ ok: true, position: 0 });
  });

  it.each([0, 1, 100, 123_456, Number.MAX_SAFE_INTEGER])("position %i round-trips", (n) => {
    expect(readCursor(withCursor(CALL, cursorFor(CALL, n)), ANY)).toEqual({
      ok: true,
      position: n,
    });
  });

  it("decodes to a whole number only: the result has no other key", () => {
    const result = readCursor(withCursor(CALL, cursorFor(CALL, 42)), ANY);
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
    expect(readCursor(withCursor(reordered, cursorFor(CALL, 9)), ANY)).toEqual({
      ok: true,
      position: 9,
    });
  });

  it("the cursor argument itself is not part of the digest", () => {
    const first = withCursor(CALL, cursorFor(CALL, 30));
    const second = cursorFor(first, 60);
    expect(readCursor(withCursor(CALL, second), ANY)).toEqual({ ok: true, position: 60 });
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

describe("readCursor: non-canonical forms carrying the real digest", () => {
  const digestOf = (n: number): string => cursorFor(CALL, n).split(".")[1] as string;
  it.each([
    ["a leading zero", () => `030.${digestOf(30)}`],
    ["an exponent", () => `1e3.${digestOf(1000)}`],
    ["a leading space", () => ` 30.${digestOf(30)}`],
    ["hexadecimal", () => `0x1e.${digestOf(30)}`],
  ])("%s is refused as not this server's", (_name, make) => {
    const error = refused(withCursor(CALL, make()));
    expect(error.message).toMatch(/not one this server gave/);
  });
});

describe("readCursor: the tool's maximum position", () => {
  it("the maximum is accepted, one above it refused", () => {
    expect(readCursor(withCursor(CALL, cursorFor(CALL, 100)), 100)).toEqual({
      ok: true,
      position: 100,
    });
    const result = readCursor(withCursor(CALL, cursorFor(CALL, 101)), 100);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toMatchObject({ code: "validation", http_status: null, retryable: false });
    expect(result.error.message).toMatch(/past the last position/);
    expect(result.error.message).not.toContain("101");
  });

  it("a maximum of 0 accepts no cursor and position 0 only", () => {
    expect(readCursor(CALL, 0)).toEqual({ ok: true, position: 0 });
    expect(readCursor(withCursor(CALL, cursorFor(CALL, 0)), 0)).toEqual({ ok: true, position: 0 });
    expect(readCursor(withCursor(CALL, cursorFor(CALL, 1)), 0).ok).toBe(false);
  });

  it.each([-1, 1.5, Number.NaN, Infinity, "100" as unknown as number])(
    "a maximum of %o throws",
    (max) => {
      expect(() => readCursor(CALL, max)).toThrow(TypeError);
    },
  );

  it("no maximum does not type-check, and through a cast throws", () => {
    const at101 = withCursor(CALL, cursorFor(CALL, 101));
    // @ts-expect-error -- maxPosition is required: no list tool reads a cursor without its bound.
    expect(() => readCursor(at101)).toThrow(TypeError);
    const unbound = readCursor as (call: ListCall, maxPosition?: number) => CursorResult;
    for (const call of [CALL, at101]) {
      expect(() => unbound(call)).toThrow(TypeError);
      expect(() => unbound(call, undefined)).toThrow(TypeError);
    }
  });
});

describe("arguments are the raw JSON ones: anything else throws", () => {
  class Filter {
    status = "Open";
  }
  const notJson: [string, unknown][] = [
    ["a Date", new Date(0)],
    ["a Map", new Map([["a", 1]])],
    ["a Set", new Set([1])],
    ["a class instance", new Filter()],
    ["NaN", Number.NaN],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
    ["a BigInt", 10n],
    ["a function", () => 1],
    ["a symbol", Symbol("x")],
  ];
  it.each(notJson)("%s, at the top, in an array or in an object", (_name, value) => {
    for (const args of [{ x: value }, { x: [value] }, { x: { y: value } }]) {
      const call: ListCall = { tool: CALL.tool, args };
      expect(() => listEnvelope(call, { items: [], next: 1, api_calls_used: 1 })).toThrow(
        TypeError,
      );
      expect(() =>
        readCursor({ tool: CALL.tool, args: { ...args, cursor: "1.x" } }, ANY),
      ).not.toThrow();
      const good = cursorFor({ tool: CALL.tool, args: {} }, 1);
      expect(() => readCursor({ tool: CALL.tool, args: { ...args, cursor: good } }, ANY)).toThrow(
        TypeError,
      );
    }
  });

  it("a null-prototype object is a plain object", () => {
    const args = Object.assign(Object.create(null) as Record<string, unknown>, { status: "Open" });
    const cursor = cursorFor({ tool: CALL.tool, args }, 5);
    expect(readCursor({ tool: CALL.tool, args: { status: "Open", cursor } }, ANY)).toEqual({
      ok: true,
      position: 5,
    });
  });

  it("-0 is the same argument as 0, as in JSON", () => {
    const cursor = cursorFor({ tool: CALL.tool, args: { n: 0 } }, 5);
    expect(readCursor({ tool: CALL.tool, args: { n: -0, cursor } }, ANY)).toEqual({
      ok: true,
      position: 5,
    });
  });

  it("an undefined argument is an absent one", () => {
    const cursor = cursorFor({ tool: CALL.tool, args: {} }, 5);
    expect(readCursor({ tool: CALL.tool, args: { agent: undefined, cursor } }, ANY)).toEqual({
      ok: true,
      position: 5,
    });
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

  /** The last position the fake tool serves: each list tool passes its own. */
  const MAX_POSITION = 100;

  /** The shape every list tool takes: read the cursor against its bound, and only then send. */
  async function fakeTool(call: ListCall): Promise<FreshdeskError | number> {
    const cursor = readCursor(call, MAX_POSITION);
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

describe("the ids form (T-066)", () => {
  const BOUND = 30;
  const MAX = Number.MAX_SAFE_INTEGER;
  /** The 30 highest safe ids, ascending. */
  const TOP = Array.from({ length: BOUND }, (_, i) => MAX - (BOUND - 1) + i);

  function read(cursor: unknown, max = ANY): IdsCursorResult {
    return readIdsCursor(withCursor(CALL, cursor), max, BOUND);
  }

  function idsRefused(cursor: unknown, max = ANY): FreshdeskError {
    const result = read(cursor, max);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("validation");
    expect(result.error.http_status).toBeNull();
    expect(result.error.retryable).toBe(false);
    // A cursor long enough to be told apart from the message's own words is never quoted.
    if (typeof cursor === "string" && cursor.length > 4) {
      expect(result.error.message).not.toContain(cursor);
    }
    return result.error;
  }

  /** A cursor of the ids form whose digest is real for `position` and `ids`, written as `text`. */
  function withDigest(position: number, ids: number[], text: string): string {
    const digest = idsCursor(CALL, position, ids, BOUND).split(".").at(-1)!;
    return `${text}.${digest}`;
  }

  describe("round trip", () => {
    it("no cursor is position 0 and no ids", () => {
      expect(read(undefined)).toEqual({ ok: true, position: 0, ids: [] });
    });

    it.each([
      ["the empty set", 7, []],
      ["one id", 7, [4306]],
      ["three ids", 1, [4301, 4302, 9000]],
    ])("%s", (_what, position, ids) => {
      const cursor = idsCursor(CALL, position, ids, BOUND);
      expect(read(cursor)).toEqual({ ok: true, position, ids });
    });

    it("the empty set is the plain shape: a position, a dot, the digest", () => {
      expect(idsCursor(CALL, 7, [], BOUND)).toMatch(/^7\.[A-Za-z0-9_-]{43}$/);
    });

    it("the longest cursor round-trips; one character more is refused", () => {
      const cursor = idsCursor(CALL, MAX, TOP, BOUND);
      expect(cursor).toHaveLength(idsCursorMaxLength(BOUND));
      expect(idsCursorMaxLength(BOUND)).toBe(570);
      expect(read(cursor)).toEqual({ ok: true, position: MAX, ids: TOP });
      idsRefused(`${cursor}A`);
      idsRefused(`0${cursor}`);
    });

    it("the maximum position is accepted, one above it refused", () => {
      const cursor = idsCursor(CALL, 41, [5], BOUND);
      expect(read(cursor, 41).ok).toBe(true);
      expect(idsRefused(cursor, 40).message).toContain("past the last position");
    });
  });

  describe("refused before anything is sent, the cursor not quoted", () => {
    it.each([
      ["unsorted", withDigest(3, [5, 6], "3.6-5")],
      ["duplicated", withDigest(3, [5, 6], "3.5-5")],
      ["0", withDigest(3, [5], "3.0")],
      ["past the safe range", withDigest(3, [5], "3.9007199254740992")],
      ["a leading zero", withDigest(3, [5], "3.05")],
      ["a sign", withDigest(3, [5], "3.+5")],
      ["a minus sign", withDigest(3, [5], "3.-5")],
      ["an empty set segment (..)", withDigest(3, [], "3.")],
      ["an empty id (--)", withDigest(3, [5, 6], "3.5--6")],
      ["a trailing dash", withDigest(3, [5], "3.5-")],
      ["a leading zero on the position", withDigest(3, [5], "03.5")],
    ])("ids %s", (_what, cursor) => {
      idsRefused(cursor);
    });

    it("more ids than the bound", () => {
      const ids = Array.from({ length: BOUND + 1 }, (_, i) => i + 1);
      // Minted under a wider bound, so its digest is real: only the bound refuses it.
      const wide = idsCursor(CALL, 3, ids, BOUND + 1);
      expect(readIdsCursor(withCursor(CALL, wide), ANY, BOUND + 1).ok).toBe(true);
      idsRefused(wide);
    });

    it("over the length cap", () => {
      idsRefused(`1.${"1-".repeat(300)}1.${"A".repeat(43)}`);
    });

    it("an id edited", () => {
      const cursor = idsCursor(CALL, 3, [5, 6], BOUND);
      expect(idsRefused(cursor.replace("3.5-6.", "3.5-7.")).message).toContain(
        "belongs to another call",
      );
    });

    it("the position edited", () => {
      const cursor = idsCursor(CALL, 3, [5, 6], BOUND);
      expect(idsRefused(`1${cursor}`).message).toContain("belongs to another call");
    });

    it("an id dropped or added", () => {
      const cursor = idsCursor(CALL, 3, [5, 6], BOUND);
      idsRefused(cursor.replace("3.5-6.", "3.5."));
      idsRefused(cursor.replace("3.5-6.", "3."));
      idsRefused(cursor.replace("3.5-6.", "3.5-6-7."));
    });

    it("used with another call", () => {
      const cursor = idsCursor(CALL, 3, [5], BOUND);
      const other = { tool: CALL.tool, args: { ...CALL.args, status: "Closed", cursor } };
      expect(readIdsCursor(other, ANY, BOUND).ok).toBe(false);
    });

    it("an ids cursor given to readCursor, the empty set included", () => {
      for (const ids of [[5], []]) {
        const cursor = idsCursor(CALL, 3, ids, BOUND);
        refused(withCursor(CALL, cursor));
      }
    });

    it("a plain cursor from listEnvelope given to the ids reader", () => {
      idsRefused(cursorFor(CALL, 3));
    });

    it.each([
      ["not a string", 3],
      ["empty", ""],
      ["no digest", "3.5"],
    ])("%s", (_what, cursor) => {
      idsRefused(cursor);
    });
  });

  describe("the minter's own checks", () => {
    it.each([
      ["more ids than the bound", 3, Array.from({ length: BOUND + 1 }, (_, i) => i + 1)],
      ["ids not strictly ascending", 3, [6, 5]],
      ["a duplicated id", 3, [5, 5]],
      ["an id below 1", 3, [0]],
      ["a negative id", 3, [-5]],
      ["an unsafe id", 3, [MAX + 1]],
      ["a fractional id", 3, [1.5]],
      ["a negative position", -1, [5]],
    ])("%s throws a TypeError", (_what, position, ids) => {
      expect(() => idsCursor(CALL, position, ids, BOUND)).toThrow(TypeError);
    });

    it("a bound below 1 throws, in the minter and the reader", () => {
      expect(() => idsCursor(CALL, 3, [], 0)).toThrow(TypeError);
      expect(() => readIdsCursor(CALL, ANY, 0)).toThrow(TypeError);
    });
  });
});
