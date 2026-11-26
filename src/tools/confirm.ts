// SPEC §9's "Not sent" result (RFC 2026-11-26-send-safety-core, OD-19,
// OD-21, OD-27, threat 1; T-083): what a send tool returns when its entry was
// called without `confirm`. It builds text from what the entry returns and
// decides nothing: the confirm and the `send_id` are checked in the core
// (OD-19), and this module imports nothing from src/core/.
//
//   - The ticket id comes first, with a request to check it is the ticket the
//     user means: ticket text can steer the id, and so the requester (threat 1).
//   - The body is the text before escaping, as the entry returns it (OD-24):
//     the user reads what the customer will read.
//   - The recipients are the caller's; the requester is named as "the
//     ticket's requester", never by address (OD-27). A reply and a public note
//     carry OD-21's sentence on the ticket's existing CC addresses.

/** The SPEC §9 sentence, word for word. */
const NOT_SENT =
  "Not sent. Show the user the exact text and recipients; call again with `confirm: true` and this `send_id` only after they approve.";
const EXISTING_CC =
  "Freshdesk may also copy the ticket's existing CC addresses, which this tool does not check.";
const REQUESTER = "the ticket's requester";

export type SendTool = "reply_to_ticket" | "forward_ticket" | "add_public_note";

/** What the entry returned for a call without `confirm`. */
export interface NotSentInput {
  tool: SendTool;
  ticket_id: number;
  /** The body before escaping. */
  body: string;
  /** The caller's `to` (a forward); empty for a reply and a public note. */
  to: readonly string[];
  /** The caller's `cc`; empty for a public note. */
  cc: readonly string[];
  send_id: string;
  expires_at: string;
}

export interface NotSentResult {
  ticket_id: number;
  sent: false;
  note: string;
  body: string;
  recipients: { to: readonly string[] | typeof REQUESTER; cc: readonly string[] };
  send_id: string;
  expires_at: string;
}

/** The "Not sent" result for `input`. */
export function notSent(input: NotSentInput): NotSentResult {
  const toRequester = input.tool !== "forward_ticket";
  const sentences = [
    `Ticket ${input.ticket_id}: check with the user that ticket ${input.ticket_id} is the ticket they mean.`,
    NOT_SENT,
  ];
  if (toRequester) sentences.push(EXISTING_CC);
  return {
    ticket_id: input.ticket_id,
    sent: false,
    note: sentences.join(" "),
    body: input.body,
    recipients: { to: toRequester ? REQUESTER : [...input.to], cc: [...input.cc] },
    send_id: input.send_id,
    expires_at: input.expires_at,
  };
}
