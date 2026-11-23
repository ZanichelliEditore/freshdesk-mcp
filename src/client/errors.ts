// Normalised Freshdesk client error (SPEC §7.1).
//
// Status mapping:
//   401 auth · 403 forbidden · 404 not_found · 400 validation ·
//   429 rate_limited (retryable, retry_after_s from an integer Retry-After) ·
//   5xx server (retryable) · no response at all: network (retryable).
// Fallback for any other status:
//   - another 4xx (405, 409, 415, ...) -> validation, not retryable:
//     the request itself was refused, so sending it again changes nothing;
//   - anything else (3xx, 1xx, 2xx)    -> server, not retryable.
//   A 3xx is never followed or retried (RFC 2026-11-23, rule 5).
// Freshdesk's `errors[]` is passed through on every `validation` error,
// capped at MAX_FIELD_ERRORS items of MAX_FIELD_TEXT characters per string.
// It is response-body text: return it to the caller, never log it.
// A `validation` error is also built locally, with `http_status: null`, when
// a tool's input fails the schema before anything is sent
// (src/schema/input.ts): its `errors[]` echoes that input, under the same caps.
// `message` is fixed text: it never quotes the response body, a header
// value or a cause's free text.

export type ErrorCode =
  "auth" | "forbidden" | "not_found" | "validation" | "rate_limited" | "server" | "network";

export interface FieldError {
  field?: string;
  message: string;
  code?: string;
}

export interface FreshdeskError {
  code: ErrorCode;
  /** `null` when no response arrived (`network`) or nothing was sent (a local `validation`). */
  http_status: number | null;
  message: string;
  retryable: boolean;
  retry_after_s?: number;
  /** Per-field errors, on `validation` only: Freshdesk's, or the schema's when built locally. */
  errors?: FieldError[];
}

export const MAX_FIELD_ERRORS = 50;
export const MAX_FIELD_TEXT = 500;

interface HeaderReader {
  get(name: string): string | null;
}

export function errorFromResponse(
  status: number,
  headers: HeaderReader,
  body: unknown,
): FreshdeskError {
  const base = { http_status: status };
  switch (status) {
    case 401:
      return {
        ...base,
        code: "auth",
        message: "Freshdesk rejected the API key (HTTP 401).",
        retryable: false,
      };
    case 403:
      return {
        ...base,
        code: "forbidden",
        message: "The API key's agent may not do this (HTTP 403).",
        retryable: false,
      };
    case 404:
      return {
        ...base,
        code: "not_found",
        message: "Freshdesk found no such resource (HTTP 404).",
        retryable: false,
      };
    case 429: {
      const retryAfter = parseRetryAfter(headers.get("retry-after"));
      return {
        ...base,
        code: "rate_limited",
        message: "Freshdesk rate limit reached (HTTP 429).",
        retryable: true,
        ...(retryAfter === undefined ? {} : { retry_after_s: retryAfter }),
      };
    }
  }
  if (status >= 400 && status < 500) {
    const errors = fieldErrors(body);
    return {
      ...base,
      code: "validation",
      message: `Freshdesk refused the request (HTTP ${status}).`,
      retryable: false,
      ...(errors === undefined ? {} : { errors }),
    };
  }
  if (status >= 500 && status < 600) {
    return {
      ...base,
      code: "server",
      message: `Freshdesk server error (HTTP ${status}).`,
      retryable: true,
    };
  }
  return {
    ...base,
    code: "server",
    message: `Unexpected Freshdesk response (HTTP ${status}).`,
    retryable: false,
  };
}

export function networkError(cause: unknown): FreshdeskError {
  const tag = errorTag(cause);
  return {
    code: "network",
    http_status: null,
    message:
      tag === undefined ? "Could not reach Freshdesk." : `Could not reach Freshdesk (${tag}).`,
    retryable: true,
  };
}

function parseRetryAfter(value: string | null): number | undefined {
  const trimmed = value?.trim();
  return trimmed !== undefined && /^\d+$/.test(trimmed) ? Number(trimmed) : undefined;
}

function fieldErrors(body: unknown): FieldError[] | undefined {
  if (!isRecord(body) || !Array.isArray(body.errors)) return undefined;
  const out: FieldError[] = [];
  for (const item of body.errors) {
    if (out.length === MAX_FIELD_ERRORS) break;
    if (!isRecord(item) || typeof item.message !== "string") continue;
    out.push({
      ...(typeof item.field === "string" ? { field: clip(item.field) } : {}),
      message: clip(item.message),
      ...(typeof item.code === "string" ? { code: clip(item.code) } : {}),
    });
  }
  return out;
}

function clip(text: string): string {
  return text.slice(0, MAX_FIELD_TEXT);
}

/**
 * A Node error code (`ECONNRESET`) or error name (`TimeoutError`), never free
 * text. undici's fetch rejects with `TypeError("fetch failed")` and the real
 * error in `cause`, so the cause is read before the outer error's name.
 */
function errorTag(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined;
  const inner = isRecord(error.cause) ? error.cause : {};
  for (const candidate of [error.code, inner.code, inner.name, error.name]) {
    if (
      typeof candidate === "string" &&
      /^[A-Za-z_]{1,40}$/.test(candidate) &&
      candidate !== "Error" &&
      candidate !== "TypeError"
    ) {
      return candidate;
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
