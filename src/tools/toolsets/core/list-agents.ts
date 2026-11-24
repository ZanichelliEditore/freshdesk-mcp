// `list_agents` (SPEC §8.2): agents for assignment and notification, in the
// list envelope (SPEC §8.4).
//
//   - Each agent is `{id, name, email}`: the work email, on the contact; the
//     phone and every other key are left out (owner, 2026-11-23, OD-8).
//   - Name and email are admin-set: through `plainName` (tags stripped,
//     capped), not wrapped (owner, 2026-11-23). The email's cap is EMAIL_CAP.
//     The resource's schema does not check the email (an odd one must not
//     fail the schema service's load): a string is kept, anything else is
//     `null`.
//   - The whole list in one response, through `listAgents`: at most MAX_PAGES
//     pages, `truncated: true` past them. It never gives a `next_cursor`, so
//     its last position is 0; a cursor is still read first, before any
//     request, so one from another call or past 0 sends nothing.
//   - `api_calls_used` is every request sent for the list, retries included
//     (`listAll`'s `attempts`), as the description and the cost say.
//   - One deadline for the whole call, CALL_DEADLINE_MS from its start, shared
//     by every page (as the schema service's load): a page it cuts, or one
//     not asked for because it has passed, fails the call.

import { z } from "zod";
import { listAgents } from "../../../client/resources/agents.js";
import { NAME_CAP, plainName } from "../../format.js";
import { listEnvelope, readCursor } from "../../list.js";
import type { Tool } from "../index.js";

/** One call's pages end within this, all of them together. */
const CALL_DEADLINE_MS = 30_000;

/** The last cursor position this tool serves: it returns one page only. */
export const MAX_POSITION = 0;
/** An email address's longest form (RFC 5321 path limit). */
const EMAIL_CAP = 254;

const input = z.object({ cursor: z.string().optional() });

export const listAgentsTool: Tool<typeof input> = {
  name: "list_agents",
  description: [
    "The help desk's agents, for assigning a ticket or notifying someone: each one's id, name and work email.",
    "The whole list comes in one response; a list longer than 1,000 agents is cut and says truncated: true.",
    "api_calls_used counts every request sent, retries included.",
    `Names are shown without HTML and cut at ${NAME_CAP} characters (ending with …).`,
  ].join(" "),
  input,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  cost: "1 API call per 100 agents, at most 10, within 30 s, plus one per retry of a page after an error",
  customerText: false,
  async handler(args, context) {
    const call = { tool: "list_agents", args };
    const cursor = readCursor(call, MAX_POSITION);
    if (!cursor.ok) return cursor;
    const listed = await listAgents(context.http, Date.now() + CALL_DEADLINE_MS);
    if (!listed.ok) return listed;
    const items = listed.items.map(({ id, contact }) => ({
      id,
      name: plainName(contact.name),
      email: typeof contact.email === "string" ? plainName(contact.email, EMAIL_CAP) : null,
    }));
    return {
      ok: true,
      value: listEnvelope(call, {
        items,
        truncated: listed.truncated,
        api_calls_used: listed.attempts,
      }),
    };
  },
};
