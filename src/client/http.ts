// HTTP core (SPEC §7.1, §9; RFC 2026-11-23, rules 1, 2 and 5): the one send
// function every Freshdesk request goes through.
//
//   - Host: the configured domain must be `<name>.freshdesk.com`, or equal
//     the override, or construction fails. Every URL sent, built here or
//     handed in whole (a pagination `Link`), must then be `https:`, on the
//     default port, without credentials, and on exactly that host: not just
//     any Freshdesk host, since anyone can open an account there. A URL that
//     is not gets a `validation` error and nothing is sent.
//   - Path: callers pass a template (`/tickets/{id}`) and its parameters.
//     Parameters are percent-encoded here; the template is what is logged.
//   - Redirects are not followed: a 3xx comes back as an error that is not
//     retryable, so the API key never travels to a `Location`.
//   - Limiter: `acquire` before sending, `observe` on every response.
//   - Timeout: a request with no complete response after REQUEST_TIMEOUT_MS
//     is aborted and comes back as a `network` error.
//   - Result: a 2xx with its parsed JSON body, or a FreshdeskError. Nothing
//     that comes from the network makes `request` throw.
//   - stderr: one line per request sent, `METHOD template status ms`. Never
//     a URL, a header or a body.
//
// `request` is one attempt. `requestWithRetry` and `paginate` are built on it
// and are what resource modules call:
//   - Retries: MAX_RETRIES at most. A GET is retried on a 5xx or a network
//     error (a timeout is one) after a backoff, and on a 429. Any other method
//     is a write, whatever the caller thinks: it is retried on a 429 only,
//     the one answer that says the request was not processed, so a write is
//     never applied twice.
//   - After a 429 the retry does not sleep here: the next attempt's `acquire`
//     serves the limiter's hold, or refuses when the hold is beyond its
//     bound, and that refusal is returned with nothing more sent.
//   - Deadline: one `requestWithRetry` ends within TOTAL_DEADLINE_MS, its
//     attempts, limiter waits and backoffs together. Each attempt carries the
//     deadline: the limiter refuses a wait that would end at or after it
//     (`rate_limited`, so that refusal wins over the expiry), and what is
//     left caps the attempt's timeout, so an attempt in flight at the
//     deadline is aborted and comes back as the expiry error: `network`,
//     retryable for a GET only. A backoff that would end at or after the
//     deadline is not started: the last answer is returned as it is.
//     `paginate` has no budget of its own: each page gets the full deadline.
//   - Pagination: `paginate` follows `Link: <url>; rel="next"`, each URL
//     through `request` and so through the host check, up to the caller's cap.
//     Its return value says whether a cap cut the list (`truncated`).

import { type Dispatcher, fetch, type Headers } from "undici";
import { ConfigError } from "../config.js";
import { errorFromResponse, type FreshdeskError, networkError } from "./errors.js";
import type { CostClass, RateLimiter } from "./rate-limit.js";

const FRESHDESK_HOST = /^[a-z0-9-]+\.freshdesk\.com$/;
const USER_AGENT = "freshdesk-mcp";
/** What `path` may be, since it is logged: segments of names and `{params}`. */
const TEMPLATE = /^(\/[A-Za-z0-9_{}-]+)+$/;
/** Longest one attempt may take, headers and body together. */
export const REQUEST_TIMEOUT_MS = 10_000;
/** Attempts after the first. */
export const MAX_RETRIES = 3;
/** Wait before the first retry of a 5xx or network error; doubles each time. */
export const BACKOFF_MS = 500;
/** Longest one `requestWithRetry` may take, waits and attempts together. */
export const TOTAL_DEADLINE_MS = 30_000;

function notSent(why: string): HttpResult {
  return {
    ok: false,
    error: {
      code: "validation",
      http_status: null,
      message: `Not sent: ${why}.`,
      retryable: false,
    },
  };
}

/** An aborted write may have been applied, as with the timeout of one attempt. */
function expired(method: string): HttpResult {
  return {
    ok: false,
    error: {
      code: "network",
      http_status: null,
      message: `No answer from Freshdesk within ${TOTAL_DEADLINE_MS / 1000} s: the call was given up.`,
      retryable: method === "GET",
    },
  };
}

export interface HttpClientOptions {
  /** A hostname, as in FRESHDESK_DOMAIN: `acme.freshdesk.com`. */
  domain: string;
  apiKey: string;
  /** The one hostname the domain may be besides `<name>.freshdesk.com`. */
  hostOverride?: string;
  /** No default (RFC rule 2): `cli.ts` passes the Agent, tests the mock. */
  dispatcher: Dispatcher;
  limiter: RateLimiter;
}

