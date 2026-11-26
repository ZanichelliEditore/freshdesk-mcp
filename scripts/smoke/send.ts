// The send smoke (`make smoke-send`, T-086; SPEC §11, §13 M3, §14 rule 1;
// RFC 2026-11-26-send-safety-core, OD-20, OD-21, OD-28): one send, run by
// the owner's hand on one `mcp-test` ticket of the real account. Never run
// by a test or CI against Freshdesk (T-087 is the owner's run). A separate
// target from `make smoke-write`, so a send is never one flag away from a
// write run (OD-28).
//
//   - Sends only through the core's send entries (AGENTS.md hard rule 1):
//     the context is built by `createContext` from the configuration
//     `loadConfig` reads, as the server's cli.ts builds it, so the send
//     entries exist only when the team file enables `send`, and the tool
//     called is the `send` toolset's that `toolsetsOf` gives for that
//     context. This module builds no client, sets no request of its own
//     other than the ticket check's GET (through the context's GET-only
//     view) and names no toolset (test/smoke-send.test.ts reads its source).
//     From src/core/ it takes T-081's matcher alone, to check the ticket's
//     addresses against the team's `forward_allow_list` before any send.
//   - One case per run: `reply` (`reply_to_ticket`, C5), `forward`
//     (`forward_ticket`, C4) or `public-note` (`add_public_note`, OD-26), on
//     one ticket (`--ticket`). A forward's `to` comes from `--to`, each
//     address on the team's `forward_allow_list`; the case takes no `cc`,
//     and neither does a reply. The body is the case's fixed text below.
//     The arguments are checked before any request; a refusal never quotes
//     them, an address included.
//   - Before the send, one GET of the ticket with `include=requester` (A6).
//     It refuses, with nothing sent: a GET that fails (its code); `tags` not
//     a list of strings, `spam` not a boolean, no requester email, or any of
//     the four CC fields (`cc_emails`, `fwd_emails`, `reply_cc_emails`,
//     `ticket_cc_emails`, names unverified, A6) absent, null or not a list
//     of strings; no `mcp-test` tag (exactly); a spam ticket; for a reply or
//     a public note, a requester not on the allow-list; any CC field not
//     empty. A requester email is required for a forward too (fail closed).
//   - The one A4 exception (OD-21, owner 2026-11-26): with
//     `--ticket-cc allow-listed` (`TICKET_CC=allow-listed`), on the reply
//     case only, the four CC fields together, lower-cased, must hold exactly
//     one distinct address, on the allow-list by T-081's matcher and not the
//     requester's email; anything else refuses. Any other `TICKET_CC` value,
//     or the flag on a forward or a public note, refuses before any request.
//   - Not atomic: a CC or tag changed between the GET and the POST is not
//     seen (the tickets are the owner's own test tickets).
//   - Each send is two calls of the tool (OD-20): without `confirm`, the
//     "Not sent" result and a `send_id`, with 0 requests; then
//     `confirm: true` with that `send_id`, the same arguments.
//   - A public note's answer is read at the dispatcher for its `private`
//     flag alone (the core returns only the conversation id): printed yes,
//     no or unknown, so T-087's A3 run shows whether Freshdesk kept the
//     note public. Anything but `no` fails the run.
//   - Output: yes/no and counts. Never an id, an address, a subject, a body,
//     a name, the domain or the key. The client's one line per request goes
//     to stderr (its verb, path template and status).
//   - It refuses to start with FRESHDESK_HOST_OVERRIDE set, as `make smoke`.
//
// Exit code: 0 when the send was made (and a public note came back public),
// 1 otherwise.

import type { Dispatcher } from "undici";
import { z } from "zod";
import { ConfigError, loadConfig } from "../../src/config.js";
import { onAllowList } from "../../src/core/recipients.js";
import { type AppContext, createContext, toolsetsOf } from "../../src/tools/context.js";

type Out = (line: string) => void;

