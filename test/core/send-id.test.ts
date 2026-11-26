// T-083: the `send_id` (RFC 2026-11-26-send-safety-core, OD-20, OD-32, OD-33).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FreshdeskError } from "../../src/client/errors.js";
import {
  checkSendId,
  mintSendId,
  SEND_ID_TTL_MS,
  type SendRecipients,
} from "../../src/core/send-id.js";

const TOOL = "forward_ticket";
const TICKET = 4242;
/** The body before escaping (OD-24): markup and a line break as the user typed them. */
const BODY = "Hello <team> & co,\nplease look at this one.";
const RECIPIENTS: SendRecipients = {
  to: ["b.lead@example.com", "a.dev@example.com"],
  cc: ["ops@example.com", "qa@example.com"],
};
const T0 = Date.parse("2026-11-26T10:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock("node:crypto");
  vi.resetModules();
});

function mint(
  over: Partial<{ tool: string; ticket: number; body: string; recipients: SendRecipients }> = {},
): string {
  return mintSendId(
    over.tool ?? TOOL,
    over.ticket ?? TICKET,
    over.body ?? BODY,
    over.recipients ?? RECIPIENTS,
  ).send_id;
}

function check(
  sendId: unknown,
  over: Partial<{ tool: string; ticket: number; body: string; recipients: SendRecipients }> = {},
) {
  return checkSendId(
    over.tool ?? TOOL,
    sendId,
    over.ticket ?? TICKET,
    over.body ?? BODY,
    over.recipients ?? RECIPIENTS,
  );
}

/** A refusal as a `validation` error, nothing sent, never quoting the id or a piece of it. */
function refusedWithoutQuoting(result: ReturnType<typeof check>, sendId: unknown): FreshdeskError {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("unreachable");
  const { error } = result;
  expect(error.code).toBe("validation");
  expect(error.http_status).toBeNull();
  expect(error.retryable).toBe(false);
  expect(error.message).toMatch(/^Not sent: /);
  if (typeof sendId === "string" && sendId.length > 0) {
    const text = JSON.stringify(error);
    expect(text).not.toContain(sendId);
    for (const piece of sendId.split(/[.\s]/).filter((p) => p.length >= 8)) {
      expect(text).not.toContain(piece);
    }
  }
  return error;
}

describe("mintSendId", () => {
  it("gives `time.nonce.tag`: the mint time, a 16-character nonce and exactly one 16-character tag", () => {
    const minted = mintSendId(TOOL, TICKET, BODY, RECIPIENTS);
    expect(minted.send_id).toMatch(/^[0-9]+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{16}$/);
    expect(minted.send_id.split(".")[0]).toBe(String(T0));
    expect(minted.expires_at).toBe(new Date(T0 + SEND_ID_TTL_MS).toISOString());
  });

  it("lasts 15 minutes", () => {
    expect(SEND_ID_TTL_MS).toBe(15 * 60 * 1000);
  });

  it("gives a new nonce at every mint, the same values included", () => {
    expect(mint().split(".")[1]).not.toBe(mint().split(".")[1]);
  });
});

