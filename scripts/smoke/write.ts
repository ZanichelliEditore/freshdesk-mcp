// The write smoke (`make smoke-write`, T-075; SPEC §11, §13 M2, §14 rule 1):
// one write use case, run by the owner's hand on `mcp-test` tickets of the
// real account. Never run by a test or CI against Freshdesk (T-076 is the
// owner's run).
//
//   - Writes only through the write path (RFC 2026-11-25-write-safety-core;
//     AGENTS.md hard rule 1): the context is built by `createContext` from
//     the configuration `loadConfig` reads, as the server's cli.ts builds it,
//     so the write entries exist only when the team file enables `write`,
//     and the tools called are the `write` toolset `toolsetsOf` gives for
//     that context. This module builds no client, sets no request of its
//     own other than the tag check's GET (through the context's GET-only
//     view) and names no toolset (test/smoke-write.test.ts reads its source).
//   - One case per run: C1 and C8 `categorize_tickets` (preview, then
//     confirm with its `preview_id`), C4 `add_note`, C5 `update_ticket`, C6
//     `hand_off_draft`. The arguments come from the command line as given
//     (`--case`, `--tickets`, `--fields`, `--notify`) and are checked before
//     any request; a refusal never quotes them. The note and the draft are
//     the fixed texts below. No case sends a tag change, so the run cannot
//     take the `mcp-test` tag off a ticket.
//   - Before any write, one GET per ticket, in order, stopping at the first
//     refused: a ticket without the tag `mcp-test` (exactly, case
//     included), a spam ticket, one whose `tags` is not a list of strings or
//     whose `spam` is not a boolean, and a GET that fails (its code) each
//     refuse the run with nothing written.
//   - Output: yes/no and counts, tickets by position (`ticket 1 of 2`); a
//     failure is its error code only. Never an id, a subject, a body, a
//     field value, a name, the domain or the key. The client's one line per
//     request goes to stderr (its verb, path template and status).
//   - It refuses to start with FRESHDESK_HOST_OVERRIDE set, as `make smoke`.
//
// Exit code: 0 when every write of the case was made, 1 otherwise.

import type { Dispatcher } from "undici";
import { z } from "zod";
import { getTicket } from "../../src/client/resources/tickets.js";
import { ConfigError, loadConfig } from "../../src/config.js";
import { type AppContext, createContext, toolsetsOf } from "../../src/tools/context.js";

type Out = (line: string) => void;

/** The command line's values, as given; checked by `runWrite`. */
export interface WriteArgs {
  case?: string;
  tickets?: string;
  fields?: string;
  notify?: string;
}

/** The tag a ticket must carry before the run writes to it (SPEC §11). */
export const TEST_TAG = "mcp-test";

/** C4's note. */
export const NOTE_BODY =
  "freshdesk-mcp smoke-write C4: a test note on an mcp-test ticket. No action needed.";

/** C6's draft, after the tool's DRAFT REPLY header. */
export const DRAFT_BODY =
  "freshdesk-mcp smoke-write C6: a test draft on an mcp-test ticket. Do not send it.";

const TOOLS = {
  C1: "categorize_tickets",
  C8: "categorize_tickets",
  C4: "add_note",
  C5: "update_ticket",
  C6: "hand_off_draft",
} as const;

type Case = keyof typeof TOOLS;

/** categorize_tickets' cap (src/tools/preview.ts). */
const MAX_TICKETS = 50;

/** The tag check's GET ends within this. */
const CHECK_DEADLINE_MS = 30_000;

interface Plan {
  name: Case;
  tickets: number[];
  fields: Record<string, unknown> | undefined;
  notify: number[] | undefined;
}

/** Positive safe integers, comma-separated; `undefined` when any is not one. */
function ids(list: string): number[] | undefined {
  const parts = list.split(",");
  if (!parts.every((part) => /^[1-9][0-9]*$/.test(part))) return undefined;
  const values = parts.map(Number);
  return values.every(Number.isSafeInteger) ? values : undefined;
}

