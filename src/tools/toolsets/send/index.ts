// The `send` toolset's wiring (SPEC §8.2; RFC 2026-11-26-send-safety-core,
// OD-18, OD-25): the one module that hands each send tool its entry point.
//
//   - Each send tool is a factory taking its own entry, and only it:
//     `reply_to_ticket` gets `entries.reply_to_ticket`, never the entries
//     object, so no tool can reach another tool's entry.
//   - The entries come from src/tools/context.ts, the one caller, which takes
//     them from the write path it builds (present only when the team file
//     enables `send`, whether or not it enables `write`, OD-25).
//     `SendToolEntries` is their shape as the tools see it: no module here
//     imports src/core/.
//   - `factories` is a parameter so a test can see what each factory
//     receives (test/server.test.ts); the context passes none.
//   - `reply_to_ticket` (T-084) and `forward_ticket` (T-085).
//     `add_public_note` (T-088) is not built yet: its entry exists in the
//     core and is handed to no tool.

import type { Tool } from "../index.js";
import { type ForwardTicketEntry, forwardTicket } from "./forward-ticket.js";
import { type ReplyToTicketEntry, replyToTicket } from "./reply-to-ticket.js";

/** The core's send entries, as the send tools take them. */
export interface SendToolEntries {
  readonly reply_to_ticket: ReplyToTicketEntry;
  readonly forward_ticket: ForwardTicketEntry;
}

/** One factory per send tool, keyed by its entry point. */
export const SEND_FACTORIES = Object.freeze({
  reply_to_ticket: replyToTicket,
  forward_ticket: forwardTicket,
});

/** The `send` toolset's tools, each built from its own entry. */
export function sendTools(
  entries: SendToolEntries,
  factories: typeof SEND_FACTORIES = SEND_FACTORIES,
): readonly Tool[] {
  return Object.freeze([
    factories.reply_to_ticket(entries.reply_to_ticket),
    factories.forward_ticket(entries.forward_ticket),
  ]);
}
