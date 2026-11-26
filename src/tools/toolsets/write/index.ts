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
//   - T-072 to T-074 add `add_note`, `categorize_tickets` and
//     `hand_off_draft` here, each with its own entry.

import type { Tool } from "../index.js";
import { type UpdateTicketEntry, updateTicket } from "./update-ticket.js";

/** The core's write entries, as the write tools take them. */
export interface WriteToolEntries {
  readonly update_ticket: UpdateTicketEntry;
}

/** One factory per write tool, keyed by its entry point. */
export const WRITE_FACTORIES = Object.freeze({ update_ticket: updateTicket });

/** The `write` toolset's tools, each built from its own entry. */
export function writeTools(
  entries: WriteToolEntries,
  factories: typeof WRITE_FACTORIES = WRITE_FACTORIES,
): readonly Tool[] {
  return Object.freeze([factories.update_ticket(entries.update_ticket)]);
}
