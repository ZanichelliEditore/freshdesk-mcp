// The knowledge-base reads (SPEC §8.2, C3, C9): `search_solutions`,
// `get_solution_article`, `list_solution_tree`, over solutions.ts (T-031).
//
//   - Titles and names (article, folder, category) are admin-set: through
//     `plainName` (tags stripped, capped at NAME_CAP), never wrapped (owner,
//     2026-11-23, OD-7). An article's text is wrapped in `<ticket_content>`
//     and cut at ARTICLE_CAP with format.ts's marker, after the block; there
//     is no way to fetch the rest, so the marker names none.
//   - Drafts and non-public content are labelled, not dropped: an article
//     or hit carries `status` by name (`draft` for 1, `published` for 2,
//     else `null`), a folder or hit `visibility` by name (Freshdesk's
//     documented values 1–4, else `null`, unknown). A hit's `visibility` is
//     its folder's (solutions.ts's `folder_visibility`). Every description
//     says a draft, or content not visible to all users, is for the agent
//     and must not be quoted to a customer as published guidance.
//     `get_solution_article` cannot give visibility (the viewed article has
//     no folder visibility) and says so.
//   - `search_solutions`: the cursor is read first, before any request, with
//     MAX_POSITION. Freshdesk returns every hit in one response, so each call
//     runs the search again (1 request) and pages the hits locally, PAGE_SIZE
//     a call; a position is a page. Hits past HIT_CAP are cut, `truncated:
//     true` on every page, so the last position is HIT_CAP / PAGE_SIZE - 1.
//     `has_more` from the capped hit list.
//   - `list_solution_tree`: no cursor. Categories, then every category's
//     folders, then every folder's article titles (breadth first, so the
//     folder skeleton comes before articles), each list through `listAll`
//     (1 request per 100 entries, at most 10). At most MAX_LISTS lists a
//     call: a category whose folders, or a folder whose articles, were not
//     read for the cap has `folders: null` / `articles: null`, and
//     `truncated` is true; it is true too when `listAll`'s own cap cut a
//     list. Subfolders are not walked (solutions.ts does not read them).
//     A failed list fails the call.
//   - One deadline for the whole call, CALL_DEADLINE_MS from its start.
//     `api_calls_used` is every request sent, retries included (`attempts`).

import { z } from "zod";
import {
  getArticle,
  listArticles,
  listCategories,
  listFolders,
  MAX_TERM_LENGTH,
  searchArticles,
} from "../../../client/resources/solutions.js";
import { NAME_CAP, plainName, untrusted } from "../../format.js";
import { listEnvelope, readCursor } from "../../list.js";
import type { Tool } from "../index.js";

/** One call's requests end within this, all of them together. */
const CALL_DEADLINE_MS = 30_000;

/** Code points of an article's text returned; the rest is cut with the marker. */
export const ARTICLE_CAP = 10_000;
/** Search hits returned a call. */
export const PAGE_SIZE = 10;
/** Search hits kept; past them the list is cut (`truncated: true`). */
export const HIT_CAP = 100;
/** The last cursor position `search_solutions` serves: the last page of HIT_CAP. */
export const MAX_POSITION = HIT_CAP / PAGE_SIZE - 1;
/** Lists `list_solution_tree` reads a call (categories, a category's folders, a folder's articles). */
export const MAX_LISTS = 20;

const STATUS: Readonly<Record<number, string>> = { 1: "draft", 2: "published" };
const VISIBILITY: Readonly<Record<number, string>> = {
  1: "all users",
  2: "logged-in users",
  3: "agents only",
  4: "selected companies",
};

function statusName(status: number): string | null {
  return Object.hasOwn(STATUS, status) ? STATUS[status] : null;
}

function visibilityName(visibility: number | null): string | null {
  return visibility !== null && Object.hasOwn(VISIBILITY, visibility)
    ? VISIBILITY[visibility]
    : null;
}

const FOR_THE_AGENT =
  "A draft (status: draft), or content not visible to all users (visibility other than all users; null is unknown, so treat it as not public), is for the agent: it must not be quoted to a customer as published guidance.";
const NAMES = `Titles and names are shown without HTML and cut at ${NAME_CAP} characters (ending with …).`;
const ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const searchInput = z.object({ term: z.string(), cursor: z.string().optional() });

export const searchSolutionsTool: Tool<typeof searchInput> = {
  name: "search_solutions",
  description: [
    "Knowledge-base articles matching a term (for example squeak), drafts included: each one's id, title, status (draft, published, or null), visibility (its folder's: all users, logged-in users, agents only, selected companies, or null) and last update. get_solution_article gives an article's text.",
    `term is at most ${MAX_TERM_LENGTH} characters and not blank; otherwise it is refused and nothing is sent.`,
    `Results come ${PAGE_SIZE} a call, from the first ${HIT_CAP} hits only: past them the list is cut and says truncated: true. While has_more is true, call again with the same arguments and next_cursor; every call runs the search again.`,
    FOR_THE_AGENT,
    NAMES,
    "api_calls_used counts every request sent, retries included.",
  ].join(" "),
  input: searchInput,
  annotations: ANNOTATIONS,
  cost: "1 API call per call (the search runs again for every page), within 30 s, plus one per retry after an error",
  customerText: false,
  async handler(args, context) {
    const call = { tool: "search_solutions", args };
    const cursor = readCursor(call, MAX_POSITION);
    if (!cursor.ok) return cursor;
    const found = await searchArticles(context.http, args.term, Date.now() + CALL_DEADLINE_MS);
    if (!found.ok) return found;
    const kept = found.results.slice(0, HIT_CAP);
    const start = cursor.position * PAGE_SIZE;
    const more = start + PAGE_SIZE < kept.length;
    return {
      ok: true,
      value: listEnvelope(call, {
        items: kept.slice(start, start + PAGE_SIZE).map((hit) => ({
          id: hit.id,
          title: plainName(hit.title),
          status: statusName(hit.status),
          visibility: visibilityName(hit.folder_visibility),
          updated_at: hit.updated_at,
        })),
        ...(more ? { next: cursor.position + 1 } : {}),
        truncated: found.results.length > HIT_CAP,
        api_calls_used: found.attempts,
      }),
    };
  },
};