/** The command line's values, as given; checked by `runSend`. */
export interface SendArgs {
  case?: string;
  ticket?: string;
  to?: string;
  ticketCc?: string;
}

/** The tag a ticket must carry before the run sends on it (SPEC §11). */
export const TEST_TAG = "mcp-test";

/** The one value of `TICKET_CC` (OD-21's A4 run). */
export const TICKET_CC_FLAG = "allow-listed";

/** The case's fixed body. */
export const BODIES = {
  reply: "freshdesk-mcp smoke-send: a test reply on an mcp-test ticket. No action needed.",
  forward: "freshdesk-mcp smoke-send: a test forward of an mcp-test ticket. No action needed.",
  "public-note":
    "freshdesk-mcp smoke-send: a test public note on an mcp-test ticket. No action needed.",
} as const;

const TOOLS = {
  reply: "reply_to_ticket",
  forward: "forward_ticket",
  "public-note": "add_public_note",
} as const;

type Case = keyof typeof TOOLS;

/** The ticket's CC fields (A6; names unverified). */
export const CC_FIELDS = [
  "cc_emails",
  "fwd_emails",
  "reply_cc_emails",
  "ticket_cc_emails",
] as const;

/** The ticket check's GET ends within this. */
const CHECK_DEADLINE_MS = 30_000;

/** A public note's answer is read up to this many bytes. */
const ANSWER_CAP = 1 << 20;

interface Plan {
  name: Case;
  ticket: number;
  to: string[];
  ticketCc: boolean;
}

/** The arguments checked, or why not (never quoting them). */
function plan(args: SendArgs): Plan | string {
  const name = args.case;
  if (name === undefined || !Object.hasOwn(TOOLS, name)) {
    return "CASE takes reply, forward or public-note";
  }
  const ticket = args.ticket ?? "";
  if (!/^[1-9][0-9]*$/.test(ticket) || !Number.isSafeInteger(Number(ticket))) {
    return "TICKET takes one ticket id";
  }
  const to = args.to ? args.to.split(",") : [];
  if (name === "forward" && to.length === 0) return "forward takes TO, addresses comma-separated";
  if (name !== "forward" && to.length > 0) return "TO is taken by forward only";
  const flag = args.ticketCc ?? "";
  if (flag !== "" && flag !== TICKET_CC_FLAG) return `TICKET_CC takes ${TICKET_CC_FLAG} only`;
  if (flag !== "" && name !== "reply") return "TICKET_CC is taken by reply only";
  return { name: name as Case, ticket: Number(ticket), to, ticketCc: flag !== "" };
}

/** An error code as printed: a known spelling, else `unknown`. */
function codeOf(error: unknown): string {
  const code = (error as { code?: unknown } | undefined)?.code;
  return typeof code === "string" && /^[a-z_]{1,40}$/.test(code) ? code : "unknown";
}

const yes = (value: boolean) => (value ? "yes" : "no");

const strings = z.array(z.string());

