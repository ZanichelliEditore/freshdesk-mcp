// The `send_id` (RFC 2026-11-26-send-safety-core, OD-20, OD-32, OD-33;
// T-083). Part of the safety core (AGENTS.md hard rule 1): a change to these
// rules goes through `/rfc` first. Only src/core/** may import this module
// (eslint.config.mjs, the sendId fence); the core's send entries (T-082) mint
// and check it over the body they will send.
//
//   - `src/tools/preview.ts`'s mechanism in another module (OD-32): an
//     HMAC-SHA-256 tag cut to 12 bytes under a 32-byte key from `randomBytes`,
//     made once per process in this module and read from nowhere else (an id
//     from another process, or from before a restart, checks against
//     nothing); valid 15 minutes from the mint time, the end included; the
//     mint time is the wall clock (`Date.now()`), with preview.ts's accepted
//     limitation (a clock set back stretches the 15 minutes by as much); a
//     mint time ahead of the clock is refused.
//   - Form: `<mint time>.<nonce>.<tag>`, exactly one tag, parsed whole by an
//     anchored pattern (OD-33): a canonical decimal mint time, a 16-character
//     base64url nonce (12 random bytes) and a 16-character tag. Anything
//     else, a tag appended or text around the id included, is refused.
//   - The tag covers the tool, the mint time, the nonce, the ticket id, the
//     body before escaping (OD-24) and the recipients per field (`to` and
//     `cc` apart), each address lower-cased and each field sorted (OD-20): the
//     order of a field does not matter, moving an address from `cc` to `to`
//     does, and a repeat counts.
//   - Single use (OD-33): a check that passes reserves the id's nonce in an
//     in-process set, with no `await` between the check and the reservation,
//     so a second check of the id, or of any id with its nonce, is refused.
//     The set is never pruned while the process lives (pruning by the wall
//     clock would let a clock set back pass a spent id again). The passing
//     check gives back `release`, the one way to free that reservation; the
//     entry calls it only when no request left the process (T-082).
//   - Every refusal is a `validation` error with `http_status: null`, and no
//     message quotes the id. The id is model-supplied: a value of any other
//     type is refused, not thrown.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FreshdeskError } from "../client/errors.js";

/** How long a `send_id` stays valid, from its mint time. */
export const SEND_ID_TTL_MS = 15 * 60 * 1000;

const TAG_LENGTH = 16;
const TAG_BYTES = 12;
const NONCE_LENGTH = 16;
const NONCE_BYTES = 12;
/** A 16-digit mint time, two dots, the nonce and the one tag. */
const SEND_ID_MAX_LENGTH = 16 + 1 + NONCE_LENGTH + 1 + TAG_LENGTH;
const ID_FORM = new RegExp(
  `^(0|[1-9][0-9]{0,15})\\.([A-Za-z0-9_-]{${NONCE_LENGTH}})\\.([A-Za-z0-9_-]{${TAG_LENGTH}})$`,
);

/** Made once per process: an id from another process, or from before a restart, checks against nothing. */
const KEY = randomBytes(32);
/** The nonces of the ids a check passed, each with the reservation that holds it. Never pruned. */
const SPENT = new Map<string, object>();

/** The addresses a send goes to, per field; a reply has no `to`, a public note neither. */
export interface SendRecipients {
  to: readonly string[];
  cc: readonly string[];
}

export interface MintedSendId {
  send_id: string;
  expires_at: string;
}

export type SendIdCheck = { ok: true; release: () => void } | { ok: false; error: FreshdeskError };

/** A `send_id` for this send, minted now. */
export function mintSendId(
  tool: string,
  ticketId: number,
  body: string,
  recipients: SendRecipients,
): MintedSendId {
  const time = Date.now();
  const nonce = randomBytes(NONCE_BYTES).toString("base64url");
  return {
    send_id: `${time}.${nonce}.${tag(tool, time, nonce, ticketId, body, recipients)}`,
    expires_at: new Date(time + SEND_ID_TTL_MS).toISOString(),
  };
}

/**
 * Whether `sendId` was minted by this process for exactly this tool, ticket,
 * body and recipients, at most SEND_ID_TTL_MS ago, and not used before. A
 * pass reserves the id: no other check of it passes until `release` is called.
 */
export function checkSendId(
  tool: string,
  sendId: unknown,
  ticketId: number,
  body: string,
  recipients: SendRecipients,
): SendIdCheck {
  if (typeof sendId !== "string" || sendId.length > SEND_ID_MAX_LENGTH) {
    return refuse("the send_id is not one this server gave");
  }
  const match = ID_FORM.exec(sendId);
  const time = Number(match?.[1]);
  if (match === null || !Number.isSafeInteger(time)) {
    return refuse("the send_id is not one this server gave");
  }
  const nonce = match[2]!;
  const expected = Buffer.from(tag(tool, time, nonce, ticketId, body, recipients));
  if (!timingSafeEqual(Buffer.from(match[3]!), expected)) {
    return refuse(
      "the send_id does not match this tool, ticket, text and recipients (something changed since it was given, or the server restarted)",
    );
  }
  const age = Date.now() - time;
  if (age < 0) return refuse("the send_id's mint time is ahead of this server's clock");
  if (age > SEND_ID_TTL_MS) return refuse("the send_id is older than 15 minutes");
  if (SPENT.has(nonce))
    return refuse(
      "this send_id was already used, and the earlier call may have sent; check the ticket before sending again",
    );
  const reservation = {};
  SPENT.set(nonce, reservation);
  return {
    ok: true,
    release: () => {
      if (SPENT.get(nonce) === reservation) SPENT.delete(nonce);
    },
  };
}

function tag(
  tool: string,
  time: number,
  nonce: string,
  ticketId: number,
  body: string,
  recipients: SendRecipients,
): string {
  const text = JSON.stringify([
    tool,
    time,
    nonce,
    ticketId,
    body,
    canonicalField(recipients.to),
    canonicalField(recipients.cc),
  ]);
  return createHmac("sha256", KEY)
    .update(text)
    .digest()
    .subarray(0, TAG_BYTES)
    .toString("base64url");
}

/** A field's addresses lower-cased and sorted: its order does not matter, a repeat does. */
function canonicalField(addresses: readonly string[]): string[] {
  return Array.from(addresses, (address) => address.toLowerCase()).sort();
}

function refuse(why: string): { ok: false; error: FreshdeskError } {
  return {
    ok: false,
    error: {
      code: "validation",
      http_status: null,
      message: `Not sent: ${why}. Call again without confirm to get a new send_id.`,
      retryable: false,
    },
  };
}
