// Ticket search (SPEC §5, §7.1): one page of `GET /search/tickets`, with the
// limits docs/architecture/ticket-queries.md ("Parameters") records. Building
// the query from filters is T-043's; the tool is T-028's.
//
//   - The caller gives the conditions (`status:2 AND priority:3`); this module
//     puts them in double quotes and `HttpClient` percent-encodes them with
//     `URLSearchParams`, a space as `+` (measured to work, 2026-11-24).
//   - `query` is a non-blank string with no double quote (it would end the
//     quoted query) and no backslash (it could escape one), at most
//     MAX_QUERY_LENGTH UTF-16 units once quoted:
//     Freshdesk documents 512, and counting the quotes is the cautious
//     reading. `page` is a whole number 1–10: page 11 is refused by
//     Freshdesk (measured 2026-11-24). Any other value, whatever a cast let
//     through, is `validation` with `http_status: null`, naming the
//     parameter, not the value, and no request is sent.
//   - No `include`: search refuses `include=stats` (measured 2026-11-24).
//   - Cost class `cheap` (ticket-queries.md, "Cost class for the limiter").
//
// The body is `{total, results}`: `total` a whole number from 0 (it can
// exceed 300, the 10 pages' reach), `results` tickets in `tickets.ts`'s shape,
// unknown keys passed through. A body in any other shape is `server` with the
// response's real status, not retryable, and a fixed message that quotes
// nothing from it. An HTTP failure is returned unchanged (a 400 is
// `validation` with Freshdesk's `errors[]`).
//
// `attempts` is the requests sent, retries included. `deadline` (epoch ms,
// optional) is the caller's: see `requestWithRetry`.

import { z } from "zod";
import type { FreshdeskError } from "../errors.js";
import type { HttpClient } from "../http.js";
import { type Ticket, ticket } from "./tickets.js";

/** Freshdesk's limit on the query, counted here with its two quotes. */
export const MAX_QUERY_LENGTH = 512;
/** Results on a full page of search (documented; a page of 30 measured 2026-11-24). */
export const SEARCH_PER_PAGE = 30;
/** Search refuses any page past this one. */
export const MAX_SEARCH_PAGE = 10;

const body = z.object({
  total: z.number().int().nonnegative(),
  results: ticket.array(),
});

export type SearchResult =
  | { ok: true; results: Ticket[]; total: number; attempts: number }
  | { ok: false; error: FreshdeskError };

export async function searchTickets(
  http: HttpClient,
  query: string,
  page = 1,
  deadline?: number,
): Promise<SearchResult> {
  if (
    typeof query !== "string" ||
    query.trim() === "" ||
    query.includes('"') ||
    query.includes("\\")
  ) {
    return refused("query");
  }
  const quoted = `"${query}"`;
  if (quoted.length > MAX_QUERY_LENGTH) return refused("query");
  if (!(Number.isInteger(page) && page >= 1 && page <= MAX_SEARCH_PAGE)) return refused("page");
  const result = await http.requestWithRetry(
    { path: "/search/tickets", query: { query: quoted, page }, cost: "cheap" },
    deadline,
  );
  if (!result.ok) return { ok: false, error: result.error };
  const parsed = body.safeParse(result.body);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "server",
        http_status: result.status,
        message: `Freshdesk sent search results in an unexpected shape (HTTP ${result.status}).`,
        retryable: false,
      },
    };
  }
  return {
    ok: true,
    results: parsed.data.results,
    total: parsed.data.total,
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
