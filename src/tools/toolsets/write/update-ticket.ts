// `update_ticket` (SPEC §8.2; RFC 2026-11-25-write-safety-core, OD-2 and the
// owner's decision 6): change one ticket through the core's `update_ticket`
// entry, the only write it can make.
//
//   - A factory: `updateTicket(entry)` takes the core's `update_ticket` entry
//     and nothing else (./index.ts hands it over). The entry's type is written
//     here, by shape, since no module under src/tools/ may import src/core/
//     (eslint.tool-imports.json); src/tools/context.ts, which passes the real
//     entry, is where the compiler checks the two agree.
//   - `fields`: status, priority, type, group, agent and custom fields, by API
//     name or label, values by name or id, as `ticketInput` reads them. The
//     core checks them against its own allow set for this entry: any other
//     field (requester, subject, ...) is `field_not_writable` and nothing is
//     sent. Resolved and Closed are allowed (owner, 2026-11-25); the
//     description says Freshdesk may then email the requester.
//   - `tags_add` / `tags_remove`: merged into the ticket's current tags, read
//     with one GET (Freshdesk's PUT replaces the whole list). Compared without
//     case: a tag already there is not added again, a removal matches any
//     case; the current order is kept, new tags go at the end. A tag in both
//     lists, or more than MAX_TAGS in one list, is refused before any
//     request. A current tag list that is not a list of strings is refused
//     (`server`), nothing sent: the tool never overwrites tags it could not
//     read. An absent `tags` key is no tags. Not atomic: Freshdesk has no
//     conditional PUT, so a tag someone else changes between the GET and the
//     PUT is overwritten; the description says so.
//   - A call that asks for nothing (no field, no tag) is refused before any
//     request, the schema load included. A tag merge that changes nothing is
//     not sent; with no field either, no PUT at all: `changed: false` (the
//     core refuses an empty change).
//   - The input is a strict object: a key it does not name (`subject` beside
//     `fields`) is refused, not dropped.
//   - Output: `ticket_id`, `changed`, the tags sent when they changed (through
//     `plainName`), and `api_calls_used` (the schema load, the tag read and
//     the PUT, retries included). Nothing else of Freshdesk's answer.
//   - One deadline, CALL_DEADLINE_MS from the call's start, for the tag read
//     and the PUT; the client starts no write with under 10 s of it left.

import { z } from "zod";
import type { FreshdeskError } from "../../../client/errors.js";
import { getTicket, type Ticket } from "../../../client/resources/tickets.js";
import type { Schema } from "../../../schema/index.js";
import { plainName } from "../../format.js";
import type { Tool } from "../index.js";

/** The tag read and the PUT end within this, together. */
const CALL_DEADLINE_MS = 30_000;

/** The most tags `tags_add` or `tags_remove` may name. */
export const MAX_TAGS = 50;

/** A change as the core's `update_ticket` entry takes it. */
export interface UpdateTicketChange {
  schema: Schema;
  id: number;
  fields: Record<string, unknown>;
  /** The ticket's whole tag list, when it changes. */
  tags?: readonly string[];
  deadline?: number;
}

export type UpdateTicketResult =
  | { ok: true; value: Ticket; attempts: number }
  | { ok: false; error: FreshdeskError; attempts: number };

/** The core's `update_ticket` entry (src/core/write-path.ts), by shape. */
export interface UpdateTicketEntry {
  readonly update: (change: UpdateTicketChange) => Promise<UpdateTicketResult>;
}

const tagList = z.array(z.string().trim().min(1)).max(MAX_TAGS);

const input = z.strictObject({
  ticket_id: z.number().int().positive(),
  fields: z.record(z.string(), z.unknown()).optional(),
  tags_add: tagList.optional(),
  tags_remove: tagList.optional(),
});

function refusal(message: string): { ok: false; error: FreshdeskError } {
  return { ok: false, error: { code: "validation", http_status: null, message, retryable: false } };
}

const key = (tag: string) => tag.toLowerCase();

/** The current tags with `remove` taken out and `add` put in, both without case. */
function merge(current: readonly string[], add: string[], remove: string[]): string[] {
  const removed = new Set(remove.map(key));
  const tags = current.filter((tag) => !removed.has(key(tag)));
  for (const tag of add) {
    if (!tags.some((kept) => key(kept) === key(tag))) tags.push(tag);
  }
  return tags;
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((tag, i) => tag === b[i]);

const currentTags = z.array(z.string()).optional();

export function updateTicket(entry: UpdateTicketEntry): Tool<typeof input> {
  return {
    name: "update_ticket",
    description: [
      "Change one ticket: status, priority, type, group, agent and custom fields, in fields, by API name or label, each value by name or id (agents and groups as list_agents and list_groups give them); and tags, added with tags_add and removed with tags_remove, merged into the ticket's current tags (read first, then the whole list is written, so a tag someone else changes in between may be overwritten).",
      "No other field can be set: requester, subject, description and the rest are refused, and nothing is sent.",
      "Setting the status to Resolved or Closed may make Freshdesk email the requester and send a satisfaction survey.",
      "Freshdesk automations may act on the change, as for an agent's edit.",
      "Returns the ticket id, whether anything changed, the tags when they changed, and api_calls_used.",
    ].join(" "),
    input,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    cost: "1 API call for the change, plus 1 to read the current tags when tags_add or tags_remove is given, within 30 s, plus one per retry after an error, plus at least 3 when the ticket-field schema is not cached",
    customerText: false,
    async handler(args, context) {
      const deadline = Date.now() + CALL_DEADLINE_MS;
      const fields = args.fields ?? {};
      const add = args.tags_add ?? [];
      const remove = args.tags_remove ?? [];
      if (Object.keys(fields).length === 0 && add.length === 0 && remove.length === 0) {
        return refusal("Nothing to change: give fields, tags_add or tags_remove.");
      }
      const removed = new Set(remove.map(key));
      const both = add.filter((tag) => removed.has(key(tag)));
      if (both.length > 0) {
        return refusal(
          `A tag cannot be both added and removed: ${both.map((tag) => plainName(tag)).join(", ")}.`,
        );
      }
      const loaded = await context.schema.get();
      if (!loaded.ok) return loaded;
      let calls = loaded.attempts;
      let tags: string[] | undefined;
      if (add.length > 0 || remove.length > 0) {
        const found = await getTicket(context.http, args.ticket_id, [], deadline);
        calls += found.attempts ?? 0;
        if (!found.ok) return found;
        const now = currentTags.safeParse(found.ticket.tags);
        if (!now.success) {
          return {
            ok: false,
            error: {
              code: "server",
              http_status: null,
              message:
                "Freshdesk sent the ticket's tags in an unexpected shape, so they were not merged; nothing was changed.",
              retryable: false,
            },
          };
        }
        const merged = merge(now.data ?? [], add, remove);
        if (!sameList(merged, now.data ?? [])) tags = merged;
      }
      if (Object.keys(fields).length === 0 && tags === undefined) {
        return {
          ok: true,
          value: { ticket_id: args.ticket_id, changed: false, api_calls_used: calls },
        };
      }
      const result = await entry.update({
        schema: loaded.schema,
        id: args.ticket_id,
        fields,
        ...(tags === undefined ? {} : { tags }),
        deadline,
      });
      calls += result.attempts;
      if (!result.ok) return { ok: false, error: result.error };
      return {
        ok: true,
        value: {
          ticket_id: args.ticket_id,
          changed: true,
          ...(tags === undefined ? {} : { tags: tags.map((tag) => plainName(tag)) }),
          api_calls_used: calls,
        },
      };
    },
  };
}
