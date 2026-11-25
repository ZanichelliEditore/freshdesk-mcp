// The allow sets (RFC 2026-11-25-write-safety-core, OD-2; AGENTS.md hard
// rule 1): which ticket fields each write entry point may set. Part of the
// safety core: a change to a set changes SPEC §8.2's contract and goes
// through `/rfc` first.
//
//   - One table, keyed by entry point, not by a name a tool passes: the core
//     looks up its own entry's set (T-068), so a tool cannot claim another's.
//   - `defaults` lists default fields by API name (as `/ticket_fields` names
//     them). A default field not listed is in no set, a field Freshdesk adds
//     later included: default fields fail closed.
//   - `custom: true` lets every custom field through, one an admin adds later
//     included (owner, 2026-11-25, RFC question 4). Custom fields fail open.
//   - `tags` is `update_ticket`'s add/remove of tags: not a `/ticket_fields`
//     field, so not `ticketInput`'s; its entry point reads it (T-068).
//   - No set holds requester, email, phone, name, company, source, subject,
//     description, product or a due date.
//   - The sets and their lists are frozen, and the same object comes back on
//     every lookup. An entry point not in the table throws a `TypeError`: a
//     programming error, never a set by default.
//
// `ticketInput` (src/schema/input.ts) takes a set as a plain `FieldSet` and
// does not import this module.

import type { FieldSet } from "../schema/input.js";

export type WriteEntry = "update_ticket" | "categorize_tickets" | "hand_off_draft" | "add_note";

export interface AllowSet extends FieldSet {
  /** Whether the entry point may add and remove tags. */
  readonly tags: boolean;
}

function set(defaults: string[], custom: boolean, tags: boolean): AllowSet {
  return Object.freeze({ defaults: Object.freeze(defaults), custom, tags });
}

const TABLE: Readonly<Record<WriteEntry, AllowSet>> = Object.freeze({
  update_ticket: set(["status", "priority", "ticket_type", "group", "agent"], true, true),
  categorize_tickets: set(["ticket_type"], true, false),
  hand_off_draft: set(["group", "agent"], false, false),
  add_note: set([], false, false),
});

/** The entry point's allow set. Throws `TypeError` for an entry point not in the table. */
export function allowSet(entry: WriteEntry): AllowSet {
  if (typeof entry !== "string" || !Object.hasOwn(TABLE, entry)) {
    throw new TypeError("No allow set for this write entry point.");
  }
  return TABLE[entry];
}
