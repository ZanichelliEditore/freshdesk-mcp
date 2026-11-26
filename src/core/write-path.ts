// The write path (RFC 2026-11-25-write-safety-core; AGENTS.md hard rule 1):
// the one path every request other than GET takes to Freshdesk. It is the
// project's safety core: no second path, no bypass flag, no environment
// override; a change here goes through `/rfc` first.
//
// This module holds invariant 1 (T-064):
//   - One `HttpClient`, on one limiter, built here and kept in a closure:
//     nothing outside this module gets it, so the shared budget is not
//     doubled (SPEC §4 goal 4) and no other module holds a client that can
//     write.
//   - Everything outside gets `view`, a `GetView` on that client: the tools
//     (`context.http`, src/tools/context.ts) and the schema service. Its type
//     takes GET-only requests (`GetHttp`); at runtime a request whose method
//     is anything but GET, or absent, is refused as `validation`,
//     `http_status: null`, before the limiter is asked and with nothing sent,
//     whether it came through `request`, `requestWithRetry` or `paginate`.
//     A method is read twice: one that answers differently the second time
//     (a getter, a Proxy) is refused, not trusted once. What goes to the
//     client is a copy whose method is the literal GET and with no body, so
//     no later read of the caller's object can turn it into a write and no
//     payload goes out with a read.
//   - `GetView` is a wrapper holding the client in a private field, not a
//     subclass: there is no base `request` on its prototype chain to reach
//     with `super` or a prototype call. The instance is frozen and has no
//     own keys. Not claimed: hostile code in the process, which can patch a
//     prototype.
//
// Lint keeps this module out of src/tools/**: it is on no place's list in
// eslint.tool-imports.json (test/lint-rules.test.ts). src/tools/context.ts,
// exempt from the list as the one file that builds the context, imports it.
//
// And invariants 2, 3, 5 and 6 (T-068), the write entry points:
//   - Built only when `write` is in the team's `toolsets` (`send` alone gives
//     none): with it absent, the write path has no `entries` key at all, so a
//     disabled toolset has nothing to call, by construction.
//   - One frozen entry per write tool, keyed by entry point: `update_ticket`,
//     `categorize_tickets`, `hand_off_draft` (its note and its assignment) and
//     `add_note`. Each entry closes over its own allow set
//     (src/core/allow-sets.ts): no input names a set, so a tool handed its own
//     entry cannot write with another's (T-071 hands them out).
//   - A ticket entry builds the body through `ticketInput` with its set; a
//     field outside it is `field_not_writable`, nothing sent. The body's
//     top-level keys are then checked against the keys the set's fields map
//     to (plus `custom_fields` when the set takes custom fields, and `tags`
//     when it takes tags): the schema is the tool's, so one forged by a cast
//     (a default field turned into a nested field whose level is named
//     `requester_id`) still cannot send a key outside the set. A value
//     inside the set is checked against that schema's choices only.
//   - `tags` is read by `update_ticket`'s entry only, as the ticket's whole
//     tag list (the tool merges add/remove from the current tags), a list
//     of strings, copied once and then checked; another entry never reads
//     the key. A change that sets nothing (no field, no tags) is refused.
//   - A note entry takes the ticket id and the body (a string), and nothing that names
//     a note's visibility or author: the payload is built here from a closed
//     key set, `{ body, private: true }` and the resolved `notify_emails`
//     (below), so `private: false`, `user_id`, `incoming`, attachments or a
//     caller's own `notify_emails` never reach Freshdesk, even passed by a cast.
//   - An entry never rejects. Every refusal is `validation`, `http_status:
//     null`, with nothing sent, per-field entries where a field is the cause;
//     an input that throws when read (a cast's getter, `null`) is one too.
//     The writes go through src/core/resources.ts, whose snapshot refuses a
//     body JSON cannot carry.
//
// And invariant 4 (T-069), notify recipients by agent id:
//   - A note entry's `notify` is a list of agent ids, never names or
//     addresses. The list is copied once; every id must be a positive safe
//     integer; the ids are de-duplicated, then capped at `NOTIFY_CAP` (10,
//     OD-14, owner 2026-11-25). A list that breaks any of these is refused
//     before any request.
//   - Each distinct id is looked up with `getAgent` (src/client/resources/
//     agents.ts) through `view`, the GET-only view, one GET each, in order,
//     stopping at the first that fails.
//     The whole write is refused, no POST sent, when a lookup fails (404,
//     5xx, timeout, `rate_limited`), when the agent is not clearly active
//     (fail closed: `getAgent` reads a flag missing or not a boolean as not
//     active), or when its email is null, empty or not one plain address
//     (`EMAIL`: one `@`, a dot in the domain, no space, control or format
//     character, list separator or other delimiter). Never a note to the
//     recipients that did resolve. A deadline that is not a number is refused
//     too, so the entry resolves rather than rejects.
//   - No ids (absent or an empty list) sends the note with no
//     `notify_emails` key and no GET. The lookups are counted in the
//     result's `attempts`, whether the write is sent, refused or fails.
//   - A refusal names the agent id and the cause, never an address. The core
//     keeps no address after the call. Not claimed: that none reaches the
//     caller. The note's answer is passed back as Freshdesk sends it, and may
//     echo the recipients (docs/improvements.md: the tool must not return
//     them).

