// `list_groups` (SPEC §8.2): groups for assignment, in the list envelope
// (SPEC §8.4).
//
//   - Each group is `{id, name}`; every other key is left out.
//   - The name is admin-set: through `plainName` (tags stripped, capped), not
//     wrapped (owner, 2026-11-23).
//   - The whole list in one response, through `listGroups`: at most MAX_PAGES
//     pages, `truncated: true` past them. It never gives a `next_cursor`, so
//     its last position is 0; a cursor is still read first, before any
//     request, so one from another call or past 0 sends nothing.
//   - `api_calls_used` is the pages that came back (see `listAll`): a page
//     that needed a retry counts once, though each attempt was a call. A
//     recorded limitation, said in the description and the cost.
//   - One deadline for the whole call, CALL_DEADLINE_MS from its start, shared
//     by every page (as the schema service's load): a page it cuts, or one
//     not asked for because it has passed, fails the call.

import { z } from "zod";
import { listGroups } from "../../../client/resources/groups.js";
import { NAME_CAP, plainName } from "../../format.js";
import { listEnvelope, readCursor } from "../../list.js";
import type { Tool } from "../index.js";

/** One call's pages end within this, all of them together. */
const CALL_DEADLINE_MS = 30_000;

/** The last cursor position this tool serves: it returns one page only. */
export const MAX_POSITION = 0;

const input = z.object({ cursor: z.string().optional() });

export const listGroupsTool: Tool<typeof input> = {
  name: "list_groups",
  description: [
    "The help desk's groups, for assigning a ticket: each one's id and name.",
    "The whole list comes in one response; a list longer than 1,000 groups is cut and says truncated: true.",
    "api_calls_used counts the pages that came back: a page Freshdesk had to be asked for again counts once.",
    `Names are shown without HTML and cut at ${NAME_CAP} characters (ending with …).`,
  ].join(" "),
  input,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  cost: "1 API call per 100 groups, at most 10, within 30 s; api_calls_used counts pages, so a page retried after an error counts once",
  customerText: false,
  async handler(args, context) {
    const call = { tool: "list_groups", args };
    const cursor = readCursor(call, MAX_POSITION);
    if (!cursor.ok) return cursor;
    const listed = await listGroups(context.http, Date.now() + CALL_DEADLINE_MS);
    if (!listed.ok) return listed;
    const items = listed.items.map((group) => ({ id: group.id, name: plainName(group.name) }));
    return {
      ok: true,
      value: listEnvelope(call, {
        items,
        truncated: listed.truncated,
        api_calls_used: listed.pages,
      }),
    };
  },
};
