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
//     field errors on a 400 may quote an address) has every word holding an
//     at sign replaced with `[address]` before it is returned
//     (`withoutAddresses`, src/tools/format.ts).
//   - A POST answered `server` or `network` (a 5xx, a timeout, an answer of
//     another shape) may have been applied: the error says the note may have
//     been written and to check the ticket before calling again.
//   - A note Freshdesk answers `private: false` (owner, 2026-11-26) is an
//     error, `server`, naming the `note_id` and saying the note is public and
//     must be checked: the core sent `private: true`, so such an answer means
//     something did not hold, and the caller must not read it as done.
//   - One deadline, CALL_DEADLINE_MS from the call's start, for the lookups
//     and the POST; the client starts no write with under 10 s of it left.

import { z } from "zod";
import type { FreshdeskError } from "../../../client/errors.js";
import type { Conversation } from "../../../client/resources/tickets.js";
import { withoutAddresses } from "../../format.js";
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

/** A note Freshdesk answered as public: an error naming the note, to be checked (owner, 2026-11-26). */
export function publicNote(noteId: number, after = ""): { ok: false; error: FreshdeskError } {
  return {
    ok: false,
    error: {
      code: "server",
      http_status: null,
      message: `Freshdesk answered that the note (note_id ${noteId}) is public, not private: the requester may see it, and it must be checked on the ticket now.${after}`,
      retryable: false,
    },
  };
}

/** A note's failure as the caller sees it: no address, and a sent POST's unknown outcome said. */
export function noteFailed(error: FreshdeskError): { ok: false; error: FreshdeskError } {
  const shown = withoutAddresses(error);
  if (shown.code !== "server" && shown.code !== "network") return { ok: false, error: shown };
  return {
    ok: false,
    error: {
      ...shown,
      message: `${shown.message} The note may have been written, and the agents emailed: check the ticket's notes before calling again.`,
    },
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
      if (!result.ok) return noteFailed(result.error);
      if (result.value.private !== true) return publicNote(result.value.id);
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
