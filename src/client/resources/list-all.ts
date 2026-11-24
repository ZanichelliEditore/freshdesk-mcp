// Every item of a paged list (agents, groups: SPEC §7.3), each page checked by
// a zod schema before the next is asked for.
//
// Pages of PER_PAGE (Freshdesk's maximum) through `paginate`, at most
// MAX_PAGES of them: past the cap the list ends where it stopped, and
// `truncated` says so. `pages` is how many pages came back: one API call
// each, retries of a page not counted (`requestWithRetry` does not say).
//
// A page in any other shape is `server` with that page's real status, not
// retryable, and no further page is asked for. Its message is fixed text: it
// quotes nothing from the body. An HTTP failure is returned unchanged.
//
// `deadline` (epoch ms, optional) is the caller's, for all the pages: see
// `paginate`.

import type { z } from "zod";
import type { FreshdeskError } from "../errors.js";
import type { HttpClient } from "../http.js";

export const PER_PAGE = 100;
export const MAX_PAGES = 10;

export type ListResult<T> =
  | { ok: true; items: T[]; truncated: boolean; pages: number }
  | { ok: false; error: FreshdeskError };

/** `noun` names the list in the error message: "agents", "groups". */
export async function listAll<T>(
  http: HttpClient,
  path: string,
  item: z.ZodType<T>,
  noun: string,
  deadline?: number,
): Promise<ListResult<T>> {
  const items: T[] = [];
  let received = 0;
  const pages = http.paginate(
    { path, query: { per_page: PER_PAGE } },
    { pages: MAX_PAGES },
    deadline,
  );
  for (;;) {
    // By hand, not `for await`: the return value is where `truncated` is.
    const step = await pages.next();
    if (step.done) {
      return { ok: true, items, truncated: step.value.truncated, pages: received };
    }
    const result = step.value;
    if (!result.ok) return result;
    received += 1;
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
