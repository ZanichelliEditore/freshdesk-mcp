// Stateless preview id (SPEC §9; PLAN OD-13, OD-15): what a bulk write tool
// (`categorize_tickets`, T-073) returns with its preview and checks at confirm,
// with no server state.
//
//   - Form: `<mint time>.<nonce>.<tag><tag>…`. The mint time is milliseconds
//     since the epoch, a canonical decimal; the nonce is 12 random bytes,
//     base64url (16 characters); each tag is 16 base64url characters, one per
//     previewed ticket.
//   - A tag is HMAC-SHA-256, cut to its first 12 bytes, under a key of 32
//     random bytes made once per process (a preview dies on restart), over the
//     tool name, the mint time, the nonce, the ticket id and the ticket's
//     fields (JSON with keys sorted, `canonical` in list.ts). The mint time
//     and nonce are inside every tag, so an edited time, or tags spliced from
//     two previews, check against nothing.
//   - One tag per ticket is what lets a confirm name any subset of the
//     previewed tickets, each with its previewed fields (OD-13): every
//     confirm item must match one of the id's tags (compared with
//     `timingSafeEqual`); the id's other tags are not looked at. A ticket
//     added, a field changed, dropped or added, another tool's id, an edited
//     id or another process's id matches no tag and is refused.
//   - Valid 15 minutes from the mint time, the end included; a mint time in
//     the future (the clock went back) is refused. The tickets are not read
//     again at confirm (OD-15). With no server state the check cannot tell
//     which tickets a confirm already wrote: a repeat confirm within the
//     15 minutes checks again and re-sends identical values.
//   - The cap, PREVIEW_CAP tickets, is refused at mint and at check, never
//     truncated; no items and a ticket named twice are refused too.
//   - Every refusal is a `validation` error with `http_status: null`, and no
//     message quotes the id. The items and the id are model-supplied: a value
//     of any other shape (a cast) is refused, not thrown.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FreshdeskError } from "../client/errors.js";
import { canonical } from "./list.js";

/** Most tickets one preview or confirm names (SPEC §8.2). */
export const PREVIEW_CAP = 50;
/** How long a preview id stays valid, from its mint time. */
export const PREVIEW_TTL_MS = 15 * 60 * 1000;

const TAG_LENGTH = 16;
const TAG_BYTES = 12;
const NONCE_BYTES = 12;
/** A 16-digit mint time, the dots, the nonce and one tag per ticket at the cap. */
export const PREVIEW_ID_MAX_LENGTH = 16 + 1 + TAG_LENGTH + 1 + PREVIEW_CAP * TAG_LENGTH;
const ID_FORM = new RegExp(
  `^(0|[1-9][0-9]{0,15})\\.([A-Za-z0-9_-]{${TAG_LENGTH}})\\.((?:[A-Za-z0-9_-]{${TAG_LENGTH}}){1,${PREVIEW_CAP}})$`,
);

/** Made once per process: an id from another process, or from before a restart, checks against nothing. */
const KEY = randomBytes(32);

/** One previewed ticket and the fields the tool will set on it. */
export interface PreviewItem {
  ticket_id: number;
  fields: Readonly<Record<string, unknown>>;
}

export type MintResult = { ok: true; preview_id: string } | { ok: false; error: FreshdeskError };
export type CheckResult = { ok: true } | { ok: false; error: FreshdeskError };

interface Entry {
  ticketId: number;
  fieldsText: string;
}

/** A preview id for `items` under `tool`, minted now. */
export function mintPreviewId(tool: string, items: readonly PreviewItem[]): MintResult {
  const read = readItems(items, "Not previewed");
  if (!read.ok) return read;
  const time = Date.now();
  const nonce = randomBytes(NONCE_BYTES).toString("base64url");
  const tags = read.entries.map((entry) => tag(tool, time, nonce, entry)).join("");
  return { ok: true, preview_id: `${time}.${nonce}.${tags}` };
}

