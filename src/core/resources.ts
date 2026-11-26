// The write resources (RFC 2026-11-25-write-safety-core; AGENTS.md hard rule
// 1; T-067): the client calls the M2 writes need. Part of the safety core:
// they take the full `HttpClient`, which only src/core/write-path.ts holds,
// and lint lets only src/core/** import this module (eslint.config.mjs, the
// src/** and scripts/** block; test/lint-rules.test.ts).
//
//   - `putTicket`: `PUT /tickets/{id}`. `postNote`: `POST /tickets/{id}/notes`.
//     Each sends the body exactly as given: who may call them and with what
//     body (allow sets, private notes, the closed note keys) is the entry
//     points' (T-068), not this module's.
//   - The body is read once, at the call, into a plain JSON snapshot, and that
//     snapshot is what every attempt sends: a getter, a `toJSON`, a Proxy or a
//     change to the caller's object during a 429's wait cannot make a retry
//     send another body than the first (security review, T-067). A body JSON
//     cannot carry (a BigInt, a cycle, a `toJSON` that throws) and a snapshot
//     that is not a JSON object (a top-level `toJSON` answering `null`, a
//     string, a list or `undefined`) are `validation`, `http_status: null`,
//     with nothing sent: a write resolves, it never rejects (T-068).
//   - Through `requestWithRetry`, never `request`: a write is retried on a
//     429 only, and a 5xx or a timeout comes back `retryable: false`, since
//     it may have been applied (a direct `request` keeps `retryable: true`;
//     docs/improvements.md, 6e7674f). It is not started with less than 10 s
//     left before the deadline (T-014).
//   - A ticket id that is not a positive safe integer is `validation`,
//     `http_status: null`, with nothing sent.
//   - The answer is checked: a ticket for the PUT, a conversation for the
//     POST (src/client/resources/tickets.ts' schemas). One in any other shape
//     is `server` with the answer's real status, not retryable, its message
//     fixed text that quotes nothing from the body and says the write may
//     have been applied. An HTTP failure is returned unchanged.
//
// `attempts` is the requests sent, retries included, 0 when nothing was.
// `deadline` (epoch ms, optional) is the caller's: see `requestWithRetry`.
//
// Not claimed by the lint rule: an import whose source is not a literal (a
// template or a computed string), a symlink to this file, or a re-export of it
// from another module under src/core/ (which the rule exempts): no module
// there re-exports it, and T-068's entries must not either.

import type { z } from "zod";
import type { FreshdeskError } from "../client/errors.js";
import type { HttpClient } from "../client/http.js";
import {
  type Conversation,
  conversation,
  type Ticket,
  ticket,
} from "../client/resources/tickets.js";

export type WriteResult<T> =
  { ok: true; value: T; attempts: number } | { ok: false; error: FreshdeskError; attempts: number };

export function putTicket(
  http: HttpClient,
  id: number,
  body: Record<string, unknown>,
  deadline?: number,
): Promise<WriteResult<Ticket>> {
  return write(http, "PUT", "/tickets/{id}", id, body, ticket, "a ticket", deadline);
}

export function postNote(
  http: HttpClient,
  id: number,
  body: Record<string, unknown>,
  deadline?: number,
): Promise<WriteResult<Conversation>> {
  return write(http, "POST", "/tickets/{id}/notes", id, body, conversation, "a note", deadline);
}

async function write<T>(
  http: HttpClient,
  method: "PUT" | "POST",
  path: string,
  id: number,
  body: Record<string, unknown>,
  answer: z.ZodType<T>,
  noun: string,
  deadline?: number,
): Promise<WriteResult<T>> {
  if (!(Number.isSafeInteger(id) && id > 0)) {
    return notSent("Not sent: ticket id is not a valid value.");
  }
  // One snapshot, read once, sent on every attempt: a getter, a `toJSON` or a
  // later change to the caller's object cannot alter a retry's body.
  let text: string | undefined;
  try {
    text = JSON.stringify(body);
  } catch {
    return notSent("Not sent: the body cannot be sent as JSON.");
  }
  const snapshot: unknown = text === undefined ? undefined : JSON.parse(text);
  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) {
    return notSent("Not sent: the body is not a JSON object.");
  }
  const result = await http.requestWithRetry(
    { method, path, params: { id }, body: snapshot },
    deadline,
  );
  if (!result.ok) return { ok: false, error: result.error, attempts: result.attempts };
  const parsed = answer.safeParse(result.body);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "server",
        http_status: result.status,
        message: `Freshdesk sent ${noun} in an unexpected shape (HTTP ${result.status}): the write may have been applied.`,
        retryable: false,
      },
      attempts: result.attempts,
    };
  }
  return { ok: true, value: parsed.data, attempts: result.attempts };
}

/** A local refusal: `validation`, `http_status: null`, nothing sent. */
export function notSent(message: string): { ok: false; error: FreshdeskError; attempts: 0 } {
  return {
    ok: false,
    error: { code: "validation", http_status: null, message, retryable: false },
    attempts: 0,
  };
}
