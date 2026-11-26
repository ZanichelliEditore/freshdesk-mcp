// T-069 (RFC 2026-11-25-write-safety-core, invariant 4): a note's recipients
// are agents, named by id. The core de-duplicates the ids, caps them at 10,
// fetches each agent's work email (one GET per distinct id, counted in
// `attempts`) and refuses the whole write, no POST sent, when any recipient
// cannot be resolved. Every address below is invented.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WriteResult } from "../../src/core/resources.js";
import { createWritePath, type NoteInput, type WriteEntries } from "../../src/core/write-path.js";
import { conversationPages } from "../fixtures/tickets.js";
import { type MockAgent, mockDispatcher } from "../support/mock-dispatcher.js";

const DOMAIN = "acme.freshdesk.com";
const ORIGIN = `https://${DOMAIN}`;
const JSON_TYPE = { "content-type": "application/json" };
const limits = { reserve_pct: 20, floor_pct: 5, pacing_rps: 2 };
const NOTE = conversationPages[0]![0]!;

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

function entries(): WriteEntries {
  const { entries } = createWritePath({
    domain: DOMAIN,
    apiKey: "k3y",
    dispatcher: mock,
    limits,
    toolsets: ["core", "write"],
    forwardAllowList: [],
  });
  if (entries === undefined) throw new Error("expected entries");
  return entries;
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

function email(id: number): string {
  return `agent${id}@example.test`;
}

function agentRecord(id: number, contact: Record<string, unknown> = {}): object {
  return { id, contact: { active: true, email: email(id), name: `Agent ${id}`, ...contact } };
}

function onAgent(id: number) {
  return mock.get(ORIGIN).intercept({ path: `/api/v2/agents/${id}`, method: "GET" });
}

function replyAgent(id: number, record: object = agentRecord(id)) {
  onAgent(id).reply(200, record, { headers: JSON_TYPE });
}

function onNote(id = 42) {
  return mock.get(ORIGIN).intercept({ path: `/api/v2/tickets/${id}/notes`, method: "POST" });
}

function calls() {
  return mock.getCallHistory()?.calls() ?? [];
}

function gets(): number {
  return calls().filter((call) => call.method === "GET").length;
}

function posts(): number {
  return calls().filter((call) => call.method === "POST").length;
}

function postedBody(): Record<string, unknown> {
  const post = calls().filter((call) => call.method === "POST");
  expect(post).toHaveLength(1);
  return JSON.parse(post[0]!.body as string) as Record<string, unknown>;
}

function failure<T>(result: WriteResult<T>) {
  if (result.ok) throw new Error(`expected an error, got ${JSON.stringify(result.value)}`);
  return result.error;
}

function note(notify: unknown): NoteInput {
  return { id: 42, body: "Please have a look.", notify } as NoteInput;
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe("notify: resolved recipients", () => {
  it("[3, 3, 5] gives two GETs and a note holding the two emails, every request counted", async () => {
    replyAgent(3);
    replyAgent(5);
    onNote().reply(201, NOTE, { headers: JSON_TYPE });

    const result = await settle(entries().add_note.note(note([3, 3, 5])));

    expect(result).toMatchObject({ ok: true, attempts: 3 });
    expect(gets()).toBe(2);
    expect(postedBody()).toEqual({
      body: "Please have a look.",
      private: true,
      notify_emails: [email(3), email(5)],
    });
  });

  it("works the same through hand_off_draft's note", async () => {
    replyAgent(7);
    onNote().reply(201, NOTE, { headers: JSON_TYPE });

    const result = await settle(entries().hand_off_draft.note(note([7])));

    expect(result).toMatchObject({ ok: true, attempts: 2 });
    expect(postedBody()).toMatchObject({ private: true, notify_emails: [email(7)] });
  });

  it("accepts exactly 10 distinct ids", async () => {
    for (const id of range(1, 10)) replyAgent(id);
    onNote().reply(201, NOTE, { headers: JSON_TYPE });

    const result = await settle(entries().add_note.note(note(range(1, 10))));

    expect(result).toMatchObject({ ok: true, attempts: 11 });
    expect(gets()).toBe(10);
    expect(postedBody().notify_emails).toEqual(range(1, 10).map(email));
  });

  it("accepts 11 ids that de-duplicate to 10", async () => {
    for (const id of range(1, 10)) replyAgent(id);
    onNote().reply(201, NOTE, { headers: JSON_TYPE });

    const result = await settle(entries().add_note.note(note([...range(1, 10), 4])));

    expect(result).toMatchObject({ ok: true, attempts: 11 });
    expect(gets()).toBe(10);
  });

  it.each([
    ["absent", undefined],
    ["empty", []],
  ])("with no ids (%s) sends the note with no notify_emails key and no GET", async (_, ids) => {
    onNote().reply(201, NOTE, { headers: JSON_TYPE });

    const result = await settle(entries().add_note.note(note(ids)));

    expect(result).toMatchObject({ ok: true, attempts: 1 });
    expect(gets()).toBe(0);
    expect(postedBody()).toEqual({ body: "Please have a look.", private: true });
  });

  it("counts the lookups when the POST itself fails", async () => {
    replyAgent(3);
    onNote().reply(500, { description: "boom" }, { headers: JSON_TYPE });

    const result = await settle(entries().add_note.note(note([3])));

    expect(failure(result)).toMatchObject({ code: "server" });
    expect(result.attempts).toBe(2);
  });
});

describe("notify: a recipient that cannot be resolved refuses the whole write", () => {
  // Agent 3 resolves; agent 5 is the one that fails, so a note to the
  // recipients that did resolve would be the wrong answer.
  const lookups: [string, () => void, string][] = [
    [
      "an unknown id (404)",
      () => onAgent(5).reply(404, { message: "not found" }, { headers: JSON_TYPE }),
      "not_found",
    ],
    [
      "a 5xx",
      () => onAgent(5).reply(503, { message: "down" }, { headers: JSON_TYPE }).persist(),
      "server",
    ],
    [
      "a timeout",
      () => onAgent(5).reply(200, agentRecord(5), { headers: JSON_TYPE }).delay(60_000).persist(),
      "network",
    ],
    [
      "rate_limited",
      () =>
        onAgent(5)
          .reply(429, "", { headers: { "retry-after": "1" } })
          .times(4),
      "rate_limited",
    ],
  ];

  it.each(lookups)("%s", async (_, failing, cause) => {
    replyAgent(3);
    failing();
    onNote().reply(201, NOTE, { headers: JSON_TYPE });

    const result = await settle(entries().add_note.note(note([3, 5])));

    const error = failure(result);
    expect(error).toMatchObject({ code: "validation", http_status: null, retryable: false });
    expect(error.errors).toEqual([expect.objectContaining({ field: "notify", code: cause })]);
    expect(error.message).toContain("nothing was sent");
    expect(posts()).toBe(0);
    expect(result.attempts).toBe(calls().length);
  });

  const records: [string, object, string][] = [
    ["a null email", agentRecord(5, { email: null }), "no_email"],
    ["no email", { id: 5, contact: { active: true, name: "Agent 5" } }, "no_email"],
    ["an empty email", agentRecord(5, { email: "" }), "no_email"],
    ["an email with no @", agentRecord(5, { email: "agent5.example.test" }), "no_email"],
    [
      "an email with two addresses",
      agentRecord(5, { email: "a@example.test,b@example.test" }),
      "no_email",
    ],
    ["an email with a space", agentRecord(5, { email: "agent 5@example.test" }), "no_email"],
    [
      "an email with a line break",
      agentRecord(5, { email: "agent5@example.test\nBcc: x" }),
      "no_email",
    ],
    [
      "an email with a C1 control",
      agentRecord(5, { email: "agent5\u0085@example.test" }),
      "no_email",
    ],
    [
      "an email with a zero-width space",
      agentRecord(5, { email: "agent5\u200b@example.test" }),
      "no_email",
    ],
    [
      "an email with a bidi override",
      agentRecord(5, { email: "agent5@\u202eexample.test" }),
      "no_email",
    ],
    ["an email with a colon", agentRecord(5, { email: "agent5@example.test:25" }), "no_email"],
    ["an email with no domain dot", agentRecord(5, { email: "agent5@localhost" }), "no_email"],
    ["a deactivated agent", { ...agentRecord(5), deactivated: true }, "inactive"],
    ["an inactive contact", agentRecord(5, { active: false }), "inactive"],
    [
      "the active flag missing",
      { id: 5, contact: { email: email(5), name: "Agent 5" } },
      "inactive",
    ],
    ["the active flag not a boolean", agentRecord(5, { active: "true" }), "inactive"],
    ["deactivated not a boolean", { ...agentRecord(5), deactivated: "false" }, "inactive"],
  ];

  it.each(records)("%s", async (_, record, cause) => {
    replyAgent(3);
    replyAgent(5, record);
    onNote().reply(201, NOTE, { headers: JSON_TYPE });

    const result = await settle(entries().add_note.note(note([3, 5])));

    const error = failure(result);
    expect(error).toMatchObject({ code: "validation", http_status: null });
    expect(error.errors).toEqual([expect.objectContaining({ field: "notify", code: cause })]);
    expect(posts()).toBe(0);
    expect(gets()).toBe(2);
    expect(result.attempts).toBe(2);
    // The refusal quotes no address, resolved or not.
    expect(JSON.stringify(error)).not.toContain("example.test");
  });
});

describe("notify: ids refused before any request", () => {
  it("11 distinct ids", async () => {
    onNote().reply(201, NOTE, { headers: JSON_TYPE });

    const result = await settle(entries().add_note.note(note(range(1, 11))));

    const error = failure(result);
    expect(error).toMatchObject({ code: "validation", http_status: null });
    expect(error.errors).toEqual([expect.objectContaining({ field: "notify" })]);
    expect(result.attempts).toBe(0);
    expect(calls()).toHaveLength(0);
  });

  it.each([
    ["id 0", [3, 0]],
    ["a negative id", [-3]],
    ["a non-integer id", [3, 1.5]],
    ["an id given as a string", ["3"]],
    ["NaN", [Number.NaN]],
    ["an id past the safe integers", [2 ** 53]],
    ["ids that are not a list", "3"],
    ["a list with a hole", [3, , 5]],
  ])("%s", async (_, ids) => {
    onNote().reply(201, NOTE, { headers: JSON_TYPE });

    const result = await settle(entries().add_note.note(note(ids)));

    const error = failure(result);
    expect(error).toMatchObject({ code: "validation", http_status: null });
    expect(error.errors).toEqual([expect.objectContaining({ field: "notify" })]);
    expect(result.attempts).toBe(0);
    expect(calls()).toHaveLength(0);
  });

  it("an invalid ticket id, with agents to notify, sends no lookup", async () => {
    replyAgent(3);

    const result = await settle(
      entries().add_note.note({ id: 0, body: "x", notify: [3] } as NoteInput),
    );

    expect(failure(result)).toMatchObject({ code: "validation", http_status: null });
    expect(result.attempts).toBe(0);
    expect(calls()).toHaveLength(0);
  });

  it("a list that throws when read resolves to a refusal, never a rejection", async () => {
    const ids = new Proxy([3], {
      get() {
        throw new Error("boom");
      },
    });

    const result = await settle(entries().add_note.note(note(ids)));

    expect(failure(result)).toMatchObject({ code: "validation", http_status: null });
    expect(calls()).toHaveLength(0);
  });

  it("reads each id once: a list whose reads differ notifies what the first read held", async () => {
    replyAgent(3);
    onNote().reply(201, NOTE, { headers: JSON_TYPE });
    let reads = 0;
    const ids = new Proxy([3], {
      get(target, key, receiver) {
        if (key === "0") {
          reads += 1;
          return reads === 1 ? 3 : 0;
        }
        return Reflect.get(target, key, receiver) as unknown;
      },
    });

    const result = await settle(entries().add_note.note(note(ids)));

    expect(result).toMatchObject({ ok: true, attempts: 2 });
    expect(reads).toBe(1);
    expect(gets()).toBe(1);
    expect(postedBody().notify_emails).toEqual([email(3)]);
  });

  it.each([
    ["a symbol", Symbol("deadline")],
    ["a BigInt", 1n],
    ["a string", "soon"],
  ])("a deadline that is %s resolves to a refusal with nothing sent", async (_, deadline) => {
    replyAgent(3);
    onNote().reply(201, NOTE, { headers: JSON_TYPE });

    const result = await settle(
      entries().add_note.note({ id: 42, body: "x", notify: [3], deadline } as unknown as NoteInput),
    );

    expect(failure(result)).toMatchObject({ code: "validation", http_status: null });
    expect(result.attempts).toBe(0);
    expect(calls()).toHaveLength(0);
  });
});