import type { FieldError, FreshdeskError } from "../client/errors.js";
import {
  type GetHttp,
  type GetRequest,
  HttpClient,
  type HttpClientOptions,
  type HttpRequest,
  type HttpResult,
  type PageCap,
  type PageEnd,
  type PageRequest,
  type RetryResult,
} from "../client/http.js";
import { RateLimiter, type RateLimitOptions } from "../client/rate-limit.js";
import { getAgent } from "../client/resources/agents.js";
import type { Conversation, Ticket } from "../client/resources/tickets.js";
import type { Schema } from "../schema/index.js";
import { ticketInput } from "../schema/input.js";
import { ticketKey } from "../schema/output.js";
import { type AllowSet, allowSet, type WriteEntry } from "./allow-sets.js";
import { notSent, postNote, putTicket, type WriteResult } from "./resources.js";

export interface WritePathOptions extends Omit<HttpClientOptions, "limiter"> {
  /** The team's `limits`: the one limiter is built on them. */
  limits: RateLimitOptions;
  /** The team's `toolsets`: the write entries are built only when `write` is among them. */
  toolsets: readonly string[];
}

export interface WritePath {
  /** The GET-only view on the one client: what every module outside the core gets. */
  readonly view: GetHttp;
  /** The write entry points; the key is absent unless `write` is enabled. */
  readonly entries?: WriteEntries;
}

/** A ticket change: fields by API name or label, as `ticketInput` takes them. */
export interface TicketChange {
  /** The schema the fields are checked against (the tool's, from `context.schema`). */
  schema: Schema;
  id: number;
  fields: Record<string, unknown>;
  /** Epoch ms, the caller's: see `requestWithRetry`. */
  deadline?: number;
}

/** `update_ticket`'s change: also the ticket's whole tag list, when it changes. */
export interface TagChange extends TicketChange {
  tags?: readonly string[];
}

/** A note: the ticket and the body. Always private; no other key is sent. */
export interface NoteInput {
  id: number;
  body: string;
  /** Agent ids to notify, at most `NOTIFY_CAP` once de-duplicated; their emails are looked up here. */
  notify?: readonly number[];
  /** Epoch ms, the caller's: see `requestWithRetry`. */
  deadline?: number;
}

type TicketWrite<C> = (change: C) => Promise<WriteResult<Ticket>>;
type NoteWrite = (note: NoteInput) => Promise<WriteResult<Conversation>>;

/** One entry per write tool (RFC 2026-11-25-write-safety-core, invariant 2). */
export interface WriteEntries {
  readonly update_ticket: { readonly update: TicketWrite<TagChange> };
  readonly categorize_tickets: { readonly update: TicketWrite<TicketChange> };
  readonly hand_off_draft: { readonly note: NoteWrite; readonly assign: TicketWrite<TicketChange> };
  readonly add_note: { readonly note: NoteWrite };
}

/** Throws what `HttpClient`'s constructor throws (`ConfigError`), and the limiter's `RangeError`. */
export function createWritePath(options: WritePathOptions): WritePath {
  const { limits, toolsets, ...client } = options;
  const http = new HttpClient({ ...client, limiter: new RateLimiter(limits) });
  const view = new GetView(http);
  if (!toolsets.includes("write")) return Object.freeze({ view });
  return Object.freeze({ view, entries: writeEntries(http, view) });
}