describe("checkSendId: what it is bound to", () => {
  it("checks the same tool, ticket, body and recipients", () => {
    expect(check(mint())).toMatchObject({ ok: true });
  });

  it("checks the recipients in any order, and in any case (OD-20: lower-cased, sorted per field)", () => {
    const id = mint();
    expect(
      check(id, {
        recipients: {
          to: ["A.Dev@Example.com", "b.lead@example.com"],
          cc: ["qa@example.com", "OPS@example.com"],
        },
      }),
    ).toMatchObject({ ok: true });
  });

  it.each<
    [string, Partial<{ tool: string; ticket: number; body: string; recipients: SendRecipients }>]
  >([
    ["another tool", { tool: "reply_to_ticket" }],
    ["another ticket", { ticket: TICKET + 1 }],
    ["a body one character longer", { body: `${BODY}.` }],
    ["a body one character changed", { body: BODY.replace("Hello", "Hellp") }],
    ["the body escaped (it binds the text before escaping)", { body: BODY.replace("<", "&lt;") }],
    [
      "a recipient added to `to`",
      { recipients: { ...RECIPIENTS, to: [...RECIPIENTS.to, "c@example.com"] } },
    ],
    [
      "a recipient added to `cc`",
      { recipients: { ...RECIPIENTS, cc: [...RECIPIENTS.cc, "c@example.com"] } },
    ],
    [
      "a recipient removed from `to`",
      { recipients: { ...RECIPIENTS, to: RECIPIENTS.to.slice(1) } },
    ],
    ["a recipient removed from `cc`", { recipients: { ...RECIPIENTS, cc: [] } }],
    [
      "a recipient moved from `cc` to `to`",
      {
        recipients: {
          to: [...RECIPIENTS.to, "ops@example.com"],
          cc: ["qa@example.com"],
        },
      },
    ],
    [
      "a recipient named twice",
      { recipients: { ...RECIPIENTS, to: [...RECIPIENTS.to, "a.dev@example.com"] } },
    ],
  ])("refuses %s, without quoting the id", (_label, over) => {
    const id = mint();
    const error = refusedWithoutQuoting(check(id, over), id);
    expect(error.message).toContain("does not match");
    // Refused, not spent: the right values still check.
    expect(check(id)).toMatchObject({ ok: true });
  });

  it("binds an empty recipient list (a public note) as its own value", () => {
    const none: SendRecipients = { to: [], cc: [] };
    const id = mint({ tool: "add_public_note", recipients: none });
    refusedWithoutQuoting(
      check(id, { tool: "add_public_note", recipients: { to: [], cc: ["a@example.com"] } }),
      id,
    );
    expect(check(id, { tool: "add_public_note", recipients: none })).toMatchObject({ ok: true });
  });
});

describe("checkSendId: the id itself", () => {
  it.each([
    ["the mint time", 0],
    ["the nonce", 1],
    ["the tag", 2],
  ])("refuses an id with %s edited", (_label, part) => {
    const id = mint();
    const pieces = id.split(".");
    const piece = pieces[part]!;
    const last = piece.at(-1)!;
    pieces[part] = piece.slice(0, -1) + (last === "1" ? "2" : "1");
    const edited = pieces.join(".");
    refusedWithoutQuoting(check(edited), edited);
  });

  it("binds the mint time: a later time with the nonce and tag kept is refused as not matching", () => {
    const id = mint();
    vi.setSystemTime(T0 + SEND_ID_TTL_MS + 1);
    const [, nonce, tag] = id.split(".");
    // Within 15 minutes of the clock and not ahead of it: only the tag can refuse it.
    const moved = `${T0 + 60_000}.${nonce}.${tag}`;
    const error = refusedWithoutQuoting(check(moved), moved);
    expect(error.message).toContain("does not match");
  });

  it("refuses an id minted under another process's key", async () => {
    vi.resetModules();
    const other = await import("../../src/core/send-id.js");
    const id = other.mintSendId(TOOL, TICKET, BODY, RECIPIENTS).send_id;
    expect(other.checkSendId(TOOL, id, TICKET, BODY, RECIPIENTS)).toMatchObject({ ok: true });
    refusedWithoutQuoting(check(id), id);
  });

  it.each([undefined, null, 42, {}, [], "", "x", "1.2.3"])(
    "refuses %j, not a send_id this server gave",
    (value) => {
      refusedWithoutQuoting(check(value), value);
    },
  );

  it("refuses an id over the length a send_id has, before parsing it", () => {
    const long = `${"9".repeat(10_000)}.${"a".repeat(16)}.${"b".repeat(16)}`;
    refusedWithoutQuoting(check(long), long);
  });

  it("refuses a mint time with a leading zero (one canonical spelling)", () => {
    const id = mint();
    const edited = `0${id}`;
    refusedWithoutQuoting(check(edited), edited);
  });
});