/** The arguments checked, or why not (never quoting them). */
function plan(args: WriteArgs): Plan | string {
  const name = args.case;
  if (name === undefined || !Object.hasOwn(TOOLS, name)) {
    return "CASE takes C1, C4, C5, C6 or C8";
  }
  const tickets = ids(args.tickets ?? "");
  if (tickets === undefined) return "TICKETS takes ticket ids, comma-separated";
  if (new Set(tickets).size !== tickets.length) return "TICKETS names a ticket twice";
  const many = name === "C1" || name === "C8";
  if (!many && tickets.length !== 1) return `${name} takes one ticket`;
  if (tickets.length > MAX_TICKETS) return `${name} takes at most ${MAX_TICKETS} tickets`;
  let fields: Record<string, unknown> | undefined;
  if (name === "C4") {
    if (args.fields) return "C4 takes no FIELDS";
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(args.fields ?? "");
    } catch {
      parsed = undefined;
    }
    const isObject = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
    if (!isObject || Object.keys(parsed as object).length === 0) {
      return `${name} takes FIELDS, a JSON object of at least one field`;
    }
    fields = parsed as Record<string, unknown>;
  }
  let notify: number[] | undefined;
  if (args.notify) {
    if (name !== "C4" && name !== "C6") return "NOTIFY is taken by C4 and C6 only";
    notify = ids(args.notify);
    if (notify === undefined) return "NOTIFY takes agent ids, comma-separated";
  }
  return { name: name as Case, tickets, fields, notify };
}

/** An error code as printed: a known spelling, else `unknown`. */
function codeOf(error: unknown): string {
  const code = (error as { code?: unknown } | undefined)?.code;
  return typeof code === "string" && /^[a-z_]{1,40}$/.test(code) ? code : "unknown";
}

const yes = (value: boolean) => (value ? "yes" : "no");

/** Why the ticket is refused, or `undefined` when it is a non-spam `mcp-test` ticket. */
async function tagRefusal(context: AppContext, id: number): Promise<string | undefined> {
  const found = await getTicket(context.http, id, [], Date.now() + CHECK_DEADLINE_MS);
  if (!found.ok) return `GET failed: ${codeOf(found.error)}`;
  const { tags, spam } = found.ticket;
  if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === "string")) {
    return "tags field missing";
  }
  if (typeof spam !== "boolean") return "spam field missing";
  if (!tags.includes(TEST_TAG)) return `no ${TEST_TAG} tag`;
  if (spam) return "spam";
  return undefined;
}

type Call = (args: Record<string, unknown>) => Promise<{ ok: true; value: unknown } | string>;

const count = z.number().int().nonnegative();
const shapes = {
  update_ticket: z.object({ changed: z.boolean() }),
  add_note: z.object({ private: z.boolean(), notified_agent_ids: z.array(z.number()) }),
  hand_off_draft: z.object({
    private: z.boolean(),
    assigned: z.boolean(),
    notified_agent_ids: z.array(z.number()),
  }),
  preview: z.object({
    preview_id: z.string().nullable(),
    tickets: z.array(z.unknown()),
    not_previewed: z.array(z.object({ code: z.unknown() })),
  }),
  confirm: z.object({
    results: z.array(z.object({ result: z.string(), error: z.unknown().optional() })),
    written: count,
    refused: count,
    may_have_been_applied: count,
    not_attempted: count,
  }),
};

