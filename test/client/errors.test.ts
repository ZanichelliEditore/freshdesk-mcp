import { describe, expect, it } from "vitest";
import { errorFromResponse, networkError } from "../../src/client/errors.js";

const noHeaders = new Headers();

describe("errorFromResponse: the seven codes", () => {
  it.each([
    [401, "auth"],
    [403, "forbidden"],
    [404, "not_found"],
  ] as const)("%i maps to %s, not retryable", (status, code) => {
    const err = errorFromResponse(status, noHeaders, undefined);
    expect(err).toMatchObject({ code, http_status: status, retryable: false });
    expect(err.message).not.toBe("");
    expect(err).not.toHaveProperty("retry_after_s");
    expect(err).not.toHaveProperty("errors");
  });

  it("400 with errors[] maps to validation and passes errors[] through", () => {
    const body = {
      description: "Validation failed",
      errors: [
        {
          field: "priority",
          message: "It should be one of these values: '1,2,3,4'",
          code: "invalid_value",
        },
        {
          field: "email",
          message: "There is no contact matching the given email",
          code: "invalid_value",
        },
      ],
    };
    expect(errorFromResponse(400, noHeaders, body)).toEqual({
      code: "validation",
      http_status: 400,
      message: expect.any(String),
      retryable: false,
      errors: body.errors,
    });
  });

  it("400 without errors[] maps to validation with no errors field", () => {
    for (const body of [undefined, null, "Bad Request", { description: "x" }, { errors: "nope" }]) {
      const err = errorFromResponse(400, noHeaders, body);
      expect(err).toMatchObject({ code: "validation", http_status: 400, retryable: false });
      expect(err).not.toHaveProperty("errors");
    }
  });

  it("400 errors[] keeps only string field/message/code and drops malformed items", () => {
    const body = {
      errors: [
        { field: "a", message: "m", code: "c", extra: "dropped" },
        { field: 7, message: "only message kept" },
        { field: "no message" },
        "not an object",
        null,
      ],
    };
    expect(errorFromResponse(400, noHeaders, body).errors).toEqual([
      { field: "a", message: "m", code: "c" },
      { message: "only message kept" },
    ]);
  });

  it("429 with Retry-After maps to rate_limited, retryable, with retry_after_s", () => {
    const err = errorFromResponse(429, new Headers({ "Retry-After": "37" }), undefined);
    expect(err).toMatchObject({
      code: "rate_limited",
      http_status: 429,
      retryable: true,
      retry_after_s: 37,
    });
  });

  it.each([
    ["0", 0],
    [" 5 ", 5],
  ] as const)("Retry-After %j parses to %i", (value, seconds) => {
    expect(
      errorFromResponse(429, new Headers({ "Retry-After": value }), undefined).retry_after_s,
    ).toBe(seconds);
  });

  it.each([undefined, "", "soon", "-3", "1.5", "Wed, 21 Oct 2026 07:28:00 GMT"])(
    "429 with Retry-After %j has no retry_after_s",
    (value) => {
      const headers = value === undefined ? noHeaders : new Headers({ "Retry-After": value });
      const err = errorFromResponse(429, headers, undefined);
      expect(err).toMatchObject({ code: "rate_limited", retryable: true });
      expect(err).not.toHaveProperty("retry_after_s");
    },
  );

  it.each([500, 502, 503, 504, 599])("%i maps to server, retryable", (status) => {
    expect(errorFromResponse(status, noHeaders, undefined)).toMatchObject({
      code: "server",
      http_status: status,
      retryable: true,
    });
  });

  it("network failure maps to network, retryable, no http_status", () => {
    const cause = Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:443"), {
      code: "ECONNREFUSED",
    });
    const err = networkError(cause);
    expect(err).toMatchObject({ code: "network", http_status: null, retryable: true });
    expect(err.message).toContain("ECONNREFUSED");
  });

  it("network message never carries the cause's free text", () => {
    const secret = "https://acme.freshdesk.com/api/v2/tickets?key=SECRET";
    for (const cause of [new Error(secret), secret, { code: secret }, undefined]) {
      expect(networkError(cause).message).not.toContain("SECRET");
    }
  });

  it("network timeout keeps the error name", () => {
    const cause = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    expect(networkError(cause).message).toContain("TimeoutError");
  });
});

describe("errorFromResponse: documented fallback for unlisted statuses", () => {
  it.each([405, 409, 415, 418, 422])(
    "unlisted 4xx %i maps to validation, not retryable",
    (status) => {
      const err = errorFromResponse(status, noHeaders, undefined);
      expect(err).toMatchObject({ code: "validation", http_status: status, retryable: false });
      expect(err.message).toContain(String(status));
    },
  );

  it("unlisted 4xx still passes errors[] through", () => {
    const body = { errors: [{ field: "x", message: "conflict" }] };
    expect(errorFromResponse(409, noHeaders, body).errors).toEqual(body.errors);
  });

  // RFC 2026-11-23 rule 5: a 3xx is never followed and never retried.
  it.each([301, 302, 303, 307, 308])("3xx %i maps to server, not retryable", (status) => {
    const headers = new Headers({ Location: "https://evil.example/" });
    const err = errorFromResponse(status, headers, undefined);
    expect(err).toMatchObject({ code: "server", http_status: status, retryable: false });
    expect(err.message).not.toContain("evil.example");
  });

  it.each([100, 200, 204])("non-error status %i maps to server, not retryable", (status) => {
    expect(errorFromResponse(status, noHeaders, undefined)).toMatchObject({
      code: "server",
      http_status: status,
      retryable: false,
    });
  });
});
