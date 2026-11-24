// Every item of a paged list, each page checked by a zod schema before the
// next is asked for. Its callers: `agents.ts` and `groups.ts` (SPEC §7.3),
// `tickets.ts`'s `listConversations`, `solutions.ts`'s three lists.
//
// Pages of PER_PAGE (Freshdesk's maximum) through `paginate`, at most
// MAX_PAGES of them: past the cap the list ends where it stopped, and
// `truncated` says so. `attempts` is the requests sent for all the pages,
// retries included (`paginate`'s count): what the caller reports as API calls.
//
// A page in any other shape is `server` with that page's real status, not
// retryable, and no further page is asked for. Its message is fixed text: it
// quotes nothing from the body. An HTTP failure is returned unchanged.
//
// `deadline` (epoch ms, optional) is the caller's, for all the pages: see
// `paginate`. `params` fill the path template (`/tickets/{id}/conversations`).

import type { z } from "zod";
import type { FreshdeskError } from "../errors.js";
import type { HttpClient } from "../http.js";

export const PER_PAGE = 100;
export const MAX_PAGES = 10;

export type ListResult<T> =
  | { ok: true; items: T[]; truncated: boolean; attempts: number }
  | { ok: false; error: FreshdeskError };

/** `noun` names the list in the error message: "agents", "groups", "conversations". */
export async function listAll<T>(
  http: HttpClient,
  path: string,
  item: z.ZodType<T>,
  noun: string,
  deadline?: number,
  params?: Record<string, string | number>,
): Promise<ListResult<T>> {
  const items: T[] = [];
  const pages = http.paginate(
    { path, params, query: { per_page: PER_PAGE } },
    { pages: MAX_PAGES },
    deadline,
  );
  for (;;) {
    // By hand, not `for await`: the return value is where `truncated` is.
    const step = await pages.next();
    if (step.done) {
      const { truncated, attempts } = step.value;
      return { ok: true, items, truncated, attempts };
    }
    const result = step.value;
    if (!result.ok) return result;
    const parsed = item.array().safeParse(result.body);
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "server",
          http_status: result.status,
          message: `Freshdesk sent ${noun} in an unexpected shape (HTTP ${result.status}).`,
          retryable: false,
        },
      };
    }
    items.push(...parsed.data);
  }
}
