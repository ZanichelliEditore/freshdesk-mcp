// T-082 (RFC 2026-11-26-send-safety-core, OD-19 to OD-27, OD-29, OD-32,
// OD-33): the write path's send entry points. They exist only when the team
// file enables `send`; a call without `confirm` mints a `send_id` and sends
// nothing; a send needs `confirm === true` and that `send_id`, which sends at
// most once. Every check (closed keys, body rule, allow-list, cap) runs at the
// mint and again at the confirm, before the `send_id` check. An entry never
// rejects.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEND_ID_TTL_MS } from "../../src/core/send-id.js";
import { createWritePath, type SendEntries, type SendResult } from "../../src/core/write-path.js";
import { notSent as notSentResult } from "../../src/tools/confirm.js";
import { type MockAgent, mockDispatcher } from "../support/mock-dispatcher.js";

const DOMAIN = "acme.freshdesk.com";
const ORIGIN = `https://${DOMAIN}`;
const JSON_TYPE = { "content-type": "application/json" };
const limits = { reserve_pct: 20, floor_pct: 5, pacing_rps: 2 };
const ALLOW = ["@example.com", "boss@corp.example"];
const ANSWER = { id: 6301, user_id: 5001, body: "<div>x</div>", ticket_id: 42 };
const NOTE_ANSWER = { ...ANSWER, incoming: false, private: false };

type Tool = keyof SendEntries;

let mock: MockAgent;

beforeEach(() => {
  // Only the clock and timeouts are fake: the mock's replies need the rest.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  mock = mockDispatcher();
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await mock.close();
});

function writePath(toolsets: string[], forwardAllowList: readonly string[] = ALLOW) {
  return createWritePath({
    domain: DOMAIN,
    apiKey: "k3y",
    dispatcher: mock,
    limits,
    toolsets,
    forwardAllowList,
  });
}

function sends(forwardAllowList: readonly string[] = ALLOW): SendEntries {
  const { sends } = writePath(["core", "send"], forwardAllowList);
  if (sends === undefined) throw new Error("expected send entries");
  return sends;
}

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

function dispatched(): number {
  return mock.getCallHistory()?.calls().length ?? 0;
}

function sentBodies(): unknown[] {
  return mock
    .getCallHistory()!
    .calls()
    .map((call) => JSON.parse(call.body as string));
}

const PATHS: Record<Tool, string> = {
  reply_to_ticket: "/api/v2/tickets/42/reply",
  forward_ticket: "/api/v2/tickets/42/forward",
  add_public_note: "/api/v2/tickets/42/notes",
};

function on(tool: Tool) {
  return mock.get(ORIGIN).intercept({ path: PATHS[tool], method: "POST" });
}

function answer(tool: Tool) {
  return tool === "add_public_note" ? NOTE_ANSWER : ANSWER;
}

function refused(result: SendResult) {
  if (result.ok) throw new Error(`expected a refusal, got ${JSON.stringify(result)}`);
  expect(result.error).toMatchObject({ code: "validation", http_status: null, retryable: false });
  return result.error;
}

function minted(result: SendResult) {
  if (!result.ok || result.sent) throw new Error(`expected a mint, got ${JSON.stringify(result)}`);
  expect(result.attempts).toBe(0);
  return result.preview;
}

/** The minimal valid input of each entry. */
const INPUT: Record<Tool, Record<string, unknown>> = {
  reply_to_ticket: { id: 42, body: "Hello." },
  forward_ticket: { id: 42, body: "Please look.", to: ["a@example.com"] },
  add_public_note: { id: 42, body: "Noted." },
};

const TOOLS: Tool[] = ["reply_to_ticket", "forward_ticket", "add_public_note"];

/** Calls `tool`'s entry with `input`, cast as a model's arguments would be. */
function call(entries: SendEntries, tool: Tool, input: Record<string, unknown>) {
  return settle(entries[tool].send(input as never));
}

/** Mints for `input`, then confirms it with the `send_id` given. */
async function mintThenConfirm(
  entries: SendEntries,
  tool: Tool,
  input: Record<string, unknown>,
  confirmInput: Record<string, unknown> = input,
) {
  const preview = minted(await call(entries, tool, input));
  return call(entries, tool, { ...confirmInput, confirm: true, send_id: preview.send_id });
}

