// The canned-response reads (SPEC §8.2, C3, C10): `list_canned_responses`,
// `get_canned_response`, over canned.ts (T-033).
//
//   - Folder names and response titles are admin-set: through `plainName`
//     (tags stripped, capped at NAME_CAP), never wrapped (owner, 2026-11-23,
//     OD-7). A response's text (Freshdesk's plain-text `content`) loses its
//     tag-shaped runs (TAG, as solutions.ts strips an article's) and nothing
//     else: no entity is decoded and a lone `<` or `>` stays. Then it is
//     wrapped in `<ticket_content>` and cut at format.ts's TEXT_CAP with its
//     marker; the rest cannot be fetched, so the marker names no way to.
//   - Personal and group-limited content is labelled, not dropped: a folder
//     carries `personal` (true, false, or `null` when unknown), a viewed
//     response `visibility` by name (`all agents` 0, `personal` 1, `selected
//     groups` 2, else `null`, unknown) and `shared`, true only for `all
//     agents`. Every description says a personal or group-limited canned
//     response belongs to its owner(s) and should not be reused as team
//     guidance unless it is shared. A listed response has no visibility
//     (canned.ts's folder view gives ids and titles only), so it carries
//     `shared: null`, unknown until viewed: a folder's `personal: false` does
//     not make it shared.
//   - `list_canned_responses`: the cursor is read first, before any request,
//     with MAX_POSITION. Every call lists the folders again (`listAll`, 1
//     request per 100) and keeps the first FOLDER_CAP; a position is a page of
//     PAGE_SIZE folders, and each folder on the page has its responses read
//     (1 request each), the first RESPONSE_CAP titles kept. `truncated` is
//     true when FOLDER_CAP, RESPONSE_CAP (for a folder on this page) or
//     `listAll`'s own cap cut a list. Every request is `expensive` (the call
//     walks up to PAGE_SIZE lists): paced, and below the reserve the next is
//     refused, nothing sent, and the call is `rate_limited`. A failed list
//     fails the call.
//   - `get_canned_response`: the response only (1 request); its `visibility`
//     is on it, so no folder is read.
//   - One deadline for the whole call, CALL_DEADLINE_MS from its start.
//     `api_calls_used` is every request sent, retries included (`attempts`).

import { z } from "zod";
import {
  getCannedResponse,
  listCannedFolders,
  listCannedResponses,
} from "../../../client/resources/canned.js";
import { NAME_CAP, plainName, TEXT_CAP, untrusted } from "../../format.js";
import { listEnvelope, readCursor } from "../../list.js";
import type { Tool } from "../index.js";

/** One call's requests end within this, all of them together. */
const CALL_DEADLINE_MS = 30_000;

/** A tag-shaped run in a response's plain text: removed, nothing else. */
const TAG = /<\/?[A-Za-z][^<>]*>/g;
/** Folders returned a call, each with its responses read. */
export const PAGE_SIZE = 10;
/** Folders kept; past them the list is cut (`truncated: true`). */
export const FOLDER_CAP = 100;
/** Response titles kept a folder; past them the folder's list is cut (`truncated: true`). */
export const RESPONSE_CAP = 100;
/** The last cursor position `list_canned_responses` serves: the last page of FOLDER_CAP. */
export const MAX_POSITION = FOLDER_CAP / PAGE_SIZE - 1;

const VISIBILITY: Readonly<Record<number, string>> = {
  0: "all agents",
  1: "personal",
  2: "selected groups",
};

function visibilityName(visibility: number | null): string | null {
  return visibility !== null && Object.hasOwn(VISIBILITY, visibility)
    ? VISIBILITY[visibility]
    : null;
}

const OWNERS =
  "A canned response in a personal folder (personal: true), or one whose visibility is personal or selected groups, belongs to its owner(s) and should not be reused as team guidance unless it is shared (shared: true, visibility all agents). null is unknown: treat it as not shared.";
const NAMES = `Folder names and titles are shown without HTML and cut at ${NAME_CAP} characters (ending with …).`;
const ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

interface ListedFolder {
  id: number;
  name: string;
  personal: boolean | null;
  responses: { id: number; title: string; shared: null }[];
}

const listInput = z.object({ cursor: z.string().optional() });

