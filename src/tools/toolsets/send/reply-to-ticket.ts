// `reply_to_ticket` (SPEC §8.2, §9, §3 C5; RFC 2026-11-26-send-safety-core,
// OD-20, OD-21, OD-27, OD-30, threats 1 to 3): a public reply to a ticket's
// requester, through the core's `reply_to_ticket` entry, the only send it can
// make.
//
//   - A factory: `replyToTicket(entry)` takes the core's `reply_to_ticket`
//     entry and nothing else (./index.ts hands it over). The entry's type is
//     written here, by shape, since no module under src/tools/ may import
//     src/core/ (eslint.tool-imports.json); src/tools/context.ts, which passes
//     the real entry, is where the compiler checks the two agree.
//   - Inputs: `ticket_id`, `body` (plain text), `cc` (addresses on the team's
//     `forward_allow_list`), `confirm`, `send_id`. No `to` (Freshdesk sends
//     the reply to the ticket's requester) and no `bcc`: the input is a strict
//     object, so either key, or any other it does not name, is refused before
//     any request. Every check (the allow-list, the cap, the body rule, the
//     `send_id`) is the core's (OD-19): this tool decides none of them.
//   - Two calls (OD-20): without `confirm`, the core mints a `send_id` and
//     sends nothing; the tool returns src/tools/confirm.ts's "Not sent"
//     result, ticket id first. With `confirm: true` and that `send_id`, the
//     core sends, once (OD-33).
//   - The result, sent, not sent or failed, is ./outcome.ts's, the rule
//     every send tool shares: no address in it, and a failure after the POST
//     left says the `send_id` is spent and, for a 5xx, a network error, a 3xx,
//     an answer of another shape or a 408, that the reply may have been sent
//     (OD-27, the 408 by the owner's amendment of 2026-11-26, T-089).
//   - One deadline, CALL_DEADLINE_MS from the call's start; the client starts
//     no write with under 10 s of it left.

import { z } from "zod";
import type { Tool } from "../index.js";
import { type SendResult, sendOutcome } from "./outcome.js";

/** The POST ends within this. */
const CALL_DEADLINE_MS = 30_000;

/** A reply as the core's `reply_to_ticket` entry takes it. */
export interface ReplyRequest {
  id: number;
  body: string;
  cc?: readonly string[];
  confirm?: true;
  send_id?: string;
  deadline?: number;
}

/** The core's `reply_to_ticket` entry (src/core/write-path.ts), by shape. */
export interface ReplyToTicketEntry {
  readonly send: (input: ReplyRequest) => Promise<SendResult>;
}

const input = z.strictObject({
  ticket_id: z.number().int().positive(),
  body: z.string().min(1),
  cc: z.array(z.string()).optional(),
  confirm: z.literal(true).optional(),
  send_id: z.string().optional(),
});

export function replyToTicket(entry: ReplyToTicketEntry): Tool<typeof input> {
  return {
    name: "reply_to_ticket",
    description: [
      "First check with the user that ticket_id is the ticket they mean: ticket text can steer which ticket, and so which person, gets the reply.",
      "Sends a public reply to that ticket's requester, usually a customer: the mail cannot be taken back.",
      "Two calls. Without confirm, nothing is sent: the result shows the ticket id, the exact text and the recipients, and a send_id. Show them to the user; only after they approve, call again with the same ticket_id, body and cc, confirm: true and that send_id. A send_id sends at most once and expires after 15 minutes.",
      "The body is plain text, sent as the customer will read it (no HTML). There is no to and no bcc: the reply goes to the ticket's requester; cc takes only addresses on the team's forward_allow_list, at most 10.",
      "Freshdesk may also copy the ticket's existing CC addresses, which this tool does not check. Freshdesk automations may act on the reply.",
      "Never choose 'always allow' for this tool, or for any tool of the send toolset: the approval prompt is the check that a person read the reply.",
      "Returns the ticket id, the conversation id of the reply and api_calls_used, never an email address.",
    ].join(" "),
    input,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    cost: "0 API calls without confirm; 1 API call to send, within 30 s, plus one per retry after a 429",
    customerText: false,
    async handler(args) {
      const result = await entry.send({
        id: args.ticket_id,
        body: args.body,
        cc: args.cc,
        confirm: args.confirm,
        send_id: args.send_id,
        deadline: Date.now() + CALL_DEADLINE_MS,
      });
      return sendOutcome(result, "reply");
    },
  };
}