const articleInput = z.object({ article_id: z.number().int().positive() });

export const getSolutionArticleTool: Tool<typeof articleInput> = {
  name: "get_solution_article",
  description: [
    "One knowledge-base article by id: its title, status (draft, published, or null), last update and text, as plain text inside <ticket_content>.",
    `A text over ${ARTICLE_CAP.toLocaleString("en-US")} characters is cut, with a marker after the block saying how many characters were not shown; the rest cannot be fetched.`,
    "This tool does not give the article's visibility: search_solutions and list_solution_tree give its folder's.",
    FOR_THE_AGENT,
    NAMES,
    "api_calls_used counts every request sent, retries included.",
  ].join(" "),
  input: articleInput,
  annotations: ANNOTATIONS,
  cost: "1 API call, within 30 s, plus one per retry after an error",
  customerText: true,
  async handler(args, context) {
    const got = await getArticle(context.http, args.article_id, Date.now() + CALL_DEADLINE_MS);
    if (!got.ok) return got;
    const { article } = got;
    return {
      ok: true,
      value: {
        id: article.id,
        title: plainName(article.title),
        status: statusName(article.status),
        updated_at: article.updated_at,
        text: article.text === null ? null : untrusted(article.text, { cap: ARTICLE_CAP }),
        api_calls_used: got.attempts,
      },
    };
  },
};

interface TreeArticle {
  id: number;
  title: string;
  status: string | null;
  updated_at: string | null;
}

interface TreeFolder {
  id: number;
  name: string;
  visibility: string | null;
  articles: TreeArticle[] | null;
}

interface TreeCategory {
  id: number;
  name: string;
  folders: TreeFolder[] | null;
}

const treeInput = z.object({});

export const listSolutionTreeTool: Tool<typeof treeInput> = {
  name: "list_solution_tree",
  description: [
    "The knowledge base's outline: categories, each with its folders (name and visibility: all users, logged-in users, agents only, selected companies, or null), each with its articles' ids, titles, status (draft, published, or null) and last update. No article text: get_solution_article gives it.",
    `It reads at most ${MAX_LISTS} lists a call (the categories, one per category for its folders, one per folder for its articles), categories and folders first: a category or folder past that has folders: null or articles: null, and truncated is true. truncated is true too when a list was longer than 1,000 entries and cut. Subfolders are not shown: an article in a subfolder is found only through search_solutions.`,
    FOR_THE_AGENT,
    NAMES,
    "api_calls_used counts every request sent, retries included.",
  ].join(" "),
  input: treeInput,
  annotations: ANNOTATIONS,
  cost: `1 API call per list of up to 100 entries, at most ${MAX_LISTS} lists of at most 10 calls each, within 30 s, plus one per retry after an error`,
  customerText: false,
  async handler(_args, context) {
    const deadline = Date.now() + CALL_DEADLINE_MS;
    let lists = 1;
    const listed = await listCategories(context.http, deadline);
    if (!listed.ok) return listed;
    let calls = listed.attempts;
    let truncated = listed.truncated;

    const categories: TreeCategory[] = listed.items.map((category) => ({
      id: category.id,
      name: plainName(category.name),
      folders: null,
    }));
    for (const category of categories) {
      if (lists >= MAX_LISTS) {
        truncated = true;
        break;
      }
      lists += 1;
      const folders = await listFolders(context.http, category.id, deadline);
      if (!folders.ok) return folders;
      calls += folders.attempts;
      truncated ||= folders.truncated;
      category.folders = folders.items.map((folder) => ({
        id: folder.id,
        name: plainName(folder.name),
        visibility: visibilityName(folder.visibility),
        articles: null,
      }));
    }
    outer: for (const category of categories) {
      for (const folder of category.folders ?? []) {
        if (lists >= MAX_LISTS) {
          truncated = true;
          break outer;
        }
        lists += 1;
        const articles = await listArticles(context.http, folder.id, deadline);
        if (!articles.ok) return articles;
        calls += articles.attempts;
        truncated ||= articles.truncated;
        folder.articles = articles.items.map((article) => ({
          id: article.id,
          title: plainName(article.title),
          status: statusName(article.status),
          updated_at: article.updated_at,
        }));
      }
    }
    return { ok: true, value: { categories, truncated, api_calls_used: calls } };
  },
};
