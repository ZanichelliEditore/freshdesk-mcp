// The `write` toolset's wiring (SPEC §8.2; RFC 2026-11-25-write-safety-core,
// invariant 2): the one module that hands each write tool its entry point.
//
//   - Each write tool is a factory taking its own entry, and only it:
//     `update_ticket` gets `entries.update_ticket`, never the entries object,
//     so no tool can reach another tool's entry or allow set.
//   - The entries come from src/tools/context.ts, the one caller, which takes
//     them from the write path it builds (present only when the team file
//     enables `write`, invariant 3). `WriteToolEntries` is their shape as the
//     tools see it: no module here imports src/core/.
//   - `factories` is a parameter so a test can see what each factory
//     receives (test/server.test.ts); the context passes none.
//   - `add_note` (T-072) gets `entries.add_note`, `categorize_tickets`
//     (T-073) `entries.categorize_tickets`. T-074 adds `hand_off_draft` here,
//     with its own entry.

import type { Tool } from "../index.js";
import { type AddNoteEntry, addNote } from "./add-note.js";
import { type CategorizeTicketsEntry, categorizeTickets } from "./categorize-tickets.js";
import { type UpdateTicketEntry, updateTicket } from "./update-ticket.js";

/** The core's write entries, as the write tools take them. */
export interface WriteToolEntries {
  readonly update_ticket: UpdateTicketEntry;
  readonly add_note: AddNoteEntry;
  readonly categorize_tickets: CategorizeTicketsEntry;
}

/** One factory per write tool, keyed by its entry point. */
export const WRITE_FACTORIES = Object.freeze({
  update_ticket: updateTicket,
  add_note: addNote,
  categorize_tickets: categorizeTickets,
});

/** The `write` toolset's tools, each built from its own entry. */
export function writeTools(
  entries: WriteToolEntries,
  factories: typeof WRITE_FACTORIES = WRITE_FACTORIES,
): readonly Tool[] {
  return Object.freeze([
    factories.update_ticket(entries.update_ticket),
    factories.add_note(entries.add_note),
    factories.categorize_tickets(entries.categorize_tickets),
  ]);
}
