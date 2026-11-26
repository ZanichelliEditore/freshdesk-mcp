// `add_note` (SPEC §8.2, §3 C4; RFC 2026-11-25-write-safety-core,
// invariants 4 to 6): a private note on one ticket, notifying agents named by
// id, through the core's `add_note` entry, the only write it can make.
//
//   - A factory: `addNote(entry)` takes the core's `add_note` entry and
//     nothing else (./index.ts hands it over). The entry's type is written
//     here, by shape, since no module under src/tools/ may import src/core/
//     (eslint.tool-imports.json); src/tools/context.ts, which passes the real
//     entry, is where the compiler checks the two agree.
//   - Inputs: `ticket_id`, `body`, `notify_agent_ids`. No `private` (the core
//     sets `private: true` itself, invariant 5) and no `notify_emails` (the
//     core looks each agent's work email up, invariant 4): the input is a
//     strict object, so either key, or any other it does not name, is refused
//     before any request. The ids are checked, de-duplicated, capped and
//     resolved by the core; any that does not resolve refuses the whole note.
//   - Output (owner, 2026-11-26): only allow-listed fields, never Freshdesk's
//     note answer as sent, which may echo the recipients (`notified_to`,
//     `to_emails`, ...): `ticket_id`, `note_id`, `private`, the agent ids
//     notified (de-duplicated, in order) and `api_calls_used` (the lookups and
//     the POST, retries included).
//   - No email ever reaches the output: a refusal's `errors[]` (Freshdesk's
//     field errors on a 400 may quote an address) has every address-shaped
//     run replaced before it is returned.
//   - One deadline, CALL_DEADLINE_MS from the call's start, for the lookups
//     and the POST; the client starts no write with under 10 s of it left.

import { z } from "zod";
import type { FreshdeskError } from "../../../client/errors.js";
import type { Conversation } from "../../../client/resources/tickets.js";
import type { Tool } from "../index.js";

/** The lookups and the POST end within this, together. */
const CALL_DEADLINE_MS = 30_000;

/** A note as the core's `add_note` entry takes it. */
export interface NoteRequest {
  id: number;
  body: string;
  notify?: readonly number[];
  deadline?: number;
}

export type NoteResult =
  | { ok: true; value: Conversation; attempts: number }
  | { ok: false; error: FreshdeskError; attempts: number };

/** The core's `add_note` entry (src/core/write-path.ts), by shape. */
export interface AddNoteEntry {
  readonly note: (note: NoteRequest) => Promise<NoteResult>;
}

const input = z.strictObject({
  ticket_id: z.number().int().positive(),
  body: z.string().min(1),
  notify_agent_ids: z.array(z.number().int().positive()).optional(),
});

/** Anything shaped like an address: a run with an `@` in it. */
const ADDRESS = /[^\s@]*@[^\s@]*/g;
const hide = (text: string) => text.replace(ADDRESS, "[address]");

/** The error with every address in its field errors replaced. */
function withoutAddresses(error: FreshdeskError): FreshdeskError {
  if (error.errors === undefined) return { ...error, message: hide(error.message) };
  return {
    ...error,
    message: hide(error.message),
    errors: error.errors.map((item) => ({
      ...item,
      ...(item.field === undefined ? {} : { field: hide(item.field) }),
      ...(item.code === undefined ? {} : { code: hide(item.code) }),
      message: hide(item.message),
    })),
  };
}

export function addNote(entry: AddNoteEntry): Tool<typeof input> {
  return {
    name: "add_note",
    description: [
      "Add a private note to one ticket, for colleagues: the note is always private, visible to agents only, and never reaches the requester.",
      "To ask agents for feedback, give their agent ids in notify_agent_ids (find them with list_agents, by name); Freshdesk emails each of them. At most 10 agents; an id with no active agent refuses the whole note, and nothing is sent.",
      "Freshdesk automations may act on the note, as for an agent's note.",
      "Returns the ticket id, the note id, whether it is private, the agent ids notified, and api_calls_used.",
    ].join(" "),
    input,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    cost: "1 API call for the note, plus 1 per agent to notify, within 30 s, plus one per retry after an error",
    customerText: false,
    async handler(args) {
      const ids = args.notify_agent_ids ?? [];
      const result = await entry.note({
        id: args.ticket_id,
        body: args.body,
        notify: ids,
        deadline: Date.now() + CALL_DEADLINE_MS,
      });
      if (!result.ok) return { ok: false, error: withoutAddresses(result.error) };
      return {
        ok: true,
        value: {
          ticket_id: args.ticket_id,
          note_id: result.value.id,
          private: result.value.private,
          notified_agent_ids: [...new Set(ids)],
          api_calls_used: result.attempts,
        },
      };
    },
  };
}
