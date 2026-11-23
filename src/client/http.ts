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
//   - Result: a 2xx with its parsed JSON body, or a FreshdeskError. Nothing
//     that comes from the network makes `request` throw.
//   - stderr: one line per request sent, `METHOD template status ms`. Never
//     a URL, a header or a body.
//
// No retries and no pagination here (T-007).

import { type Dispatcher, fetch, type Headers } from "undici";
import { ConfigError } from "../config.js";
import { errorFromResponse, type FreshdeskError, networkError } from "./errors.js";
import type { CostClass, RateLimiter } from "./rate-limit.js";

const FRESHDESK_HOST = /^[a-z0-9-]+\.freshdesk\.com$/;
const USER_AGENT = "freshdesk-mcp";
/** What `path` may be, since it is logged: segments of names and `{params}`. */
const TEMPLATE = /^(\/[A-Za-z0-9_{}-]+)+$/;

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

export class HttpClient {
  private readonly host: string;
  private readonly authorization: string;
  private readonly dispatcher: Dispatcher;
  private readonly limiter: RateLimiter;

  constructor(options: HttpClientOptions) {
    if (!FRESHDESK_HOST.test(options.domain) && options.domain !== options.hostOverride) {
      throw new ConfigError(
        "FRESHDESK_DOMAIN must be a Freshdesk hostname (like acme.freshdesk.com), or equal FRESHDESK_HOST_OVERRIDE.",
      );
    }
    this.host = options.domain;
    this.authorization = `Basic ${Buffer.from(`${options.apiKey}:X`).toString("base64")}`;
    this.dispatcher = options.dispatcher;
    this.limiter = options.limiter;
  }

  /**
   * Throws a `TypeError` only for what the calling code got wrong: a `path`
   * that is not a template, a parameter the template names and `params`
   * lacks, a `body` that JSON cannot carry. Values (a parameter's, a URL's)
   * are refused with a result.
   */
  async request(request: HttpRequest): Promise<HttpResult> {
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
    const acquired = await this.limiter.acquire(request.cost ?? "cheap");
    if (!acquired.ok) return acquired;

    const started = performance.now();
    const log = (outcome: number | "network") => {
      const ms = Math.round(performance.now() - started);
      process.stderr.write(`${method} ${request.path} ${outcome} ${ms}ms\n`);
    };
    let status: number;
    let headers: Headers;
    let text: string;
    try {
      const response = await fetch(url, {
        method,
        headers: {
          authorization: this.authorization,
          "user-agent": USER_AGENT,
          accept: "application/json",
          ...(payload === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(payload === undefined ? {} : { body: payload }),
        dispatcher: this.dispatcher,
        redirect: "manual",
      });
      ({ status, headers } = response);
      this.limiter.observe(status, headers);
      text = await response.text();
    } catch (cause) {
      log("network");
      return { ok: false, error: networkError(cause) };
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