export interface HttpRequest {
  /** Default `GET`. */
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** Template under `/api/v2`, like `/tickets/{id}`. Logged as written. */
  path: string;
  params?: Record<string, string | number>;
  query?: Record<string, string | number | boolean>;
  /**
   * A whole URL to send to instead of the built one (a `Link` header's).
   * `params` and `query` are then unused; `path` is still what is logged.
   */
  url?: string;
  /** Sent as JSON. */
  body?: unknown;
  /** Default `cheap`. */
  cost?: CostClass;
}

export type HttpResult =
  | { ok: true; status: number; headers: Headers; body: unknown }
  | { ok: false; error: FreshdeskError };

/** A list request: always a GET, its URL built from the template. */
export type PageRequest = Omit<HttpRequest, "method" | "body" | "url">;

/** Where `paginate` stops, whatever `Link` says. */
export interface PageCap {
  pages: number;
  /** Counted on pages whose body is an array; the last one is cut to fit. */
  items?: number;
}

export class HttpClient {
  private readonly host: string;
  // Real private fields: the key and the dispatcher are not properties, so
  // they cannot be read or printed from the client. Nothing more is claimed:
  // `host` and `limiter` are ordinary properties (PLAN, the hardening row).
  readonly #authorization: string;
  readonly #dispatcher: Dispatcher;
  private readonly limiter: RateLimiter;

  constructor(options: HttpClientOptions) {
    if (!FRESHDESK_HOST.test(options.domain) && options.domain !== options.hostOverride) {
      throw new ConfigError(
        "FRESHDESK_DOMAIN must be a Freshdesk hostname (like acme.freshdesk.com), or equal FRESHDESK_HOST_OVERRIDE.",
      );
    }
    this.host = options.domain;
    this.#authorization = `Basic ${Buffer.from(`${options.apiKey}:X`).toString("base64")}`;
    this.#dispatcher = options.dispatcher;
    this.limiter = options.limiter;
  }

