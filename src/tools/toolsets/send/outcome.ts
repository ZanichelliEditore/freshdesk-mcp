// What a send tool returns for its entry's answer (SPEC §9; RFC
// 2026-11-26-send-safety-core, OD-20, OD-27, OD-33, and OD-27's amendment of
// 2026-11-26, T-089), one rule for every send tool: `reply_to_ticket`
// (T-084), `forward_ticket` (T-085) and, when built, `add_public_note`.
//
//   - The entry's result is written here by shape, since no module under
//     src/tools/ may import src/core/ (eslint.tool-imports.json);
//     src/tools/context.ts, which passes the real entries, is where the
//     compiler checks the two agree.
//   - Not sent: src/tools/confirm.ts's "Not sent" result, ticket id first,
//     and `api_calls_used: 0`.
//   - Sent (OD-27): `ticket_id`, `conversation_id`, `api_calls_used`, never
//     an address, whatever Freshdesk's answer holds (the core returns only
//     the conversation id).
//   - A failure: every word holding an at sign in its text is replaced
//     (`withoutAddresses`, src/tools/format.ts; OD-27). With no attempt
//     dispatched nothing left the process, the core freed the `send_id`, and
//     the error is passed on as it is. With one dispatched the core keeps the
//     `send_id` spent (OD-33), so the error is `retryable: false`, carries no
//     `retry_after_s`, and says to start over without `confirm`; a `server`
//     or `network` error (a 5xx, a timeout, a 3xx, an answer of another
//     shape) or a 408 is also `may_have_been_sent: true` and says to check
//     the ticket's conversation before sending again. A 408 reads "timed
//     out", not "refused". A 409, as any other 4xx, is Freshdesk's refusal:
//     not `may_have_been_sent`.

import type { FreshdeskError } from "../../../client/errors.js";
import { notSent, type SendTool } from "../../confirm.js";
import { withoutAddresses } from "../../format.js";
import type { ToolResult } from "../index.js";

/** What the core's send entry returns for a call without `confirm`. */
export interface SendPreview {
  tool: SendTool;
  ticket_id: number;
  body: string;
  to: readonly string[];
  cc: readonly string[];
  send_id: string;
  expires_at: string;
}

/** What the core's send entry returns. */
export type SendResult =
  | { ok: true; sent: false; preview: SendPreview; attempts: 0 }
  | { ok: true; sent: true; ticket_id: number; conversation_id: number; attempts: number }
  | { ok: false; error: FreshdeskError; attempts: number };

/** What was sent, as a failure's message names it. */
export type SendKind = "reply" | "forward";

/** A send's failure as the caller sees it: no address, and a dispatched POST's unknown outcome said. */
export function sendFailed(
  error: FreshdeskError,
  attempts: number,
  kind: SendKind,
): { ok: false; error: FreshdeskError & { may_have_been_sent?: true } } {
  const shown = withoutAddresses(error);
  if (attempts === 0) return { ok: false, error: shown };
  const rest: FreshdeskError = { ...shown };
  delete rest.retry_after_s;
  const again =
    "This send_id is spent: to send again, start over without confirm, which gives a new send_id.";
  const timedOut = rest.http_status === 408;
  if (!(timedOut || rest.code === "server" || rest.code === "network")) {
    return {
      ok: false,
      error: { ...rest, retryable: false, message: `${rest.message} ${again}` },
    };
  }
  const said = timedOut ? "Freshdesk timed out the request (HTTP 408)." : rest.message;
  return {
    ok: false,
    error: {
      ...rest,
      retryable: false,
      may_have_been_sent: true,
      message: `${said} The ${kind} may have been sent (may_have_been_sent): check the ticket's conversation before sending again. ${again}`,
    },
  };
}

/** The tool's result for its entry's answer. */
export function sendOutcome(result: SendResult, kind: SendKind): ToolResult {
  if (!result.ok) return sendFailed(result.error, result.attempts, kind);
  if (!result.sent) {
    const { preview } = result;
    return {
      ok: true,
      value: {
        ...notSent({
          tool: preview.tool,
          ticket_id: preview.ticket_id,
          body: preview.body,
          to: preview.to,
          cc: preview.cc,
          send_id: preview.send_id,
          expires_at: preview.expires_at,
        }),
        api_calls_used: 0,
      },
    };
  }
  return {
    ok: true,
    value: {
      sent: true,
      ticket_id: result.ticket_id,
      conversation_id: result.conversation_id,
      api_calls_used: result.attempts,
    },
  };
}