describe("the send entries exist only when send is enabled (OD-25)", () => {
  it("with write alone: write entries, no send entries", () => {
    const path = writePath(["core", "write"]);
    expect(path.entries).toBeDefined();
    expect(Object.hasOwn(path, "sends")).toBe(false);
  });

  it("with send alone: send entries, no write entries", () => {
    const path = writePath(["core", "send"]);
    expect(Object.hasOwn(path, "entries")).toBe(false);
    expect(Object.keys(path.sends!).sort()).toEqual([
      "add_public_note",
      "forward_ticket",
      "reply_to_ticket",
    ]);
    expect(Object.isFrozen(path.sends)).toBe(true);
    for (const tool of TOOLS) expect(Object.isFrozen(path.sends![tool])).toBe(true);
  });

  it("with both: both", () => {
    const path = writePath(["core", "write", "send"]);
    expect(path.entries).toBeDefined();
    expect(path.sends).toBeDefined();
  });
});

describe.each(TOOLS)("%s: the mint (OD-32)", (tool) => {
  it("without confirm mints a send_id and sends nothing", async () => {
    const result = await call(sends(), tool, INPUT[tool]);
    const preview = minted(result);
    expect(preview).toMatchObject({ tool, ticket_id: 42, body: INPUT[tool].body });
    expect(preview.send_id).toMatch(/^\d+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{16}$/);
    expect(preview.expires_at).toBe(new Date(Date.now() + SEND_ID_TTL_MS).toISOString());
    expect(dispatched()).toBe(0);
  });

  it("returns the body before escaping, and confirm.ts shows that text (OD-24)", async () => {
    const body = "Use <b> & \"quotes\" 'here'\r\nnext";
    const preview = minted(await call(sends(), tool, { ...INPUT[tool], body }));
    expect(preview.body).toBe(body);
    expect(notSentResult(preview).body).toBe(body);
  });

  it("sends with confirm: true and the send_id minted for the same call", async () => {
    on(tool).reply(201, answer(tool), { headers: JSON_TYPE });
    const result = await mintThenConfirm(sends(), tool, INPUT[tool]);
    expect(result).toEqual({
      ok: true,
      sent: true,
      ticket_id: 42,
      conversation_id: 6301,
      attempts: 1,
    });
    expect(dispatched()).toBe(1);
  });
});

describe("the recipients a mint returns", () => {
  it("a reply and a public note have an empty to; confirm.ts adds only the requester's label", async () => {
    const entries = sends();
    const reply = minted(
      await call(entries, "reply_to_ticket", { id: 42, body: "x", cc: ["c@example.com"] }),
    );
    const note = minted(await call(entries, "add_public_note", { id: 42, body: "x" }));
    expect(reply.to).toEqual([]);
    expect(reply.cc).toEqual(["c@example.com"]);
    expect(note.to).toEqual([]);
    expect(note.cc).toEqual([]);
    expect(notSentResult(reply).recipients.to).toEqual(["the ticket's requester"]);
    expect(notSentResult(note).recipients.to).toEqual(["the ticket's requester"]);
  });

  it("a forward's are the checked copies, not the caller's lists", async () => {
    const to = ["a@example.com"];
    const cc = ["boss@corp.example"];
    const preview = minted(await call(sends(), "forward_ticket", { id: 42, body: "x", to, cc }));
    to.push("evil@elsewhere.test");
    cc[0] = "evil@elsewhere.test";
    expect(preview.to).toEqual(["a@example.com"]);
    expect(preview.cc).toEqual(["boss@corp.example"]);
  });

  it("sends the checked copies: a list changed after the confirm's check cannot reach Freshdesk", async () => {
    on("forward_ticket").reply(201, ANSWER, { headers: JSON_TYPE });
    const entries = sends();
    const to = ["a@example.com"];
    const preview = minted(await call(entries, "forward_ticket", { id: 42, body: "x", to }));
    const pending = entries.forward_ticket.send({
      id: 42,
      body: "x",
      to,
      confirm: true,
      send_id: preview.send_id,
    });
    to[0] = "evil@elsewhere.test";
    const result = await settle(pending);
    expect(result).toMatchObject({ ok: true, sent: true });
    expect(sentBodies()[0]).toMatchObject({ to_emails: ["a@example.com"] });
  });
});

