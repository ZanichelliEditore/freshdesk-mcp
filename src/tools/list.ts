// List envelope and cursor (SPEC §8.4): what every list tool returns, built
// in one place.
//
//   - Envelope: `{items, next_cursor?, has_more, truncated?, api_calls_used}`.
//     `has_more` is true exactly when the tool gives a `next` position, and
//     `next_cursor` is present exactly then. `truncated: true` is carried
//     from a source a cap cut (`listAll`, `paginate`); an uncut source gives
//     no `truncated` key.
//   - Cursor: `<position>.<digest>`. The position is a whole number whose
//     meaning is the tool's (an offset, a page); the digest is SHA-256,
//     base64url, over the tool name, every argument of the call except the
//     `cursor` argument itself, and the position. Arguments are serialised
//     with object keys sorted, so their order does not matter; arrays keep
//     theirs.
//   - The digest is unkeyed: it catches a cursor used with another tool or
//     with any argument changed, and an edited one, not a forged one. A
//     forged cursor can only carry a whole number to the tool that reads it,
//     the same input as a model choosing a page, so it needs no key.
//   - A cursor is model-supplied input. `readCursor` checks it before any
//     request: not a string, over CURSOR_MAX_LENGTH, not in the form above,
//     or a digest that does not match this call is a `validation` error with
//     `http_status: null`, and its message never quotes the cursor. What it
//     returns is a position and nothing else: no cursor content can reach a
//     URL, a host or a path.

import { createHash } from "node:crypto";
import type { FreshdeskError } from "../client/errors.js";

/** The argument that carries the cursor; left out of the digest. */
const CURSOR_ARG = "cursor";
/** Longer than any cursor this module gives (16 digits, a dot, 43 digest characters). */
export const CURSOR_MAX_LENGTH = 64;
const CURSOR_FORM = /^(0|[1-9][0-9]{0,15})\.([A-Za-z0-9_-]{43})$/;

/** One call of a list tool: its name and every argument it was given. */
export interface ListCall {
  tool: string;
  args: Readonly<Record<string, unknown>>;
}

export interface ListPage<T> {
  items: T[];
  /** Where the next call starts; absent when there is nothing more. */
  next?: number;
  /** True when a cap cut the source. */
  truncated?: boolean;
  api_calls_used: number;
}

export interface ListEnvelope<T> {
  items: T[];
  next_cursor?: string;
  has_more: boolean;
  truncated?: true;
  api_calls_used: number;
}

export type CursorResult = { ok: true; position: number } | { ok: false; error: FreshdeskError };

/** Throws a `TypeError` for a `next` that is not a whole number, zero or more. */
export function listEnvelope<T>(call: ListCall, page: ListPage<T>): ListEnvelope<T> {
  const envelope: ListEnvelope<T> = {
    items: page.items,
    has_more: page.next !== undefined,
    api_calls_used: page.api_calls_used,
  };
  if (page.next !== undefined) {
    if (!Number.isSafeInteger(page.next) || page.next < 0) {
      throw new TypeError("A list's next position is a whole number, zero or more.");
    }
    envelope.next_cursor = `${page.next}.${digest(call, page.next)}`;
  }
  if (page.truncated === true) envelope.truncated = true;
  return envelope;
}

/** The position the call's `cursor` argument gives: 0 without one. */
export function readCursor(call: ListCall): CursorResult {
  const cursor = call.args[CURSOR_ARG];
  if (cursor === undefined) return { ok: true, position: 0 };
  if (typeof cursor !== "string") {
    return refuse("the cursor is not one this server gave");
  }
  if (cursor.length > CURSOR_MAX_LENGTH) {
    return refuse(`the cursor is longer than ${CURSOR_MAX_LENGTH} characters`);
  }
  const match = CURSOR_FORM.exec(cursor);
  const position = Number(match?.[1]);
  if (match === null || !Number.isSafeInteger(position)) {
    return refuse("the cursor is not one this server gave");
  }
  if (match[2] !== digest(call, position)) {
    return refuse(
      "the cursor belongs to another call; use it with the same tool and the same arguments",
    );
  }
  return { ok: true, position };
}

function refuse(why: string): CursorResult {
  return {
    ok: false,
    error: {
      code: "validation",
      http_status: null,
      message: `Not sent: ${why}, or call again without a cursor to start over.`,
      retryable: false,
    },
  };
}

function digest(call: ListCall, position: number): string {
  const args = Object.fromEntries(Object.entries(call.args).filter(([key]) => key !== CURSOR_ARG));
  const text = `[${JSON.stringify(call.tool)},${canonical(args)},${position}]`;
  return createHash("sha256").update(text).digest("base64url");
}

/** JSON with object keys sorted; `undefined` in an object is left out, as JSON does. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const parts = Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`);
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