function writeEntries(http: HttpClient, view: GetHttp): WriteEntries {
  const ticket = (entry: WriteEntry) => {
    const allow = allowSet(entry);
    return (change: TagChange) => ticketWrite(http, allow, change);
  };
  const note: NoteWrite = (input) => noteWrite(http, view, input);
  return Object.freeze({
    update_ticket: Object.freeze({ update: ticket("update_ticket") }),
    categorize_tickets: Object.freeze({ update: ticket("categorize_tickets") }),
    hand_off_draft: Object.freeze({ note, assign: ticket("hand_off_draft") }),
    add_note: Object.freeze({ note }),
  });
}

function fieldRefusal(errors: FieldError[]): { ok: false; error: FreshdeskError; attempts: 0 } {
  const refusal = notSent("Some ticket fields are not valid; nothing was sent.");
  return { ...refusal, error: { ...refusal.error, errors } };
}

const UNREADABLE = "Not sent: the write's input could not be read.";

/** The top-level body keys the set's fields map to. */
function allowedKeys(allow: AllowSet): Set<string> {
  const keys = new Set(allow.defaults.map((name) => ticketKey(name, true)));
  if (allow.custom) keys.add("custom_fields");
  if (allow.tags) keys.add("tags");
  return keys;
}

async function ticketWrite(
  http: HttpClient,
  allow: AllowSet,
  change: TagChange,
): Promise<WriteResult<Ticket>> {
  let id: number;
  let deadline: number | undefined;
  let body: Record<string, unknown>;
  try {
    ({ id, deadline } = change);
    const built = ticketInput(change.schema, change.fields, allow);
    if (!built.ok) return { ok: false, error: built.error, attempts: 0 };
    body = built.body;
    if (allow.tags && change.tags !== undefined) {
      const tags: unknown = change.tags;
      // Copied once, then checked: the list sent is the list checked.
      const list: unknown[] = Array.isArray(tags) ? Array.from(tags) : [0];
      if (!list.every((tag) => typeof tag === "string")) {
        return fieldRefusal([
          { field: "tags", code: "invalid_value", message: "Tags are a list of strings." },
        ]);
      }
      body = { ...body, tags: list };
    }
    const keys = Object.keys(body);
    const allowed = allowedKeys(allow);
    if (!keys.every((key) => allowed.has(key))) {
      return notSent("Not sent: the body holds a key this tool cannot set.");
    }
    if (keys.length === 0) return notSent("Not sent: the change sets no field.");
  } catch {
    return notSent(UNREADABLE);
  }
  return putTicket(http, id, body, deadline);
}

/** The most agents one note may notify, once de-duplicated (OD-14, owner 2026-11-25). */
export const NOTIFY_CAP = 10;

/**
 * One plain address: one `@`, a dot in the domain, and no space, control or
 * format character (`\p{Cc}`, `\p{Cf}`: C0, C1, zero-width, bidi) and none of
 * `,;<>"()[]:\`.
 */