  /**
   * Throws a `TypeError` only for what the calling code got wrong: a `path`
   * that is not a template, a parameter the template names and `params`
   * lacks, a `body` that JSON cannot carry. Values (a parameter's, a URL's)
   * are refused with a result.
   *
   * One attempt: resource modules call `requestWithRetry` or `paginate`.
   *
   * `deadline` (epoch ms) is `requestWithRetry`'s. It only shortens: the
   * limiter's wait and the attempt's timeout keep their own bounds under it.
   */
  async request(request: HttpRequest, deadline = Infinity): Promise<HttpResult> {
    const method = request.method ?? "GET";
    if (!TEMPLATE.test(request.path)) {
      throw new TypeError("The path must be a template like /tickets/{id}.");
    }
    const payload = request.body === undefined ? undefined : JSON.stringify(request.body);
    const url = request.url ?? this.build(request);
    if (url === undefined) {
      return notSent("a path parameter is empty or a dot segment");
    }
    if (!this.allowed(url)) {
      return notSent("the URL is not on the configured Freshdesk host");
    }
    const acquired = await this.limiter.acquire(request.cost ?? "cheap", deadline - Date.now());
    if (!acquired.ok) return acquired;
    // Read again: `acquire` may have slept. Its token is spent either way.
    const left = deadline - Date.now();
    // Written so that a deadline that is not a number sends nothing either.
    if (!(left > 0)) return expired(method);

    const started = performance.now();
    const log = (outcome: number | "network") => {
      const ms = Math.round(performance.now() - started);
      process.stderr.write(`${method} ${request.path} ${outcome} ${ms}ms\n`);
    };
    let status: number;
    let headers: Headers;
    let text: string;
    const timeout = new AbortController();
    const timer = setTimeout(
      () => {
        timeout.abort(new DOMException("The request timed out.", "TimeoutError"));
      },
      Math.min(REQUEST_TIMEOUT_MS, left),
    );
    try {
      const response = await fetch(url, {
        method,
        headers: {
          authorization: this.#authorization,
          "user-agent": USER_AGENT,
          accept: "application/json",
          ...(payload === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(payload === undefined ? {} : { body: payload }),
        dispatcher: this.#dispatcher,
        redirect: "manual",
        signal: timeout.signal,
      });
      ({ status, headers } = response);
      this.limiter.observe(status, headers);
      text = await response.text();
    } catch (cause) {
      log("network");
      if (timeout.signal.aborted && left <= REQUEST_TIMEOUT_MS) return expired(method);
      return { ok: false, error: networkError(cause) };
    } finally {
      clearTimeout(timer);
    }
    log(status);

    let body: unknown;
    let parsed = true;
    if (text !== "") {
      try {
        body = JSON.parse(text);
      } catch {
        parsed = false;
      }
    }
    if (status < 200 || status >= 300) {
      return { ok: false, error: errorFromResponse(status, headers, body) };
    }
    if (!parsed) {
      return {
        ok: false,
        error: {
          code: "server",
          http_status: status,
          message: `Freshdesk sent a body that is not JSON (HTTP ${status}).`,
          retryable: false,
        },
      };
    }
    return { ok: true, status, headers, body };
  }

  /**
   * `request`, attempted again where that cannot apply a write twice. A write
   * that failed on a 5xx, a network error or a timeout may have been applied:
   * it comes back `retryable: false`, so no caller sends it again either.
   */
  async requestWithRetry(request: HttpRequest): Promise<HttpResult> {
    const read = (request.method ?? "GET") === "GET";
    const deadline = Date.now() + TOTAL_DEADLINE_MS;
    for (let attempt = 0; ; attempt += 1) {
      const result = await this.request(request, deadline);
      if (result.ok) return result;
      const { code, http_status, retryable } = result.error;
      // With no status the limiter refused the call: waiting is its business.
      const limited = code === "rate_limited" && http_status !== null;
      const transient = retryable && (code === "server" || code === "network");
      if (!read && transient) {
        return { ok: false, error: { ...result.error, retryable: false } };
      }
      if (attempt === MAX_RETRIES || !(limited || transient)) return result;
      const backoff = limited ? 0 : BACKOFF_MS * 2 ** attempt;
      if (Date.now() + backoff >= deadline) return result;
      if (!limited) await sleep(backoff);
    }
  }

  /**
   * The pages of a list, one result each, following `Link` up to the cap. A
   * failed page is yielded and ends the iteration. Throws a `TypeError` for a
   * cap that is not a whole number, zero or more.
   *
   * Returns `truncated`: true when a cap ended the list with more of it left,
   * a `Link` not followed or a page cut; false when the list ended, or a
   * failed page did (the failure is the answer).
   */
  async *paginate(
    request: PageRequest,
    cap: PageCap,
  ): AsyncGenerator<HttpResult, { truncated: boolean }, void> {
    if (!isCount(cap.pages) || (cap.items !== undefined && !isCount(cap.items))) {
      throw new TypeError("A page cap and an item cap are whole numbers, zero or more.");
    }
    // Field by field: the type keeps a method, a body and a URL out, and a
    // caller's wider object would carry them in.
    const first: HttpRequest = { method: "GET", path: request.path };
    if (request.params !== undefined) first.params = request.params;
    if (request.query !== undefined) first.query = request.query;
    if (request.cost !== undefined) first.cost = request.cost;

    let next: HttpRequest | undefined = first;
    let room = cap.items ?? Infinity;
    for (let page = 0; page < cap.pages && room > 0 && next !== undefined; page += 1) {
      const result = await this.requestWithRetry(next);
      if (!result.ok) {
        yield result;
        return { truncated: false };
      }
      const body: unknown = result.body;
      if (Array.isArray(body) && body.length > room) {
        yield { ...result, body: body.slice(0, room) };
        return { truncated: true };
      }
      yield result;
      if (Array.isArray(body)) room -= body.length;
      const link = /<([^>]*)>\s*;\s*rel="?next"?/.exec(result.headers.get("link") ?? "")?.[1];
      next = link === undefined ? undefined : { ...first, url: link };
    }
    return { truncated: next !== undefined };
  }

  /** `undefined` when a parameter's value would change which resource is addressed. */
  private build(request: HttpRequest): string | undefined {
    let usable = true;
    const path = request.path.replace(/\{(\w+)\}/g, (_match, name: string) => {
      const value = request.params?.[name];
      if (value === undefined) {
        throw new TypeError(`The path names a parameter "${name}" that params lacks.`);
      }
      // "" drops a segment; "." and ".." survive encoding and climb out.
      if (value === "" || value === "." || value === "..") usable = false;
      return encodeURIComponent(value);
    });
    if (!usable) return undefined;
    const query = new URLSearchParams(
      Object.entries(request.query ?? {}).map(([name, value]) => [name, String(value)]),
    ).toString();
    return `https://${this.host}/api/v2${path}${query === "" ? "" : `?${query}`}`;
  }

  private allowed(candidate: string): boolean {
    if (!URL.canParse(candidate)) return false;
    const url = new URL(candidate);
    return (
      url.protocol === "https:" &&
      url.port === "" &&
      url.hostname === this.host &&
      url.username === "" &&
      url.password === ""
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