/** Why the ticket is refused, or `undefined` when the case may send on it. */
async function ticketRefusal(
  context: AppContext,
  checked: Plan,
  allowList: readonly string[],
  out: Out,
): Promise<string | undefined> {
  const found = await context.http.requestWithRetry(
    { path: "/tickets/{id}", params: { id: checked.ticket }, query: { include: "requester" } },
    Date.now() + CHECK_DEADLINE_MS,
  );
  if (!found.ok) return `GET failed: ${codeOf(found.error)}`;
  const ticket = (
    typeof found.body === "object" && found.body !== null ? found.body : {}
  ) as Record<string, unknown>;
  if (!strings.safeParse(ticket.tags).success) return "tags field missing";
  if (typeof ticket.spam !== "boolean") return "spam field missing";
  const requester = ticket.requester as { email?: unknown } | null | undefined;
  const email = typeof requester === "object" && requester !== null ? requester.email : undefined;
  if (typeof email !== "string" || email === "") return "requester email missing";
  const ccs: string[] = [];
  for (const field of CC_FIELDS) {
    const list = strings.safeParse(ticket[field]);
    if (!list.success) return `${field} field missing`;
    ccs.push(...list.data);
  }
  if (!(ticket.tags as string[]).includes(TEST_TAG)) return `no ${TEST_TAG} tag`;
  if (ticket.spam) return "spam";
  const requesterListed = onAllowList(allowList, email);
  if (checked.name !== "forward" && !requesterListed) return "requester not on the allow-list";
  const distinct = new Set(ccs.map((cc) => cc.toLowerCase()));
  if (!checked.ticketCc) {
    for (const field of CC_FIELDS) {
      if ((ticket[field] as string[]).length > 0) return `${field} not empty`;
    }
  } else {
    if (distinct.size !== 1) {
      return `ticket CC: ${distinct.size} distinct addresses, ${TICKET_CC_FLAG} takes exactly one`;
    }
    const [cc] = [...distinct];
    if (!onAllowList(allowList, cc!)) return "ticket CC not on the allow-list";
    if (cc === email.toLowerCase()) return "ticket CC is the requester";
  }
  out(
    `ticket: tag ${TEST_TAG} yes, spam no, requester on the allow-list ${yes(requesterListed)}, ticket CC ${distinct.size}`,
  );
  return undefined;
}

/** A public note's answer, as the tap read it. */
type Answer = { private: boolean | undefined };

/**
 * Wraps `handler` to keep a response's body, up to ANSWER_CAP bytes, and
 * read its `private` flag into `answer` at the end; every call passed on.
 */
function tap(handler: Dispatcher.DispatchHandler, answer: Answer): Dispatcher.DispatchHandler {
  const chunks: Buffer[] = [];
  let size = 0;
  return {
    onRequestStart: (controller, context) => handler.onRequestStart?.(controller, context),
    onRequestUpgrade: (controller, status, headers, socket) =>
      handler.onRequestUpgrade?.(controller, status, headers, socket),
    onResponseStart: (controller, status, headers, message) =>
      handler.onResponseStart?.(controller, status, headers, message),
    onResponseData: (controller, chunk) => {
      size += chunk.length;
      if (size <= ANSWER_CAP) chunks.push(chunk);
      return handler.onResponseData?.(controller, chunk);
    },
    onResponseEnd: (controller, trailers) => {
      try {
        const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const flag = (body as { private?: unknown } | null)?.private;
        answer.private = typeof flag === "boolean" ? flag : undefined;
      } catch {
        answer.private = undefined;
      }
      return handler.onResponseEnd?.(controller, trailers);
    },
    onResponseError: (controller, error) => handler.onResponseError?.(controller, error),
  };
}

/** A tool's answer: its value, or its error's code and whether it may have been sent. */
type Called = { ok: true; value: unknown } | { ok: false; code: string; maybe: boolean };
type Call = (args: Record<string, unknown>) => Promise<Called>;

const shapes = {
  notSent: z.object({
    sent: z.literal(false),
    send_id: z.string().min(1),
    recipients: z.object({ to: z.array(z.unknown()), cc: z.array(z.unknown()) }),
  }),
  sent: z.object({ sent: z.literal(true), api_calls_used: z.number().int().nonnegative() }),
};

/** Loads the configuration from `env` as the server does, checks the ticket, then sends. */
export async function runSend(
  env: NodeJS.ProcessEnv,
  dispatcher: Dispatcher,
  out: Out,
  args: SendArgs,
): Promise<number> {
  try {
    return await smokeSend(env, dispatcher, out, args);
  } catch {
    out("smoke send: fail (unexpected error)");
    return 1;
  }
}