const EMAIL =
  /^[^\s\p{Cc}\p{Cf}@,;<>"()[\]:\\]+@[^\s\p{Cc}\p{Cf}@,;<>"()[\]:\\]+\.[^\s\p{Cc}\p{Cf}@,;<>"()[\]:\\]+$/u;

type Refusal = { ok: false; error: FreshdeskError; attempts: number };
type Recipients = { ok: true; emails: string[]; attempts: number } | Refusal;

function notifyRefusal(message: string, code: string, attempts: number): Refusal {
  const refusal = notSent(`Not sent: ${message} The whole note was refused; nothing was sent.`);
  return {
    ...refusal,
    error: { ...refusal.error, errors: [{ field: "notify", code, message }] },
    attempts,
  };
}

/** The ids, copied once and checked, de-duplicated; a refusal when any is not an id or too many. */
function notifyIds(notify: unknown): number[] | Refusal {
  if (notify === undefined) return [];
  const notIds = () =>
    notifyRefusal("notify is a list of agent ids (positive whole numbers).", "invalid_value", 0);
  if (!Array.isArray(notify)) return notIds();
  // Copied once, then checked: the ids looked up are the ids checked.
  const list: unknown[] = Array.from(notify);
  if (!list.every((id) => Number.isSafeInteger(id) && (id as number) > 0)) return notIds();
  const ids = [...new Set(list as number[])];
  if (ids.length > NOTIFY_CAP) {
    return notifyRefusal(`a note notifies at most ${NOTIFY_CAP} agents.`, "too_many", 0);
  }
  return ids;
}

/** Each agent's work email, one GET per id, in order; a refusal at the first that does not resolve. */
async function recipients(view: GetHttp, ids: number[], deadline?: number): Promise<Recipients> {
  const emails: string[] = [];
  let attempts = 0;
  for (const id of ids) {
    const found = await getAgent(view, id, deadline);
    attempts += found.attempts;
    if (!found.ok) {
      return notifyRefusal(
        `agent ${id} could not be looked up (${found.error.code}).`,
        found.error.code,
        attempts,
      );
    }
    if (!found.agent.active) {
      return notifyRefusal(`agent ${id} is not active.`, "inactive", attempts);
    }
    const email = found.agent.email;
    if (email === null || !EMAIL.test(email)) {
      return notifyRefusal(`agent ${id} has no usable work email.`, "no_email", attempts);
    }
    emails.push(email);
  }
  return { ok: true, emails, attempts };
}

async function noteWrite(
  http: HttpClient,
  view: GetHttp,
  input: NoteInput,
): Promise<WriteResult<Conversation>> {
  let id: number;
  let deadline: number | undefined;
  let body: unknown;
  let ids: number[] | Refusal;
  try {
    ({ id, body, deadline } = input);
    ids = notifyIds(input.notify);
  } catch {
    return notSent(UNREADABLE);
  }
  // A deadline of another type (a cast's Symbol or BigInt) would throw in the
  // client's arithmetic: refused here, so the entry resolves.
  if (deadline !== undefined && typeof deadline !== "number") return notSent(UNREADABLE);
  if (typeof body !== "string") {
    return fieldRefusal([
      { field: "body", code: "invalid_value", message: "A note body is a string." },
    ]);
  }
  if (!Array.isArray(ids)) return ids;
  // Checked again by `postNote`; here so a bad ticket id spends no lookup.
  if (!(Number.isSafeInteger(id) && id > 0)) {
    return notSent("Not sent: ticket id is not a valid value.");
  }
  const resolved = await recipients(view, ids, deadline);
  if (!resolved.ok) return resolved;
  // The closed key set: a note from a write entry is private, always, and
  // notifies only the addresses resolved here.
  const payload: Record<string, unknown> = { body, private: true };
  if (resolved.emails.length > 0) payload.notify_emails = resolved.emails;
  const result = await postNote(http, id, payload, deadline);
  return { ...result, attempts: result.attempts + resolved.attempts };
}

function notGet(): { ok: false; error: FreshdeskError } {
  return {
    ok: false,
    error: {
      code: "validation",
      http_status: null,
      message: "Not sent: only the write path sends a request other than GET.",
      retryable: false,
    },
  };
}

function isGet(method: unknown): boolean {
  return method === undefined || method === "GET";
}

/** Whether `request`'s method is GET, or absent, both times it is read. */
function readsAsGet(request: unknown): boolean {
  const method = () => (request as { method?: unknown }).method;
  return isGet(method()) && isGet(method());
}

/** What goes to the client: the method the literal GET, and no body (a GET carries none). */
function getCopy(request: GetRequest): HttpRequest {
  return { ...request, method: "GET", body: undefined };
}

export class GetView implements GetHttp {
  readonly #client: HttpClient;

  constructor(client: HttpClient) {
    this.#client = client;
    Object.freeze(this);
  }

  request(request: GetRequest, deadline?: number): Promise<HttpResult> {
    if (!readsAsGet(request)) return Promise.resolve(notGet());
    return this.#client.request(getCopy(request), deadline);
  }

  requestWithRetry(request: GetRequest, callerDeadline?: number): Promise<RetryResult> {
    if (!readsAsGet(request)) return Promise.resolve({ ...notGet(), attempts: 0 });
    return this.#client.requestWithRetry(getCopy(request), callerDeadline);
  }

  async *paginate(
    request: PageRequest,
    cap: PageCap,
    deadline?: number,
  ): AsyncGenerator<HttpResult, PageEnd, void> {
    // The client builds the first page field by field, with GET: it never
    // reads `method`. A caller that passes one other than GET is refused all
    // the same, as `request` refuses it.
    if (!readsAsGet(request)) {
      yield notGet();
      return { truncated: false, attempts: 0 };
    }
    return yield* this.#client.paginate(request, cap, deadline);
  }

  reserveRefusal(): FreshdeskError | undefined {
    return this.#client.reserveRefusal();
  }

  reachedDeadline(error: FreshdeskError): boolean {
    return this.#client.reachedDeadline(error);
  }
}