describe("the payloads: closed keys (OD-24, OD-26, OD-29)", () => {
  it("a reply sends exactly { body, cc_emails } with a cc, and { body } without", async () => {
    on("reply_to_ticket").reply(201, ANSWER, { headers: JSON_TYPE }).times(2);
    const entries = sends();
    await mintThenConfirm(entries, "reply_to_ticket", { id: 42, body: "a", cc: ["c@example.com"] });
    await mintThenConfirm(entries, "reply_to_ticket", { id: 42, body: "b" });
    expect(sentBodies()).toEqual([{ body: "a", cc_emails: ["c@example.com"] }, { body: "b" }]);
  });

  it("a forward sends exactly { body, to_emails, cc_emails?, include_original_attachments: false }", async () => {
    on("forward_ticket").reply(201, ANSWER, { headers: JSON_TYPE }).times(2);
    const entries = sends();
    await mintThenConfirm(entries, "forward_ticket", {
      id: 42,
      body: "a",
      to: ["a@example.com"],
      cc: ["boss@corp.example"],
    });
    await mintThenConfirm(entries, "forward_ticket", { id: 42, body: "b", to: ["a@example.com"] });
    expect(sentBodies()).toEqual([
      {
        body: "a",
        to_emails: ["a@example.com"],
        cc_emails: ["boss@corp.example"],
        include_original_attachments: false,
      },
      { body: "b", to_emails: ["a@example.com"], include_original_attachments: false },
    ]);
  });

  it("a public note sends exactly { body, private: false }", async () => {
    on("add_public_note").reply(201, NOTE_ANSWER, { headers: JSON_TYPE });
    await mintThenConfirm(sends(), "add_public_note", { id: 42, body: "Noted." });
    expect(sentBodies()).toEqual([{ body: "Noted.", private: false }]);
  });

  const injected: [Tool, string, unknown][] = [
    ["reply_to_ticket", "to_emails", ["evil@elsewhere.test"]],
    ["reply_to_ticket", "to", ["a@example.com"]],
    ["reply_to_ticket", "private", false],
    ["forward_ticket", "private", false],
    ["forward_ticket", "include_original_attachments", true],
    ["add_public_note", "cc", ["a@example.com"]],
    ["add_public_note", "private", true],
    ...TOOLS.flatMap((tool): [Tool, string, unknown][] => [
      [tool, "bcc_emails", ["evil@elsewhere.test"]],
      [tool, "from_email", "evil@elsewhere.test"],
      [tool, "user_id", 1],
      [tool, "attachments", ["x"]],
      [tool, "incoming", true],
      [tool, "notify_emails", ["evil@elsewhere.test"]],
    ]),
  ];

  it.each(injected)(
    "%s: a cast-injected %s is refused at the mint, 0 dispatches",
    async (tool, key, value) => {
      const result = await call(sends(), tool, { ...INPUT[tool], [key]: value });
      expect(refused(result).message).not.toContain("evil");
      expect(dispatched()).toBe(0);
    },
  );

  it.each(injected)(
    "%s: a cast-injected %s is refused at the confirm too, 0 dispatches",
    async (tool, key, value) => {
      const result = await mintThenConfirm(sends(), tool, INPUT[tool], {
        ...INPUT[tool],
        [key]: value,
      });
      refused(result);
      expect(dispatched()).toBe(0);
    },
  );

  it("takes no key, verifier or verdict from its caller", async () => {
    for (const key of ["key", "verify", "verifier", "verdict", "valid"]) {
      for (const tool of TOOLS) {
        refused(await call(sends(), tool, { ...INPUT[tool], [key]: () => true }));
      }
    }
    expect(dispatched()).toBe(0);
  });
});

