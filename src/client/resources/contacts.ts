// Contacts (SPEC §7.1, §8.2): `getContact`, one `GET /contacts/{id}`, for
// `get_ticket`'s requester block (name, email, company).
//
// The returned contact is a fixed allow-list, not a pass-through: `name`,
// `email` and `company_id`, nothing else. Phone, mobile, address and every
// other key Freshdesk sends are dropped here, so no caller can return them.
// A contact needs a string `name`; `email` is a string or null (a contact
// may have only a phone); `company_id` a whole number or null, a missing key
// read as null (no company). A body in any other shape is `server` with the
// response's real status, not retryable, and a fixed message that quotes
// nothing from it. An HTTP failure (a 404 is `not_found`) is returned
// unchanged.
//
// The id is checked before anything is sent, whatever a cast let through: a
// positive safe integer, or `validation` with `http_status: null`, naming
// the parameter, not the value, and no request is sent.
//
// `attempts` is the requests sent, retries included. `deadline` (epoch ms,
// optional) is the caller's: see `requestWithRetry`.

import { z } from "zod";
import type { FreshdeskError } from "../errors.js";
import type { HttpClient } from "../http.js";

// `z.object` strips unknown keys; the result is still built field by field.
const body = z.object({
  name: z.string(),
  email: z.string().nullable(),
  company_id: z.number().int().nullish(),
});

export interface Contact {
  name: string;
  email: string | null;
  company_id: number | null;
}

export type ContactResult =
  { ok: true; contact: Contact; attempts: number } | { ok: false; error: FreshdeskError };

export async function getContact(
  http: HttpClient,
  id: number,
  deadline?: number,
): Promise<ContactResult> {
  if (!(Number.isSafeInteger(id) && id > 0)) return refused("id");
  const result = await http.requestWithRetry({ path: "/contacts/{id}", params: { id } }, deadline);
  if (!result.ok) return { ok: false, error: result.error };
  const parsed = body.safeParse(result.body);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "server",
        http_status: result.status,
        message: `Freshdesk sent a contact in an unexpected shape (HTTP ${result.status}).`,
        retryable: false,
      },
    };
  }
  const { name, email, company_id } = parsed.data;
  return {
    ok: true,
    contact: { name, email, company_id: company_id ?? null },
    attempts: result.attempts,
  };
}

function refused(name: string): { ok: false; error: FreshdeskError } {
  return {
    ok: false,
    error: {
      code: "validation",
      http_status: null,
      message: `Not sent: ${name} is not a valid value.`,
      retryable: false,
    },
  };
}