/** The case's writes through its tool; true when every one was made. */
async function write(plan: Plan, call: Call, out: Out): Promise<boolean> {
  const tool = TOOLS[plan.name];
  const fail = (code: string) => {
    out(`${tool}: fail ${code}`);
    return false;
  };
  const ticket_id = plan.tickets[0];
  const notify = plan.notify === undefined ? {} : { notify_agent_ids: plan.notify };
  if (plan.name === "C5") {
    const done = await call({ ticket_id, fields: plan.fields });
    if (typeof done === "string") return fail(done);
    const value = shapes.update_ticket.safeParse(done.value);
    if (!value.success) return fail("shape");
    out(`${tool}: changed ${yes(value.data.changed)}`);
    return value.data.changed;
  }
  if (plan.name === "C4") {
    const done = await call({ ticket_id, body: NOTE_BODY, ...notify });
    if (typeof done === "string") return fail(done);
    const value = shapes.add_note.safeParse(done.value);
    if (!value.success) return fail("shape");
    const { data } = value;
    out(
      `${tool}: written yes, private ${yes(data.private)}, notified ${data.notified_agent_ids.length}`,
    );
    return data.private;
  }
  if (plan.name === "C6") {
    const done = await call({ ticket_id, draft: DRAFT_BODY, fields: plan.fields, ...notify });
    if (typeof done === "string") return fail(done);
    const value = shapes.hand_off_draft.safeParse(done.value);
    if (!value.success) return fail("shape");
    const { data } = value;
    out(
      `${tool}: note yes, private ${yes(data.private)}, assigned ${yes(data.assigned)}, notified ${data.notified_agent_ids.length}`,
    );
    return data.private && data.assigned;
  }
  // C1, C8: the preview, then the confirm with its preview_id, on the same items.
  const items = plan.tickets.map((id) => ({ ticket_id: id, fields: plan.fields }));
  const n = items.length;
  const previewed = await call({ items });
  if (typeof previewed === "string") return fail(previewed);
  const preview = shapes.preview.safeParse(previewed.value);
  if (!preview.success) return fail("shape");
  out(`${tool} preview: previewed ${preview.data.tickets.length} of ${n}`);
  const previewId = preview.data.preview_id;
  if (previewId === null || preview.data.not_previewed.length > 0) {
    const codes = preview.data.not_previewed.map((one) => codeOf(one));
    out(`${tool} preview: fail, not previewed ${codes.join(" ") || "none"}; nothing written`);
    return false;
  }
  const confirmed = await call({ items, confirm: true, preview_id: previewId });
  if (typeof confirmed === "string") return fail(confirmed);
  const confirm = shapes.confirm.safeParse(confirmed.value);
  if (!confirm.success) return fail("shape");
  const { data } = confirm;
  out(
    `${tool} confirm: written ${data.written}, refused ${data.refused}, may_have_been_applied ${data.may_have_been_applied}, not_attempted ${data.not_attempted}`,
  );
  data.results.forEach((one, i) => {
    if (one.result === "written") return;
    const code = one.error === undefined ? "" : ` ${codeOf(one.error)}`;
    const result = /^[a-z_]{1,40}$/.test(one.result) ? one.result : "unknown";
    out(`${tool} confirm: ticket ${i + 1} of ${n} ${result}${code}`);
  });
  return data.written === n;
}

/**
 * Loads the configuration from `env` as the server does, checks the tickets'
 * tag, then runs the case's writes. Returns the exit code; never throws.
 */
export async function runWrite(
  env: NodeJS.ProcessEnv,
  dispatcher: Dispatcher,
  out: Out,
  args: WriteArgs,
): Promise<number> {
  try {
    return await smokeWrite(env, dispatcher, out, args);
  } catch {
    out("smoke write: fail (unexpected error)");
    return 1;
  }
}

async function smokeWrite(
  env: NodeJS.ProcessEnv,
  dispatcher: Dispatcher,
  out: Out,
  args: WriteArgs,
): Promise<number> {
  if (env.FRESHDESK_HOST_OVERRIDE) {
    out(
      "config: fail (FRESHDESK_HOST_OVERRIDE is set: the smoke run is for the real account only)",
    );
    return 1;
  }
  const checked = plan(args);
  if (typeof checked === "string") {
    out(`config: fail (${checked})`);
    return 1;
  }
  // Every request counted at the dispatcher, retries included.
  let requests = 0;
  const counting = dispatcher.compose((dispatch) => (options, handler) => {
    requests += 1;
    return dispatch(options, handler);
  });
  let context: AppContext;
  try {
    const config = loadConfig(env);
    context = createContext(config, counting);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    out("config: fail (check FRESHDESK_DOMAIN, FRESHDESK_API_KEY, FRESHDESK_MCP_CONFIG)");
    return 1;
  }
  const name = TOOLS[checked.name];
  const tool = toolsetsOf(context).write?.find((each) => each.name === name);
  if (tool === undefined) {
    out("config: fail (the team file does not enable write: add it to toolsets)");
    return 1;
  }
  const label = `smoke write ${checked.name}`;
  out(
    `${label}: ${name} through the write path, on ${TEST_TAG} tickets only; yes/no and counts, no ids, names or text. Check the activity log of each ticket afterwards.`,
  );
  const n = checked.tickets.length;
  for (const [i, id] of checked.tickets.entries()) {
    const refusal = await tagRefusal(context, id);
    if (refusal !== undefined) {
      out(`ticket ${i + 1} of ${n}: refused (${refusal})`);
      out(`${label}: refused, nothing written; requests ${requests}`);
      return 1;
    }
    out(`ticket ${i + 1} of ${n}: tag ${TEST_TAG} yes, spam no`);
  }
  const call: Call = async (input) => {
    const parsed = tool.input.safeParse(input);
    if (!parsed.success) return "validation";
    const result = await tool.handler(parsed.data, context);
    return result.ok ? { ok: true, value: result.value } : codeOf(result.error);
  };
  const ok = await write(checked, call, out);
  out(`${label}: ${ok ? "ok" : "fail"}, requests ${requests}`);
  return ok ? 0 : 1;
}
