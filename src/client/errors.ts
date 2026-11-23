// Normalised Freshdesk client error (SPEC §7.1).
//
// Status mapping:
//   401 auth · 403 forbidden · 404 not_found · 400 validation ·
//   429 rate_limited (retryable, retry_after_s from an integer Retry-After) ·
//   5xx server (retryable) · no response at all: network (retryable).
// Fallback for any other status:
//   - another 4xx (405, 409, 415, ...) -> validation, not retryable;
//   - anything else (3xx, 1xx, 2xx)    -> server, not retryable.
//   A 3xx is never followed or retried (RFC 2026-11-23, rule 5).
// Freshdesk's `errors[]` is passed through on every `validation` error.
// Messages are fixed text: they never quote the response body, a header
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
  /** `null` when no response arrived (`network`). */
  http_status: number | null;
  message: string;
  retryable: boolean;
  retry_after_s?: number;
  /** Freshdesk's per-field errors, on `validation` only. */
  errors?: FieldError[];
}

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
    if (!isRecord(item) || typeof item.message !== "string") continue;
    out.push({
      ...(typeof item.field === "string" ? { field: item.field } : {}),
      message: item.message,
      ...(typeof item.code === "string" ? { code: item.code } : {}),
    });
  }
  return out;
}

/** A Node error code (`ECONNRESET`) or error name (`TimeoutError`), never free text. */
function errorTag(cause: unknown): string | undefined {
  if (!isRecord(cause)) return undefined;
  for (const candidate of [cause.code, cause.name]) {
    if (
      typeof candidate === "string" &&
      /^[A-Za-z_]{1,40}$/.test(candidate) &&
      candidate !== "Error"
    ) {
      return candidate;
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