describe("checkSendId: 15 minutes from the mint time", () => {
  it("checks at exactly 15 minutes and refuses one millisecond later (the boundary as preview.ts)", () => {
    const atEnd = mint();
    const pastEnd = mint();
    vi.setSystemTime(T0 + SEND_ID_TTL_MS);
    expect(check(atEnd)).toMatchObject({ ok: true });
    vi.setSystemTime(T0 + SEND_ID_TTL_MS + 1);
    const error = refusedWithoutQuoting(check(pastEnd), pastEnd);
    expect(error.message).toContain("older than 15 minutes");
  });

  it("refuses a mint time ahead of the clock", () => {
    const id = mint();
    vi.setSystemTime(T0 - 1);
    refusedWithoutQuoting(check(id), id);
  });
});

describe("checkSendId: each send_id sends at most once (OD-33)", () => {
  it("passes one of two checks of one id made with no await between", () => {
    const id = mint();
    const first = check(id);
    const second = check(id);
    expect(first).toMatchObject({ ok: true });
    const error = refusedWithoutQuoting(second, id);
    expect(error.message).toBe(
      "Not sent: this send_id was already used, and the earlier call may have sent; check the ticket before sending again. Call again without confirm to get a new send_id.",
    );
  });

  it("never prunes the spent set: a spent id past its 15 minutes, the clock set back, is still refused", () => {
    const id = mint();
    expect(check(id)).toMatchObject({ ok: true });
    vi.setSystemTime(T0 + SEND_ID_TTL_MS + 60_000);
    refusedWithoutQuoting(check(id), id);
    vi.setSystemTime(T0 + 1);
    const error = refusedWithoutQuoting(check(id), id);
    expect(error.message).toContain("already used");
  });

  it("does not spend an id on a refusal: a check that fails leaves it unspent", () => {
    const id = mint();
    refusedWithoutQuoting(check(id, { ticket: TICKET + 1 }), id);
    expect(check(id)).toMatchObject({ ok: true });
  });

  it.each([
    ["a tag appended", (id: string) => `${id}${id.split(".")[2]}`],
    ["a dot and a tag appended", (id: string) => `${id}.${id.split(".")[2]}`],
    ["a space before it", (id: string) => ` ${id}`],
    ["a space after it", (id: string) => `${id} `],
    ["a line feed after it", (id: string) => `${id}\n`],
    ["a line feed before it", (id: string) => `\n${id}`],
    ["text around it", (id: string) => `id=${id};`],
  ])(
    "refuses a spent id with %s (one tag, parsed whole by an anchored pattern)",
    (_label, alter) => {
      const id = mint();
      expect(check(id)).toMatchObject({ ok: true });
      const altered = alter(id);
      refusedWithoutQuoting(check(altered), altered);
    },
  );

  it("keys the spent set on the nonce: another id with a spent id's nonce is refused as used", async () => {
    // Two mints that draw the same nonce, at two mint times: two texts, both
    // with a valid tag. Only a set keyed on the nonce refuses the second.
    vi.resetModules();
    vi.doMock("node:crypto", async (importOriginal) => {
      const real = await importOriginal<typeof import("node:crypto")>();
      return {
        ...real,
        randomBytes: (size: number) => (size === 12 ? Buffer.alloc(12, 7) : real.randomBytes(size)),
      };
    });
    const fixed = await import("../../src/core/send-id.js");
    const first = fixed.mintSendId(TOOL, TICKET, BODY, RECIPIENTS).send_id;
    vi.setSystemTime(T0 + 1000);
    const second = fixed.mintSendId(TOOL, TICKET, BODY, RECIPIENTS).send_id;
    expect(second).not.toBe(first);
    expect(second.split(".")[1]).toBe(first.split(".")[1]);
    expect(fixed.checkSendId(TOOL, first, TICKET, BODY, RECIPIENTS)).toMatchObject({ ok: true });
    const result = fixed.checkSendId(TOOL, second, TICKET, BODY, RECIPIENTS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("already used");
  });

  it("frees an id only through the release the passing check gives (OD-33: 0 attempts dispatched)", () => {
    const id = mint();
    const passed = check(id);
    if (!passed.ok) throw new Error("check refused");
    refusedWithoutQuoting(check(id), id);
    passed.release();
    const again = check(id);
    expect(again).toMatchObject({ ok: true });
    // The first release frees nothing a later check reserved.
    passed.release();
    refusedWithoutQuoting(check(id), id);
  });
});