/**
 * Whether `previewId` covers every one of `items` under `tool`: each ticket
 * previewed with exactly these fields, by this process, at most
 * PREVIEW_TTL_MS ago. `items` may be any subset of the previewed tickets.
 */
export function checkPreviewId(
  tool: string,
  previewId: unknown,
  items: readonly PreviewItem[],
): CheckResult {
  const read = readItems(items, "Not applied");
  if (!read.ok) return read;
  if (typeof previewId !== "string" || previewId.length > PREVIEW_ID_MAX_LENGTH) {
    return refuse("Not applied", "the preview_id is not one this server gave");
  }
  const match = ID_FORM.exec(previewId);
  const time = Number(match?.[1]);
  if (match === null || !Number.isSafeInteger(time)) {
    return refuse("Not applied", "the preview_id is not one this server gave");
  }
  const nonce = match[2]!;
  const given = match[3]!;
  const tags: Buffer[] = [];
  for (let at = 0; at < given.length; at += TAG_LENGTH) {
    tags.push(Buffer.from(given.slice(at, at + TAG_LENGTH)));
  }
  for (const entry of read.entries) {
    const expected = Buffer.from(tag(tool, time, nonce, entry));
    let found = false;
    for (const candidate of tags) {
      if (timingSafeEqual(candidate, expected)) found = true;
    }
    if (!found) {
      return refuse(
        "Not applied",
        "the preview_id does not cover these tickets with these fields (a ticket added or a field changed since the preview, another tool's preview, or a server restart)",
      );
    }
  }
  const age = Date.now() - time;
  if (age < 0) return refuse("Not applied", "the preview_id is not one this server gave");
  if (age > PREVIEW_TTL_MS) {
    return refuse("Not applied", "the preview_id is older than 15 minutes");
  }
  return { ok: true };
}

function tag(tool: string, time: number, nonce: string, entry: Entry): string {
  const text = `[${JSON.stringify(tool)},${time},${JSON.stringify(nonce)},${entry.ticketId},${entry.fieldsText}]`;
  return createHmac("sha256", KEY)
    .update(text)
    .digest()
    .subarray(0, TAG_BYTES)
    .toString("base64url");
}

function readItems(
  items: unknown,
  prefix: string,
): { ok: true; entries: Entry[] } | { ok: false; error: FreshdeskError } {
  if (!Array.isArray(items)) return refuse(prefix, "the tickets are not a list");
  if (items.length === 0) return refuse(prefix, "no tickets are named");
  if (items.length > PREVIEW_CAP) {
    return refuse(prefix, `${items.length} tickets are over the cap of ${PREVIEW_CAP} a call`);
  }
  const seen = new Set<number>();
  const entries: Entry[] = [];
  for (const item of items as unknown[]) {
    if (!isPlainObject(item)) return refuse(prefix, "a ticket is not an object");
    const ticketId = item.ticket_id;
    if (!Number.isSafeInteger(ticketId) || (ticketId as number) < 1) {
      return refuse(prefix, "a ticket id is not a whole number, 1 or more");
    }
    if (seen.has(ticketId as number)) return refuse(prefix, "a ticket is named twice");
    seen.add(ticketId as number);
    if (!isPlainObject(item.fields)) return refuse(prefix, "a ticket's fields are not an object");
    let fieldsText: string;
    try {
      fieldsText = canonical(item.fields);
    } catch {
      return refuse(prefix, "a ticket's fields are not JSON");
    }
    entries.push({ ticketId: ticketId as number, fieldsText });
  }
  return { ok: true, entries };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function refuse(prefix: string, why: string): { ok: false; error: FreshdeskError } {
  return {
    ok: false,
    error: {
      code: "validation",
      http_status: null,
      message:
        prefix === "Not applied"
          ? `${prefix}: ${why}. Call again without confirm to preview again.`
          : `${prefix}: ${why}.`,
      retryable: false,
    },
  };
}