describe("an entry takes no key, verifier or verdict from its caller (asserted on source)", () => {
  const source = readFileSync(new URL("../../src/core/write-path.ts", import.meta.url), "utf8");

  it("imports the send_id's mint and check from src/core/send-id.ts, and holds no key of its own", () => {
    expect(source).toMatch(
      /import \{[^}]*\bcheckSendId\b[^}]*\bmintSendId\b[^}]*\} from "\.\/send-id\.js";/,
    );
    expect(source).not.toMatch(/createHmac|randomBytes|timingSafeEqual|node:crypto/);
  });

  it("checks a send_id only with checkSendId, over values the entry read and checked itself", () => {
    const checks = source.match(/checkSendId\([^)]*\)/g) ?? [];
    expect(checks).toEqual([
      "checkSendId(tool, checked.sendId, checked.id, checked.body, checked.recipients)",
    ]);
    const mints = source.match(/mintSendId\([^)]*\)/g) ?? [];
    expect(mints).toEqual(["mintSendId(tool, checked.id, checked.body, checked.recipients)"]);
  });

  it("names exactly these input keys per entry", () => {
    const block = /const SEND_KEYS[^;]*;/s.exec(source)?.[0] ?? "";
    expect(block).toContain(
      'reply_to_ticket: ["id", "body", "cc", "confirm", "send_id", "deadline"]',
    );
    expect(block).toContain(
      'forward_ticket: ["id", "body", "to", "cc", "confirm", "send_id", "deadline"]',
    );
    expect(block).toContain('add_public_note: ["id", "body", "confirm", "send_id", "deadline"]');
  });
});

describe("the confirm and the send_id (OD-19, OD-20)", () => {
  it.each(TOOLS)("%s: a confirm not literally true is refused, 0 dispatches", async (tool) => {
    const entries = sends();
    const preview = minted(await call(entries, tool, INPUT[tool]));
    for (const confirm of [false, "true", 1, {}, [true], null]) {
      refused(await call(entries, tool, { ...INPUT[tool], confirm, send_id: preview.send_id }));
    }
    expect(dispatched()).toBe(0);
    // None of them spent the id.
    on(tool).reply(201, answer(tool), { headers: JSON_TYPE });
    const sent = await call(entries, tool, {
      ...INPUT[tool],
      confirm: true,
      send_id: preview.send_id,
    });
    expect(sent).toMatchObject({ ok: true, sent: true });
  });

  it.each(TOOLS)("%s: confirm: true with no send_id is refused, 0 dispatches", async (tool) => {
    refused(await call(sends(), tool, { ...INPUT[tool], confirm: true }));
    expect(dispatched()).toBe(0);
  });

  it("a send_id minted for another tool is refused", async () => {
    const entries = sends();
    const preview = minted(await call(entries, "reply_to_ticket", { id: 42, body: "x" }));
    refused(
      await call(entries, "add_public_note", {
        id: 42,
        body: "x",
        confirm: true,
        send_id: preview.send_id,
      }),
    );
    expect(dispatched()).toBe(0);
  });

  it.each([
    ["another ticket", { id: 43 }],
    ["another body", { body: "Hello!" }],
    ["another cc", { cc: ["d@example.com"] }],
    ["one cc more", { cc: ["c@example.com", "d@example.com"] }],
  ])("a reply's send_id confirmed for %s is refused, 0 dispatches", async (_name, change) => {
    const input = { id: 42, body: "Hello.", cc: ["c@example.com"] };
    refused(await mintThenConfirm(sends(), "reply_to_ticket", input, { ...input, ...change }));
    expect(dispatched()).toBe(0);
  });

  it("binds the body before escaping: a confirm with the escaped text is refused", async () => {
    const input = { id: 42, body: "a & b" };
    refused(
      await mintThenConfirm(sends(), "reply_to_ticket", input, { ...input, body: "a &amp; b" }),
    );
    expect(dispatched()).toBe(0);
  });

  it("a forward's send_id confirmed with an address moved from cc to to is refused", async () => {
    const entries = sends();
    const input = { id: 42, body: "x", to: ["a@example.com"], cc: ["b@example.com"] };
    refused(
      await mintThenConfirm(entries, "forward_ticket", input, {
        ...input,
        to: ["a@example.com", "b@example.com"],
        cc: [],
      }),
    );
    expect(dispatched()).toBe(0);
  });

  it("accepts the recipients in another order or case", async () => {
    on("forward_ticket").reply(201, ANSWER, { headers: JSON_TYPE });
    const input = { id: 42, body: "x", to: ["a@example.com", "B@example.com"] };
    const result = await mintThenConfirm(sends(), "forward_ticket", input, {
      ...input,
      to: ["b@example.com", "A@EXAMPLE.COM"],
    });
    expect(result).toMatchObject({ ok: true, sent: true });
  });

  it("an edited send_id is refused", async () => {
    const entries = sends();
    const preview = minted(await call(entries, "reply_to_ticket", INPUT.reply_to_ticket));
    const last = preview.send_id.at(-1) === "A" ? "B" : "A";
    const edited = preview.send_id.slice(0, -1) + last;
    refused(
      await call(entries, "reply_to_ticket", {
        ...INPUT.reply_to_ticket,
        confirm: true,
        send_id: edited,
      }),
    );
    expect(dispatched()).toBe(0);
  });

  it("a send_id minted under another process's key is refused", async () => {
    const preview = minted(await call(sends(), "reply_to_ticket", INPUT.reply_to_ticket));
    vi.resetModules();
    const fresh = await import("../../src/core/write-path.js");
    const other = fresh.createWritePath({
      domain: DOMAIN,
      apiKey: "k3y",
      dispatcher: mock,
      limits,
      toolsets: ["send"],
      forwardAllowList: ALLOW,
    }).sends!;
    refused(
      await settle(
        other.reply_to_ticket.send({
          ...INPUT.reply_to_ticket,
          confirm: true,
          send_id: preview.send_id,
        } as never),
      ),
    );
    expect(dispatched()).toBe(0);
  });

  it("a send_id past its 15 minutes is refused", async () => {
    const entries = sends();
    const preview = minted(await call(entries, "reply_to_ticket", INPUT.reply_to_ticket));
    vi.setSystemTime(Date.now() + SEND_ID_TTL_MS + 1);
    const error = refused(
      await call(entries, "reply_to_ticket", {
        ...INPUT.reply_to_ticket,
        confirm: true,
        send_id: preview.send_id,
      }),
    );
    expect(error.message).toContain("older than 15 minutes");
    expect(dispatched()).toBe(0);
  });
});

