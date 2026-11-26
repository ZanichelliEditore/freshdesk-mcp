// `hand_off_draft` (SPEC §8.2, §3 C6; RFC 2026-11-25-write-safety-core,
// invariants 4 to 6, OD-2; T-074): a draft reply another agent takes over, in
// one call: a private note headed DRAFT REPLY, then the ticket assigned to an
// agent and/or a group, through the core's `hand_off_draft` entry (its `note`
// and its `assign`), the only writes it can make.
//
//   - A factory: `handOffDraft(entry)` takes the core's `hand_off_draft` entry
//     and nothing else (./index.ts hands it over). The entry's type is written
//     here, by shape, since no module under src/tools/ may import src/core/
//     (eslint.tool-imports.json).
//   - Inputs (a strict object): `ticket_id`, `draft` (the reply text, put
//     after DRAFT_HEADER), `fields` (group and agent, by API name or label,
//     each value by name or id, as `update_ticket` takes them) and
//     `notify_agent_ids`. No `private`, no `body`, no `notify_emails`: the
//     core sets `private: true` and looks each agent's work email up.
//   - Before any write: with fields given, the schema is loaded and each key
//     matched as `ticketInput` matches it (API name exactly, or label folded);
//     a key naming no field, several fields, a field given twice, or a field
//     other than group and agent is refused, nothing sent, the note included.
//     The core's set for this entry is the authority and checks the PUT
//     again; this check only keeps a call the core would refuse from leaving
//     a note behind. Values are checked by the core at the PUT, after the
//     note (below).
//   - The note first, then the PUT (owner, 2026-11-26): an assignment with no
//     note hands off nothing. A refused note sends no PUT. A note Freshdesk
//     answers `private: false` is an error naming the `note_id`, saying it is
//     public and must be checked, and no PUT is sent. A PUT that fails or is
//     refused after the note is an error naming the note's id and the failed
//     assignment; it is not retried by the tool (the client retries a 429
//     only, which applies nothing) and the note is not removed.
//   - Nothing to assign (no fields, or an empty object): the note only, no
//     schema load and no PUT (the core refuses an empty ticket change).
//   - Output (owner, 2026-11-26): only allow-listed fields, never Freshdesk's
//     answers: `ticket_id`, `note_id`, `private`, the agent ids notified
//     (de-duplicated, in order), `assigned` and `api_calls_used` (the schema
//     load, the lookups, the POST and the PUT, retries included). Errors go
//     through add_note's `withoutAddresses`: no email ever reaches the output.
//   - One deadline, CALL_DEADLINE_MS from the call's start, for the lookups,
//     the POST and the PUT; the client starts no write with under 10 s of it
//     left.

import { z } from "zod";
import type { FieldError, FreshdeskError } from "../../../client/errors.js";
import type { Conversation, Ticket } from "../../../client/resources/tickets.js";
import type { Schema } from "../../../schema/index.js";
import { plainName } from "../../format.js";
import type { Tool } from "../index.js";
import { publicNote, withoutAddresses } from "./add-note.js";

/** The lookups, the POST and the PUT end within this, together. */
const CALL_DEADLINE_MS = 30_000;

/** What every draft note starts with, before the draft itself. */
export const DRAFT_HEADER =
  "DRAFT REPLY (not sent to the requester): review it, then send it as your reply.<br><br>";

/** A note as the core's `hand_off_draft` entry takes it. */
export interface DraftNote {
  id: number;
  body: string;
  notify?: readonly number[];
  deadline?: number;
}

/** An assignment as the core's `hand_off_draft` entry takes it. */
export interface Assignment {
  schema: Schema;
  id: number;
  fields: Record<string, unknown>;
  deadline?: number;
}

type Result<T> =
  { ok: true; value: T; attempts: number } | { ok: false; error: FreshdeskError; attempts: number };

/** The core's `hand_off_draft` entry (src/core/write-path.ts), by shape. */
export interface HandOffDraftEntry {
  readonly note: (note: DraftNote) => Promise<Result<Conversation>>;
  readonly assign: (change: Assignment) => Promise<Result<Ticket>>;
}

const input = z.strictObject({
  ticket_id: z.number().int().positive(),
  draft: z.string().min(1),
  fields: z.record(z.string(), z.unknown()).optional(),
  notify_agent_ids: z.array(z.number().int().positive()).optional(),
});

type Field = Schema["fields"][number];

const fold = (text: string) => text.normalize("NFC").trim().toLowerCase();

/** The core's `hand_off_draft` set, mirrored: group and agent. */
const writable = (field: Field) => field.default && ["group", "agent"].includes(field.name);

