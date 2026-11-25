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
// The write entry points (invariants 2, 3, 5, 6) are T-068's; notify
// (invariant 4) is T-069's. Until then the write path sends no write.

import type { FreshdeskError } from "../client/errors.js";
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

export interface WritePathOptions extends Omit<HttpClientOptions, "limiter"> {
  /** The team's `limits`: the one limiter is built on them. */
  limits: RateLimitOptions;
}

export interface WritePath {
  /** The GET-only view on the one client: what every module outside the core gets. */
  readonly view: GetHttp;
}

/** Throws what `HttpClient`'s constructor throws (`ConfigError`), and the limiter's `RangeError`. */
export function createWritePath(options: WritePathOptions): WritePath {
  const { limits, ...client } = options;
  const http = new HttpClient({ ...client, limiter: new RateLimiter(limits) });
  return Object.freeze({ view: new GetView(http) });
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
