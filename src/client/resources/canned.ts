// Canned responses (SPEC §7.1, §8.2): the reads T-034's
// `list_canned_responses` and `get_canned_response` stand on. Create and
// update are `canned_write`'s (SPEC §8.3), not here.
//
//   - `listCannedFolders`: every page of `GET /canned_response_folders`,
//     through `list-all.ts`: 100 per page, at most 10 pages, `truncated` past
//     the cap; a malformed page and an HTTP failure as `listAll` returns them.
//     Freshdesk documents no pagination for it; `per_page` and a `Link` are
//     followed if sent.
//   - `listCannedResponses`: `GET /canned_response_folders/{id}`, one
//     request: the folder with its responses' ids and titles
//     (`canned_responses`). Not `/canned_response_folders/{id}/responses`,
//     which sends every response's content and attachments too.
//   - `getCannedResponse`: `GET /canned_responses/{id}`.
//   Both lists take an optional trailing cost class (`cheap` unless given),
//   for a tool that walks folders.
//
// Freshdesk documents these endpoints as admin-only: for any other key they
// fail as Freshdesk answers (a 403 is `forbidden`). Shapes are Freshdesk's API
// v2 documentation, not measured on an account.
//
// What is returned is a fixed allow-list built field by field, not a
// pass-through: a folder is `{id, name, personal}`, a listed response
// `{id, title}`, a viewed response `{id, title, text, folder_id, visibility}`
// with `text` Freshdesk's plain-text `content` (the HTML `content_html` is
// dropped, as are attachments and `group_ids`; `null` stays `null`). Each
// needs a whole-number `id`, a string `name` or `title`, and a `content`
// string or null. `personal` (documented on a listed folder: true when only
// its owner sees it) is a boolean, or `null` when missing or unreadable.
// `visibility` (documented on create: 0 all agents, 1 personal, 2 selected
// groups; not in the documented view sample) is a whole number, or `null`
// likewise, so a caller can label an unknown one as unknown; `folder_id` a
// positive safe integer, or `null` likewise. A body in any other shape is
// `server` with the response's real status, not retryable, and a fixed
// message that quotes nothing from it. An HTTP failure (a 404 is
// `not_found`) is returned unchanged.
//
// Values are checked before anything is sent, whatever a cast let through: an
// id is a positive safe integer. Any other is `validation` with
// `http_status: null`, naming the parameter, not the value, and no request is
// sent.
//
// `attempts` is the requests sent, retries included: what a tool reports as
// API calls. A `listCannedResponses` or `getCannedResponse` that fails after
// its id was accepted carries it too (0 when nothing was sent). `deadline`
// (epoch ms, optional) is the caller's: see `requestWithRetry` and `paginate`.

import { z } from "zod";
import type { FreshdeskError } from "../errors.js";
import type { GetHttp } from "../http.js";
import type { CostClass } from "../rate-limit.js";
import { listAll, type ListResult } from "./list-all.js";

// `z.object` strips unknown keys; the results are still built field by field.
const folder = z.object({
  id: z.number().int(),
  name: z.string(),
  personal: z.boolean().nullable().catch(null),
});
const listed = z.object({ id: z.number().int(), title: z.string() });
const folderView = z.object({ canned_responses: listed.array() });
const viewed = listed.extend({
  content: z.string().nullable(),
  folder_id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().catch(null),
  visibility: z.number().int().nullable().catch(null),
});

export interface CannedFolder {
  id: number;
  name: string;
  /** True when only its owner sees the folder; `null` when missing or unreadable. */
  personal: boolean | null;
}

export interface CannedResponseSummary {
  id: number;
  title: string;
}

export interface CannedResponse extends CannedResponseSummary {
  /** Plain text: Freshdesk's `content`; `null` when Freshdesk sends null. */
  text: string | null;
  /** The response's folder; `null` when missing or unreadable. */
  folder_id: number | null;
  /** 0 all agents, 1 personal, 2 selected groups; `null` when missing or unreadable. */
  visibility: number | null;
}

export type CannedResponsesResult =
  | { ok: true; responses: CannedResponseSummary[]; attempts: number }
  | { ok: false; error: FreshdeskError; attempts?: number };

export type CannedResponseResult =
  | { ok: true; response: CannedResponse; attempts: number }
  | { ok: false; error: FreshdeskError; attempts?: number };

export async function listCannedFolders(
  http: GetHttp,
  deadline?: number,
  cost?: CostClass,
): Promise<ListResult<CannedFolder>> {
  const result = await listAll(
    http,
    "/canned_response_folders",
    folder,
    "canned response folders",
    deadline,
    undefined,
    cost,
  );
  if (!result.ok) return result;
  const items = result.items.map((item) => ({
    id: item.id,
    name: item.name,
    personal: item.personal,
  }));
  return { ...result, items };
}

export async function listCannedResponses(
  http: GetHttp,
  folderId: number,
  deadline?: number,
  cost?: CostClass,
): Promise<CannedResponsesResult> {
  if (!isPositiveInt(folderId)) return refused("folder id");
  const result = await http.requestWithRetry(
    {
      path: "/canned_response_folders/{id}",
      params: { id: folderId },
      ...(cost === undefined ? {} : { cost }),
    },
    deadline,
  );
  if (!result.ok) return { ok: false, error: result.error, attempts: result.attempts };
  const parsed = folderView.safeParse(result.body);
  if (!parsed.success) {
    return { ...malformed("a canned response folder", result.status), attempts: result.attempts };
  }
  const responses = parsed.data.canned_responses.map((item) => ({
    id: item.id,
    title: item.title,
  }));
  return { ok: true, responses, attempts: result.attempts };
}

export async function getCannedResponse(
  http: GetHttp,
  id: number,
  deadline?: number,
): Promise<CannedResponseResult> {
  if (!isPositiveInt(id)) return refused("id");
  const result = await http.requestWithRetry(
    { path: "/canned_responses/{id}", params: { id } },
    deadline,
  );
  if (!result.ok) return { ok: false, error: result.error, attempts: result.attempts };
  const parsed = viewed.safeParse(result.body);
  if (!parsed.success) {
    return { ...malformed("a canned response", result.status), attempts: result.attempts };
  }
  const { title, content, folder_id, visibility } = parsed.data;
  return {
    ok: true,
    response: { id: parsed.data.id, title, text: content, folder_id, visibility },
    attempts: result.attempts,
  };
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