describe("single use (OD-33)", () => {
  const ALREADY = "already used, and the earlier call may have sent";

  async function confirmAgain(entries: SendEntries, sendId: string) {
    return call(entries, "reply_to_ticket", {
      ...INPUT.reply_to_ticket,
      confirm: true,
      send_id: sendId,
    });
  }

  it.each([
    ["sent", 201, ANSWER],
    ["ended with a 4xx", 400, { description: "Validation failed", errors: [] }],
    ["ended with a 5xx", 503, ""],
  ])(
    "a second confirm after the first %s is refused, 0 more dispatches",
    async (_name, status, body) => {
      on("reply_to_ticket").reply(status, body, { headers: JSON_TYPE });
      const entries = sends();
      const preview = minted(await call(entries, "reply_to_ticket", INPUT.reply_to_ticket));
      await confirmAgain(entries, preview.send_id);
      expect(dispatched()).toBe(1);
      expect(refused(await confirmAgain(entries, preview.send_id)).message).toContain(ALREADY);
      expect(dispatched()).toBe(1);
    },
  );

  it("a second confirm while the first is in flight is refused", async () => {
    on("reply_to_ticket").reply(201, ANSWER, { headers: JSON_TYPE }).delay(2000);
    const entries = sends();
    const preview = minted(await call(entries, "reply_to_ticket", INPUT.reply_to_ticket));
    const first = entries.reply_to_ticket.send({
      ...INPUT.reply_to_ticket,
      confirm: true,
      send_id: preview.send_id,
    } as never);
    await vi.advanceTimersByTimeAsync(100);
    expect(refused(await confirmAgain(entries, preview.send_id)).message).toContain(ALREADY);
    expect(await settle(first)).toMatchObject({ ok: true, sent: true });
    expect(dispatched()).toBe(1);
  });

  it("two confirms of one send_id started together give at most one POST", async () => {
    on("reply_to_ticket").reply(201, ANSWER, { headers: JSON_TYPE }).persist();
    const entries = sends();
    const preview = minted(await call(entries, "reply_to_ticket", INPUT.reply_to_ticket));
    const input = { ...INPUT.reply_to_ticket, confirm: true, send_id: preview.send_id } as never;
    const results = await settle(
      Promise.all([entries.reply_to_ticket.send(input), entries.reply_to_ticket.send(input)]),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(dispatched()).toBe(1);
  });

  it("a network error after dispatch keeps the id spent", async () => {
    on("reply_to_ticket").reply(201, ANSWER, { headers: JSON_TYPE }).delay(60_000);
    on("reply_to_ticket").reply(201, ANSWER, { headers: JSON_TYPE });
    const entries = sends();
    const preview = minted(await call(entries, "reply_to_ticket", INPUT.reply_to_ticket));
    const first = await confirmAgain(entries, preview.send_id);
    expect(first).toMatchObject({
      ok: false,
      error: { code: "network", http_status: null },
      attempts: 1,
    });
    expect(refused(await confirmAgain(entries, preview.send_id)).message).toContain(ALREADY);
    expect(dispatched()).toBe(1);
  });

  it("a spent id stays spent past its 15 minutes and with the clock set back", async () => {
    on("reply_to_ticket").reply(201, ANSWER, { headers: JSON_TYPE });
    const entries = sends();
    const start = Date.now();
    const preview = minted(await call(entries, "reply_to_ticket", INPUT.reply_to_ticket));
    await confirmAgain(entries, preview.send_id);
    vi.setSystemTime(start + SEND_ID_TTL_MS + 60_000);
    refused(await confirmAgain(entries, preview.send_id));
    vi.setSystemTime(start + 1);
    expect(refused(await confirmAgain(entries, preview.send_id)).message).toContain(ALREADY);
    expect(dispatched()).toBe(1);
  });

  it("a refusal the core made at the confirm leaves the id unspent: a later confirm sends", async () => {
    on("reply_to_ticket").reply(201, ANSWER, { headers: JSON_TYPE });
    const entries = sends();
    const preview = minted(await call(entries, "reply_to_ticket", INPUT.reply_to_ticket));
    const confirm = { ...INPUT.reply_to_ticket, confirm: true, send_id: preview.send_id };
    refused(await call(entries, "reply_to_ticket", { ...confirm, bcc_emails: ["a@example.com"] }));
    refused(await call(entries, "reply_to_ticket", { ...confirm, deadline: "soon" }));
    expect(await call(entries, "reply_to_ticket", confirm)).toMatchObject({ ok: true, sent: true });
    expect(dispatched()).toBe(1);
  });

  it("under 10 s left: 0 attempts, the id freed, a later confirm sends", async () => {
    on("reply_to_ticket").reply(201, ANSWER, { headers: JSON_TYPE });
    const entries = sends();
    const preview = minted(await call(entries, "reply_to_ticket", INPUT.reply_to_ticket));
    const confirm = { ...INPUT.reply_to_ticket, confirm: true, send_id: preview.send_id };
    const short = await call(entries, "reply_to_ticket", {
      ...confirm,
      deadline: Date.now() + 5000,
    });
    expect(short).toMatchObject({ ok: false, attempts: 0 });
    expect(dispatched()).toBe(0);
    expect(await call(entries, "reply_to_ticket", confirm)).toMatchObject({ ok: true, sent: true });
    expect(dispatched()).toBe(1);
  });

  it("the limiter refusing: 0 attempts, the id freed, a later confirm sends", async () => {
    mock
      .get(ORIGIN)
      .intercept({ path: "/api/v2/tickets/42", method: "GET" })
      .reply(
        200,
        { id: 42 },
        {
          headers: { ...JSON_TYPE, "x-ratelimit-total": "100", "x-ratelimit-remaining": "0" },
        },
      );
    on("reply_to_ticket").reply(201, ANSWER, { headers: JSON_TYPE });
    const path = writePath(["send"]);
    const entries = path.sends!;
    await settle(path.view.request({ path: "/tickets/{id}", params: { id: 42 } }));
    const preview = minted(await call(entries, "reply_to_ticket", INPUT.reply_to_ticket));
    const confirm = { ...INPUT.reply_to_ticket, confirm: true, send_id: preview.send_id };
    const limited = await call(entries, "reply_to_ticket", confirm);
    expect(limited).toMatchObject({ ok: false, error: { code: "rate_limited" }, attempts: 0 });
    expect(dispatched()).toBe(1);
    vi.setSystemTime(Date.now() + 61_000);
    expect(await call(entries, "reply_to_ticket", confirm)).toMatchObject({ ok: true, sent: true });
    expect(dispatched()).toBe(2);
  });
});

describe("recipients (OD-21, OD-22, OD-23)", () => {
  it("a reply's cc off the list is refused at the mint, naming the field and position, not the address", async () => {
    const error = refused(
      await call(sends(), "reply_to_ticket", {
        id: 42,
        body: "x",
        cc: ["c@example.com", "evil@elsewhere.test"],
      }),
    );
    expect(error.errors).toEqual([expect.objectContaining({ field: "cc", code: "not_allowed" })]);
    expect(JSON.stringify(error)).not.toContain("evil");
    expect(error.message).toContain("position 2");
    expect(dispatched()).toBe(0);
  });

  it.each([
    ["to", { to: ["evil@elsewhere.test"] }],
    ["cc", { cc: ["evil@elsewhere.test"] }],
  ])("a forward's %s off the list is refused, per field", async (field, change) => {
    const error = refused(
      await call(sends(), "forward_ticket", { ...INPUT.forward_ticket, ...change }),
    );
    expect(error.errors).toEqual([expect.objectContaining({ field, code: "not_allowed" })]);
    expect(dispatched()).toBe(0);
  });

  it("a forward with no to address is refused", async () => {
    for (const to of [[], undefined]) {
      const input: Record<string, unknown> = { id: 42, body: "x", cc: ["a@example.com"] };
      if (to !== undefined) input.to = to;
      const error = refused(await call(sends(), "forward_ticket", input));
      expect(error.errors).toEqual([expect.objectContaining({ field: "to" })]);
    }
    expect(dispatched()).toBe(0);
  });

  it("an empty allow-list refuses every forward and every reply cc", async () => {
    const entries = sends([]);
    refused(await call(entries, "forward_ticket", INPUT.forward_ticket));
    refused(await call(entries, "reply_to_ticket", { id: 42, body: "x", cc: ["a@example.com"] }));
    expect(dispatched()).toBe(0);
  });

  const addresses = (n: number) => Array.from({ length: n }, (_, i) => `u${i}@example.com`);

  it("over the cap of 10 is refused: a forward's to and cc together, a reply's cc", async () => {
    const entries = sends();
    const forward = refused(
      await call(entries, "forward_ticket", {
        id: 42,
        body: "x",
        to: addresses(6),
        cc: addresses(5),
      }),
    );
    expect(forward.errors).toEqual([expect.objectContaining({ code: "over_cap" })]);
    refused(await call(entries, "reply_to_ticket", { id: 42, body: "x", cc: addresses(11) }));
    expect(dispatched()).toBe(0);
  });

  it("10 recipients in all is allowed", async () => {
    const entries = sends();
    minted(
      await call(entries, "forward_ticket", {
        id: 42,
        body: "x",
        to: addresses(6),
        cc: addresses(4),
      }),
    );
    minted(await call(entries, "reply_to_ticket", { id: 42, body: "x", cc: addresses(10) }));
  });

  it("the checks run again at the confirm, before the send_id check", async () => {
    const entries = sends();
    const preview = minted(await call(entries, "reply_to_ticket", { id: 42, body: "x" }));
    const error = refused(
      await call(entries, "reply_to_ticket", {
        id: 42,
        body: "x",
        cc: ["evil@elsewhere.test"],
        confirm: true,
        send_id: preview.send_id,
      }),
    );
    // The allow-list refused it, not the send_id: the id is still unspent.
    expect(error.errors).toEqual([expect.objectContaining({ field: "cc", code: "not_allowed" })]);
    on("reply_to_ticket").reply(201, ANSWER, { headers: JSON_TYPE });
    const sent = await call(entries, "reply_to_ticket", {
      id: 42,
      body: "x",
      confirm: true,
      send_id: preview.send_id,
    });
    expect(sent).toMatchObject({ ok: true, sent: true });
  });

  it("a reply reads no ticket CCs: one request, the POST", async () => {
    on("reply_to_ticket").reply(201, ANSWER, { headers: JSON_TYPE });
    await mintThenConfirm(sends(), "reply_to_ticket", { id: 42, body: "x", cc: ["c@example.com"] });
    const calls = mock.getCallHistory()!.calls();
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /api/v2/tickets/42/reply"]);
  });

  const badShapes: [string, Tool, Record<string, unknown>][] = [
    ["a cc that is a string", "reply_to_ticket", { cc: "a@example.com" }],
    ["a cc of null", "reply_to_ticket", { cc: null }],
    ["a cc with a number", "reply_to_ticket", { cc: [1] }],
    ["a to that is an object", "forward_ticket", { to: { 0: "a@example.com", length: 1 } }],
    ["a to with null", "forward_ticket", { to: [null] }],
    [
      "a to that throws when read",
      "forward_ticket",
      {
        to: new Proxy(["a@example.com"], {
          get() {
            throw new Error("boom");
          },
        }),
      },
    ],
  ];

  it.each(badShapes)(
    "%s is refused, not thrown, at the mint and the confirm",
    async (_name, tool, change) => {
      const entries = sends();
      refused(await call(entries, tool, { ...INPUT[tool], ...change }));
      const preview = minted(await call(entries, tool, INPUT[tool]));
      refused(
        await call(entries, tool, {
          ...INPUT[tool],
          ...change,
          confirm: true,
          send_id: preview.send_id,
        }),
      );
      expect(dispatched()).toBe(0);
    },
  );
});

describe("the body (OD-24)", () => {
  it.each([
    ["empty", ""],
    ["whitespace only", " \t\r\n "],
    ["a control character", "a\u0007b"],
    ["a zero-width character", "a​b"],
    ["a bidirectional character", "a‮b"],
    ["a tag character", "a\u{E0041}b"],
    ["a C1 control", "a\u0085b"],
  ])("%s is refused at the mint and the confirm, 0 dispatches", async (_name, body) => {
    for (const tool of TOOLS) {
      const entries = sends();
      const error = refused(await call(entries, tool, { ...INPUT[tool], body }));
      expect(error.errors).toEqual([expect.objectContaining({ field: "body" })]);
      const preview = minted(await call(entries, tool, INPUT[tool]));
      refused(
        await call(entries, tool, {
          ...INPUT[tool],
          body,
          confirm: true,
          send_id: preview.send_id,
        }),
      );
    }
    expect(dispatched()).toBe(0);
  });

  it.each([1, null, undefined, ["x"]])(
    "a body that is not a string (%s) is refused",
    async (body) => {
      for (const tool of TOOLS) refused(await call(sends(), tool, { ...INPUT[tool], body }));
      expect(dispatched()).toBe(0);
    },
  );

  it("tab, line feed and carriage return are allowed", async () => {
    for (const tool of TOOLS)
      minted(await call(sends(), tool, { ...INPUT[tool], body: "a\tb\nc\rd" }));
  });

  it.each(TOOLS)("%s: sends the body HTML-escaped, each line break one <br>", async (tool) => {
    on(tool).reply(201, answer(tool), { headers: JSON_TYPE });
    const body = `a & b < c > d " e ' f\r\ng\nh\ri\n\nj`;
    await mintThenConfirm(sends(), tool, { ...INPUT[tool], body });
    expect(sentBodies()[0]).toMatchObject({
      body: "a &amp; b &lt; c &gt; d &quot; e &#39; f<br>g<br>h<br>i<br><br>j",
    });
  });
});

describe("an entry never rejects", () => {
  const inputs: [string, unknown][] = [
    ["null", null],
    ["a string", "x"],
    ["a number", 42],
    [
      "an input whose getter throws",
      Object.defineProperty({ body: "x" }, "id", {
        enumerable: true,
        get() {
          throw new Error("boom");
        },
      }),
    ],
    [
      "a Proxy that throws on ownKeys",
      new Proxy(
        {},
        {
          ownKeys() {
            throw new Error("boom");
          },
        },
      ),
    ],
    ["a ticket id of 0", { id: 0, body: "x" }],
    ["a ticket id that is a string", { id: "42", body: "x" }],
    ["a deadline that is a BigInt", { id: 42, body: "x", deadline: 10n }],
  ];

  it.each(inputs)("%s is refused as validation, nothing sent", async (_name, input) => {
    for (const tool of TOOLS) {
      const result = await settle(sends()[tool].send(input as never));
      refused(result);
    }
    expect(dispatched()).toBe(0);
  });

  it("an answer in an unexpected shape after the POST is a server error, the id kept spent", async () => {
    on("reply_to_ticket").reply(201, { nope: true }, { headers: JSON_TYPE });
    const entries = sends();
    const preview = minted(await call(entries, "reply_to_ticket", INPUT.reply_to_ticket));
    const confirm = { ...INPUT.reply_to_ticket, confirm: true, send_id: preview.send_id };
    expect(await call(entries, "reply_to_ticket", confirm)).toMatchObject({
      ok: false,
      error: { code: "server", retryable: false },
      attempts: 1,
    });
    refused(await call(entries, "reply_to_ticket", confirm));
    expect(dispatched()).toBe(1);
  });
});