export const listCannedResponsesTool: Tool<typeof listInput> = {
  name: "list_canned_responses",
  description: [
    "Canned response folders (for example Sprocket Replies), each with its id, name, personal (true when only its owner sees it, or null) and its responses' ids, titles (for example Sprocket on its way) and shared: null. No text: get_canned_response gives a response's text and visibility.",
    "A listed response's sharing is unknown until viewed (shared: null); a folder's personal: false does not make it shared.",
    `The list gives ${PAGE_SIZE} folders a call, from the first ${FOLDER_CAP} folders only, each with the first ${RESPONSE_CAP} titles only: past either the list is cut and says truncated: true. While has_more is true, call again with next_cursor; every call lists the folders again.`,
    "Every request is sent as an expensive operation: paced (2 requests a second by default), and refused with rate_limited when the account's API budget is low (the call then fails). A call that cannot finish within 30 s fails as network.",
    OWNERS,
    NAMES,
    "api_calls_used counts every request sent, retries included.",
  ].join(" "),
  input: listInput,
  annotations: ANNOTATIONS,
  cost: `1 API call per 100 folders listed (at most 10), plus 1 per folder returned (at most ${PAGE_SIZE}), within 30 s, plus one per retry after an error`,
  customerText: false,
  async handler(args, context) {
    const call = { tool: "list_canned_responses", args };
    const cursor = readCursor(call, MAX_POSITION);
    if (!cursor.ok) return cursor;
    const deadline = Date.now() + CALL_DEADLINE_MS;
    const listed = await listCannedFolders(context.http, deadline, "expensive");
    if (!listed.ok) return listed;
    let calls = listed.attempts;
    let truncated = listed.truncated || listed.items.length > FOLDER_CAP;
    const kept = listed.items.slice(0, FOLDER_CAP);
    const start = cursor.position * PAGE_SIZE;
    const items: ListedFolder[] = [];
    for (const folder of kept.slice(start, start + PAGE_SIZE)) {
      const got = await listCannedResponses(context.http, folder.id, deadline, "expensive");
      if (!got.ok) return got;
      calls += got.attempts;
      truncated ||= got.responses.length > RESPONSE_CAP;
      items.push({
        id: folder.id,
        name: plainName(folder.name),
        personal: folder.personal,
        responses: got.responses.slice(0, RESPONSE_CAP).map((response) => ({
          id: response.id,
          title: plainName(response.title),
          shared: null,
        })),
      });
    }
    const more = start + PAGE_SIZE < kept.length;
    return {
      ok: true,
      value: listEnvelope(call, {
        items,
        ...(more ? { next: cursor.position + 1 } : {}),
        truncated,
        api_calls_used: calls,
      }),
    };
  },
};

const responseInput = z.object({ canned_response_id: z.number().int().positive() });

export const getCannedResponseTool: Tool<typeof responseInput> = {
  name: "get_canned_response",
  description: [
    "One canned response by id (for example 3601, Sprocket on its way): its title, folder_id, visibility (all agents, personal, selected groups, or null when unknown), shared (true only for all agents) and text, as plain text inside <ticket_content>.",
    `A text over ${TEXT_CAP.toLocaleString("en-US")} characters is cut, with a marker after the block saying how many characters were not shown; the rest cannot be fetched.`,
    OWNERS,
    NAMES,
    "api_calls_used counts every request sent, retries included.",
  ].join(" "),
  input: responseInput,
  annotations: ANNOTATIONS,
  cost: "1 API call, within 30 s, plus one per retry after an error",
  customerText: true,
  async handler(args, context) {
    const got = await getCannedResponse(
      context.http,
      args.canned_response_id,
      Date.now() + CALL_DEADLINE_MS,
    );
    if (!got.ok) return got;
    const { response } = got;
    const visibility = visibilityName(response.visibility);
    return {
      ok: true,
      value: {
        id: response.id,
        title: plainName(response.title),
        folder_id: response.folder_id,
        visibility,
        shared: visibility === "all agents",
        text:
          response.text === null
            ? null
            : untrusted(response.text.replace(TAG, ""), { cap: TEXT_CAP }),
        api_calls_used: got.attempts,
      },
    };
  },
};