/** Each key's problem, as `ticketInput` would find it, before anything is sent. */
function fieldProblems(schema: Schema, fields: Record<string, unknown>): FieldError[] {
  const problems: FieldError[] = [];
  const seen = new Set<string>();
  for (const key of Object.keys(fields)) {
    const found = schema.fields.filter(
      (field) => field.name === key || fold(field.label) === fold(key),
    );
    const field = found[0];
    if (found.length > 1) {
      problems.push({
        field: key,
        code: "ambiguous_field",
        message: `${plainName(key)} names several fields: name one by its API name.`,
      });
    } else if (field === undefined) {
      problems.push({
        field: key,
        code: "unknown_field",
        message: `No ticket field is named or labelled ${plainName(key)}.`,
      });
    } else if (!writable(field)) {
      problems.push({
        field: key,
        code: "field_not_writable",
        message: `Field ${plainName(field.label)} cannot be set by this tool: it sets group and agent only (update_ticket sets the others).`,
      });
    } else if (seen.has(field.name)) {
      problems.push({
        field: key,
        code: "duplicate_field",
        message: `Field ${plainName(field.label)} is given more than once.`,
      });
    } else seen.add(field.name);
  }
  return problems;
}

/** The assignment's error, saying the note was written and the assignment was not made. */
function assignmentFailed(
  error: FreshdeskError,
  noteId: number,
): { ok: false; error: FreshdeskError } {
  const shown = withoutAddresses(error);
  return {
    ok: false,
    error: {
      ...shown,
      message: `The draft note was written (note_id ${noteId}, private), but the assignment failed and was not retried: ${shown.message}`,
    },
  };
}

export function handOffDraft(entry: HandOffDraftEntry): Tool<typeof input> {
  return {
    name: "hand_off_draft",
    description: [
      "Hand a draft reply over to another agent, in one call: first a private note on the ticket, headed DRAFT REPLY, holding the draft; then the ticket assigned to an agent and/or a group, in fields (group and agent only, by API name or label, each value by name or id as list_agents and list_groups give them).",
      "The note is always private, visible to agents only, and never reaches the requester; it is not Freshdesk's own reply draft.",
      "To email agents about it, give their agent ids in notify_agent_ids (find them with list_agents, by name), the agent you assign to included; at most 10, and an id with no active agent refuses the whole call, nothing sent.",
      "With no fields, only the note is written. If the assignment fails after the note was written, the error gives the note's id; the note stays and the assignment is not retried.",
      "Freshdesk automations may act on the note and the assignment, as for an agent's.",
      "Returns the ticket id, the note id, whether it is private, the agent ids notified, whether the ticket was assigned, and api_calls_used.",
    ].join(" "),
    input,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    cost: "1 API call for the note, plus 1 for the assignment when fields are given, plus 1 per agent to notify, within 30 s, plus one per retry after an error, plus at least 3 when fields are given and the ticket-field schema is not cached",
    customerText: false,
    async handler(args, context) {
      const deadline = Date.now() + CALL_DEADLINE_MS;
      const fields = args.fields ?? {};
      const ids = args.notify_agent_ids ?? [];
      const assigning = Object.keys(fields).length > 0;
      let calls = 0;
      let schema: Schema | undefined;
      if (assigning) {
        const loaded = await context.schema.get();
        if (!loaded.ok) return loaded;
        calls += loaded.attempts;
        const problems = fieldProblems(loaded.schema, fields);
        if (problems.length > 0) {
          return {
            ok: false,
            error: {
              code: "validation",
              http_status: null,
              message: "Some fields cannot be set by this tool; nothing was sent, no note either.",
              retryable: false,
              errors: problems.slice(0, 10),
            },
          };
        }
        schema = loaded.schema;
      }
      const note = await entry.note({
        id: args.ticket_id,
        body: `${DRAFT_HEADER}${args.draft}`,
        notify: ids,
        deadline,
      });
      calls += note.attempts;
      if (!note.ok) return { ok: false, error: withoutAddresses(note.error) };
      const noteId = note.value.id;
      if (note.value.private !== true) {
        return publicNote(noteId, assigning ? " The ticket was not assigned." : "");
      }
      if (schema !== undefined) {
        const assigned = await entry.assign({ schema, id: args.ticket_id, fields, deadline });
        calls += assigned.attempts;
        if (!assigned.ok) return assignmentFailed(assigned.error, noteId);
      }
      return {
        ok: true,
        value: {
          ticket_id: args.ticket_id,
          note_id: noteId,
          private: note.value.private,
          notified_agent_ids: [...new Set(ids)],
          assigned: schema !== undefined,
          api_calls_used: calls,
        },
      };
    },
  };
}
