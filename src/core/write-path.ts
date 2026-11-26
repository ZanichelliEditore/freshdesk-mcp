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
//     key set, `{ body, private: true }` (`notify_emails` is T-069's,
//     invariant 4), so `private: false`, `user_id`, `incoming` or attachments
//     never reach Freshdesk, even passed by a cast.
//   - An entry never rejects. Every refusal is `validation`, `http_status:
//     null`, with nothing sent, per-field entries where a field is the cause;
//     an input that throws when read (a cast's getter, `null`) is one too.
//     The writes go through src/core/resources.ts, whose snapshot refuses a
//     body JSON cannot carry.

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
  return Object.freeze({ view, entries: writeEntries(http) });
}

function writeEntries(http: HttpClient): WriteEntries {
  const ticket = (entry: WriteEntry) => {
    const allow = allowSet(entry);
    return (change: TagChange) => ticketWrite(http, allow, change);
  };
  const note: NoteWrite = (input) => noteWrite(http, input);
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

async function noteWrite(http: HttpClient, input: NoteInput): Promise<WriteResult<Conversation>> {
  let id: number;
  let deadline: number | undefined;
  let body: unknown;
  try {
    ({ id, body, deadline } = input);
  } catch {
    return notSent(UNREADABLE);
  }
  if (typeof body !== "string") {
    return fieldRefusal([
      { field: "body", code: "invalid_value", message: "A note body is a string." },
    ]);
  }
  // The closed key set: a note from a write entry is private, always.
  return postNote(http, id, { body, private: true }, deadline);
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
