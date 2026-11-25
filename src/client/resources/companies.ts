// Companies (SPEC §7.1, §8.2): `getCompany`, one `GET /companies/{id}`, for
// the company name in `get_ticket`'s requester block.
//
// The returned company is a fixed allow-list, not a pass-through: `id` and
// `name`, nothing else (notes, domains, custom fields and every other key
// are dropped here). A company needs a whole-number `id` and a string
// `name`. A body in any other shape is `server` with the response's real
// status, not retryable, and a fixed message that quotes nothing from it. An
// HTTP failure (a 404 is `not_found`) is returned unchanged.
//
// The id is checked before anything is sent, whatever a cast let through: a
// positive safe integer, or `validation` with `http_status: null`, naming
// the parameter, not the value, and no request is sent.
//
// `attempts` is the requests sent, retries included. `deadline` (epoch ms,
// optional) is the caller's: see `requestWithRetry`.

import { z } from "zod";
import type { FreshdeskError } from "../errors.js";
import type { GetHttp } from "../http.js";

// `z.object` strips unknown keys; the result is still built field by field.
const body = z.object({
  id: z.number().int(),
  name: z.string(),
});

export interface Company {
  id: number;
  name: string;
}

export type CompanyResult =
  { ok: true; company: Company; attempts: number } | { ok: false; error: FreshdeskError };

export async function getCompany(
  http: GetHttp,
  id: number,
  deadline?: number,
): Promise<CompanyResult> {
  if (!(Number.isSafeInteger(id) && id > 0)) return refused("id");
  const result = await http.requestWithRetry({ path: "/companies/{id}", params: { id } }, deadline);
  if (!result.ok) return { ok: false, error: result.error };
  const parsed = body.safeParse(result.body);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "server",
        http_status: result.status,
        message: `Freshdesk sent a company in an unexpected shape (HTTP ${result.status}).`,
        retryable: false,
      },
    };
  }
  return {
    ok: true,
    company: { id: parsed.data.id, name: parsed.data.name },
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