async function smokeSend(
  env: NodeJS.ProcessEnv,
  dispatcher: Dispatcher,
  out: Out,
  args: SendArgs,
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
  // Every request counted at the dispatcher, retries included; a public
  // note's answer read for its `private` flag.
  let requests = 0;
  const answer: Answer = { private: undefined };
  const counting = dispatcher.compose((dispatch) => (options, handler) => {
    requests += 1;
    const note = checked.name === "public-note" && options.path.endsWith("/notes");
    return dispatch(options, note ? tap(handler, answer) : handler);
  });
  let context: AppContext;
  let allowList: readonly string[];
  try {
    const config = loadConfig(env);
    allowList = config.team.forward_allow_list;
    context = createContext(config, counting);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    out("config: fail (check FRESHDESK_DOMAIN, FRESHDESK_API_KEY, FRESHDESK_MCP_CONFIG)");
    return 1;
  }
  const name = TOOLS[checked.name];
  const tool = toolsetsOf(context).send?.find((each) => each.name === name);
  if (tool === undefined) {
    out("config: fail (the team file does not enable send: add it to toolsets)");
    return 1;
  }
  const off = checked.to.findIndex((address) => !onAllowList(allowList, address));
  if (off !== -1) {
    out(`config: fail (TO address ${off + 1} of ${checked.to.length} is not on the allow-list)`);
    return 1;
  }
  const label = `smoke send ${checked.name}`;
  out(
    `${label}: ${name} through the core's send entry, on one ${TEST_TAG} ticket only; yes/no and counts, no ids, addresses or text. Check the mailboxes and the ticket's activity log afterwards.`,
  );
  const refusal = await ticketRefusal(context, checked, allowList, out);
  if (refusal !== undefined) {
    out(`ticket: refused (${refusal})`);
    out(`${label}: refused, nothing sent; requests ${requests}`);
    return 1;
  }
  const call: Call = async (input) => {
    const parsed = tool.input.safeParse(input);
    if (!parsed.success) return { ok: false, code: "validation", maybe: false };
    const result = await tool.handler(parsed.data, context);
    if (result.ok) return { ok: true, value: result.value };
    const maybe = (result.error as { may_have_been_sent?: unknown }).may_have_been_sent === true;
    return { ok: false, code: codeOf(result.error), maybe };
  };
  const ok = await send(checked, call, out, () => requests, answer);
  out(`${label}: ${ok ? "ok" : "fail"}, requests ${requests}`);
  return ok ? 0 : 1;
}

/** The two calls of the case's tool; true when the send was made. */
async function send(
  checked: Plan,
  call: Call,
  out: Out,
  requests: () => number,
  answer: Answer,
): Promise<boolean> {
  const tool = TOOLS[checked.name];
  const input = {
    ticket_id: checked.ticket,
    body: BODIES[checked.name],
    ...(checked.name === "forward" ? { to: checked.to } : {}),
  };
  const before = requests();
  const first = await call(input);
  if (!first.ok) {
    out(`${tool} step 1: fail ${first.code}`);
    return false;
  }
  const preview = shapes.notSent.safeParse(first.value);
  if (!preview.success) {
    out(`${tool} step 1: fail shape`);
    return false;
  }
  const { recipients } = preview.data;
  out(
    `${tool} step 1: not sent yes, send_id yes, to ${recipients.to.length}, cc ${recipients.cc.length}, requests ${requests() - before}`,
  );
  const second = await call({ ...input, confirm: true, send_id: preview.data.send_id });
  if (!second.ok) {
    out(`${tool} step 2: fail ${second.code}, may_have_been_sent ${yes(second.maybe)}`);
    return false;
  }
  const done = shapes.sent.safeParse(second.value);
  if (!done.success) {
    out(`${tool} step 2: fail shape`);
    return false;
  }
  if (checked.name !== "public-note") {
    out(`${tool} step 2: sent yes, api calls ${done.data.api_calls_used}`);
    return true;
  }
  const shown = answer.private === undefined ? "unknown" : yes(answer.private);
  out(`${tool} step 2: sent yes, api calls ${done.data.api_calls_used}, answered private ${shown}`);
  return answer.private === false;
}
