// Solutions, the knowledge base (SPEC §7.1, §8.2): the reads T-032's
// `search_solutions`, `get_solution_article` and `list_solution_tree` stand on.
// Create, update and translate are `kb_write`'s (SPEC §8.3), not here.
//
//   - `listCategories`: every page of `GET /solutions/categories`;
//     `listFolders`: of `GET /solutions/categories/{id}/folders`;
//     `listArticles`: of `GET /solutions/folders/{id}/articles`. All three
//     through `list-all.ts`: 100 per page, at most 10 pages, `truncated` past
//     the cap; a malformed page and an HTTP failure as `listAll` returns them.
//   - `getArticle`: `GET /solutions/articles/{id}`.
//   - `searchArticles`: `GET /search/solutions?term=`, one request; the body
//     is a list of articles. `HttpClient` percent-encodes the term with
//     `URLSearchParams`, a space as `+`. Freshdesk documents no page
//     parameter for it.
//
// Shapes are Freshdesk's API v2 documentation, not measured on an account.
// What is returned is a fixed allow-list built field by field, not a
// pass-through: a category or a folder is `{id, name}`, an article in a list
// or a search hit `{id, title, status}`, a viewed article `{id, title, text,
// status}` with `text` Freshdesk's plain-text `description_text` (the HTML
// `description` is dropped). Each needs a whole-number `id` and `status`, a
// string `name`, `title` and `description_text`. A body in any other shape is
// `server` with the response's real status, not retryable, and a fixed
// message that quotes nothing from it. An HTTP failure (a 404 is
// `not_found`) is returned unchanged.
//
// Values are checked before anything is sent, whatever a cast let through: an
// id is a positive safe integer; the term a non-blank string of at most
// MAX_TERM_LENGTH UTF-16 units. Any other is `validation` with
// `http_status: null`, naming the parameter, not the value, and no request is
// sent.
//
// `attempts` is the requests sent, retries included: what a tool reports as
// API calls. A `getArticle` or `searchArticles` that fails after its values
// were accepted carries it too (0 when nothing was sent). `deadline` (epoch
// ms, optional) is the caller's: see `requestWithRetry` and `paginate`. Every
// request is `cheap`: each tool call is a bounded number of them.

import { z } from "zod";
import type { FreshdeskError } from "../errors.js";
import type { HttpClient } from "../http.js";
import { listAll, type ListResult } from "./list-all.js";

/**
 * The longest term sent. Freshdesk documents no limit; this one, the ticket
 * search's (search.ts), keeps the URL short.
 */
export const MAX_TERM_LENGTH = 512;

// `z.object` strips unknown keys; the results are still built field by field.
const named = z.object({ id: z.number().int(), name: z.string() });
const listed = z.object({ id: z.number().int(), title: z.string(), status: z.number().int() });
const viewed = listed.extend({ description_text: z.string() });

export interface SolutionCategory {
  id: number;
  name: string;
}

export type SolutionFolder = SolutionCategory;

export interface ArticleSummary {
  id: number;
  title: string;
  status: number;
}

export interface Article extends ArticleSummary {
  /** Plain text: Freshdesk's `description_text`. */
  text: string;
}

export type ArticleResult =
  | { ok: true; article: Article; attempts: number }
  | { ok: false; error: FreshdeskError; attempts?: number };

export type ArticleSearchResult =
  | { ok: true; results: ArticleSummary[]; attempts: number }
  | { ok: false; error: FreshdeskError; attempts?: number };

export async function listCategories(
  http: HttpClient,
  deadline?: number,
): Promise<ListResult<SolutionCategory>> {
  const result = await listAll(
    http,
    "/solutions/categories",
    named,
    "solution categories",
    deadline,
  );
  return result.ok ? { ...result, items: result.items.map(toNamed) } : result;
}

export async function listFolders(
  http: HttpClient,
  categoryId: number,
  deadline?: number,
): Promise<ListResult<SolutionFolder>> {
  if (!isPositiveInt(categoryId)) return refused("category id");
  const result = await listAll(
    http,
    "/solutions/categories/{id}/folders",
    named,
    "solution folders",
    deadline,
    { id: categoryId },
  );
  return result.ok ? { ...result, items: result.items.map(toNamed) } : result;
}

export async function listArticles(
  http: HttpClient,
  folderId: number,
  deadline?: number,
): Promise<ListResult<ArticleSummary>> {
  if (!isPositiveInt(folderId)) return refused("folder id");
  const result = await listAll(
    http,
    "/solutions/folders/{id}/articles",
    listed,
    "solution articles",
    deadline,
    { id: folderId },
  );
  return result.ok ? { ...result, items: result.items.map(toSummary) } : result;
}

export async function getArticle(
  http: HttpClient,
  id: number,
  deadline?: number,
): Promise<ArticleResult> {
  if (!isPositiveInt(id)) return refused("id");
  const result = await http.requestWithRetry(
    { path: "/solutions/articles/{id}", params: { id } },
    deadline,
  );
  if (!result.ok) return { ok: false, error: result.error, attempts: result.attempts };
  const parsed = viewed.safeParse(result.body);
  if (!parsed.success) {
    return { ...malformed("a solution article", result.status), attempts: result.attempts };
  }
  const { title, status, description_text } = parsed.data;
  return {
    ok: true,
    article: { id: parsed.data.id, title, text: description_text, status },
    attempts: result.attempts,
  };
}

export async function searchArticles(
  http: HttpClient,
  term: string,
  deadline?: number,
): Promise<ArticleSearchResult> {
  if (typeof term !== "string" || term.trim() === "" || term.length > MAX_TERM_LENGTH) {
    return refused("term");
  }
  const result = await http.requestWithRetry(
    { path: "/search/solutions", query: { term } },
    deadline,
  );
  if (!result.ok) return { ok: false, error: result.error, attempts: result.attempts };
  const parsed = listed.array().safeParse(result.body);
  if (!parsed.success) {
    return { ...malformed("solution search results", result.status), attempts: result.attempts };
  }
  return { ok: true, results: parsed.data.map(toSummary), attempts: result.attempts };
}

function toNamed(item: z.infer<typeof named>): SolutionCategory {
  return { id: item.id, name: item.name };
}

function toSummary(item: z.infer<typeof listed>): ArticleSummary {
  return { id: item.id, title: item.title, status: item.status };
}

function malformed(noun: string, status: number): { ok: false; error: FreshdeskError } {
  return {
    ok: false,
    error: {
      code: "server",
      http_status: status,
      message: `Freshdesk sent ${noun} in an unexpected shape (HTTP ${status}).`,
      retryable: false,
    },
  };
}

function isPositiveInt(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
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
