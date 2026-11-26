// `categorize_tickets` (SPEC §8.2, §9, C1, C8; PLAN OD-13, OD-15; T-073):
// set category fields on a list of `{ticket_id, fields}`, preview first, then
// confirm, through the core's `categorize_tickets` entry, the only write it
// can make.
//
//   - A factory: `categorizeTickets(entry)` takes the core's
//     `categorize_tickets` entry and nothing else (./index.ts hands it over).
//     The entry's type is written here, by shape, since no module under
//     src/tools/ may import src/core/ (eslint.tool-imports.json).
//   - Fields: the ticket type and custom fields, by API name or label, each
//     key matched as `ticketInput` matches it (API name exactly, or label
//     trimmed, NFC, any case; a key naming several fields is ambiguous). The
//     core's set for this entry is the authority and checks every write; the
//     preview mirrors it (`writable`) so a table the user approves never
//     shows a change the core would refuse as `field_not_writable`: status,
//     priority, group, agent and every other default field are refused,
//     nothing sent; so is a field named twice for one ticket (two keys, one
//     field), which the core would refuse. Values are not checked at the preview: the core checks
//     them at the confirm, and a bad one refuses that ticket only.
//   - Items: 1 to PREVIEW_CAP (50), each ticket once, each with at least one
//     field, checked before any request (the schema's load included); over
//     the cap is refused, never truncated. An item is a strict object: a key
//     other than `ticket_id` and `fields` is refused.
//   - Preview (no `confirm`): the schema, then one GET per ticket, in order,
//     `expensive` (paced, refused below the reserve); no other method. Per
//     ticket, each field's current value (the context's `ticketOutput`, so a
//     field the team hides shows `null`) and the new one, both through
//     `fieldValue`. A read the limiter refuses or the call's deadline ends
//     (`rate_limited` with no HTTP status, or `network` the client marks
//     `reachedDeadline`) cuts the preview: that ticket and the rest are
//     `not_read`. Any other failed read lists that ticket with its code and
//     goes on. The `preview_id` (src/tools/preview.ts) covers only the
//     tickets read; with none read there is none.
//   - Confirm (`confirm: true` and the `preview_id`): checked first, no
//     request before (OD-15: the tickets are not read again). The writes use
//     only the items the check gives back (docs/improvements.md 70be151,
//     f64d743): each `ticket_id` and `fields` as the tags were checked on,
//     read once; never the call's items again. Then one PUT per ticket, in
//     the confirm's order, each through the entry. A result per ticket:
//     `written`; `refused` with the error (Freshdesk's answer, or the core's
//     field errors); `may_have_been_applied` with the error when the PUT was
//     sent and came back `network` or `server` (a timeout, a 5xx, a 3xx, a
//     2xx of another shape: the core does not retry those since they may
//     have landed), counted apart from `refused`; `not_attempted`. Every
//     confirmed item is in exactly one count. A write refused `rate_limited` (the
//     deadline's 10 s rule, the limiter, or Freshdesk's 429, none of which
//     applies it) cuts the run: that ticket and every one after it are not
//     attempted (OD-13, owner 2026-11-25), and a later confirm with the same
//     `preview_id` naming only them writes them (any subset checks).
//   - Per-ticket errors carry Freshdesk's text as the registry treats a
//     top-level error's: each `errors[]` message wrapped as untrusted, each
//     field and code through `plainName`.
//   - One deadline, CALL_DEADLINE_MS from the call's start, for the reads or
//     the writes; the client starts no write with under 10 s of it left.
//     `api_calls_used`: every request sent, retries included, and the
//     schema's load when this call started it.

import { z } from "zod";
import type { FieldError, FreshdeskError } from "../../../client/errors.js";
import { getTicket, type Ticket } from "../../../client/resources/tickets.js";
import type { Schema } from "../../../schema/index.js";
import { fieldValue, plainName, untrusted } from "../../format.js";
import { checkPreviewId, mintPreviewId, PREVIEW_CAP, type PreviewItem } from "../../preview.js";
import type { Tool } from "../index.js";

const TOOL = "categorize_tickets";

/** The reads, or the writes, end within this, together. */
const CALL_DEADLINE_MS = 30_000;

/** Field problems a preview lists at most. */
const MAX_PROBLEMS = 10;

/** A change as the core's `categorize_tickets` entry takes it. */
export interface CategorizeChange {
  schema: Schema;
  id: number;
  fields: Record<string, unknown>;
  deadline?: number;
}

export type CategorizeResult =
  | { ok: true; value: Ticket; attempts: number }
  | { ok: false; error: FreshdeskError; attempts: number };

/** The core's `categorize_tickets` entry (src/core/write-path.ts), by shape. */
export interface CategorizeTicketsEntry {
  readonly update: (change: CategorizeChange) => Promise<CategorizeResult>;
}

type Field = Schema["fields"][number];
type Context = Parameters<Tool["handler"]>[1];

const item = z.strictObject({
  ticket_id: z.number().int().positive(),
  fields: z.record(z.string(), z.unknown()),
});

const input = z.strictObject({
  items: z.array(item),
  confirm: z.boolean().optional(),
  preview_id: z.string().optional(),
});

type Item = z.output<typeof item>;

function refusal(message: string): { ok: false; error: FreshdeskError } {
  return { ok: false, error: { code: "validation", http_status: null, message, retryable: false } };
}

const fold = (text: string) => text.normalize("NFC").trim().toLowerCase();

/** The core's `categorize_tickets` set, mirrored for the preview: the type and custom fields. */
const writable = (field: Field) => !field.default || field.name === "ticket_type";

type Found = { ok: true; field: Field } | { ok: false; problem: FieldError };

/** The field `key` names, as `ticketInput` finds it, or why it cannot be set here. */
function findField(schema: Schema, key: string): Found {
  const found = schema.fields.filter(
    (field) => field.name === key || fold(field.label) === fold(key),
  );
  const problem = (code: string, message: string): Found => ({
    ok: false,
    problem: { field: key, code, message },
  });
  if (found.length > 1) {
    return problem(
      "ambiguous_field",
      `${plainName(key)} names several fields (${found.map((field) => plainName(field.name)).join(", ")}): name one by its API name.`,
    );
  }
  const field = found[0];
  if (field === undefined) {
    return problem("unknown_field", `No ticket field is named or labelled ${plainName(key)}.`);
  }
  if (!writable(field)) {
    return problem(
      "field_not_writable",
      `Field ${plainName(field.label)} cannot be set by this tool: it sets the ticket type and custom fields only (update_ticket sets status, priority, group and agent).`,
    );
  }
  return { ok: true, field };
}

/** The items' own problems, before any request: count, a ticket twice, a ticket with no field. */
function itemsRefusal(items: readonly Item[], confirm: boolean) {
  const not = confirm ? "Not applied" : "Not previewed";
  if (items.length === 0) return refusal(`${not}: no tickets are named.`);
  if (items.length > PREVIEW_CAP) {
    return refusal(
      `${not}: ${items.length} tickets are over the cap of ${PREVIEW_CAP} a call. Split them into calls of ${PREVIEW_CAP} or fewer.`,
    );
  }
  const ids = new Set(items.map((one) => one.ticket_id));
  if (ids.size < items.length) return refusal(`${not}: a ticket is named twice.`);
  const empty = items.find((one) => Object.keys(one.fields).length === 0);
  if (empty !== undefined) return refusal(`${not}: ticket ${empty.ticket_id} has no field to set.`);
  return undefined;
}

/** A read that cuts the preview rather than failing that ticket (count-tickets.ts's `isCut`). */
function isCut(error: FreshdeskError, context: Context): boolean {
  return (
    (error.code === "rate_limited" && error.http_status === null) ||
    (error.code === "network" && context.http.reachedDeadline(error))
  );
}

/** The field's current value in the ticket, as the read tools show it; `null` when absent or hidden. */
function current(context: Context, schema: Schema, field: Field, ticket: Ticket): unknown {
  const values = Object.values(context.ticketOutput({ ...schema, fields: [field] }, ticket));
  return values.length === 0 ? null : fieldValue(field, values[0]);
}

/** A per-ticket error, Freshdesk's text treated as the registry treats a top-level error's. */
function shown(error: FreshdeskError): FreshdeskError {
  if (error.errors === undefined) return error;
  return {
    ...error,
    errors: error.errors.map((one) => ({
      ...(one.field === undefined ? {} : { field: plainName(one.field) }),
      ...(one.code === undefined ? {} : { code: plainName(one.code) }),
      message: untrusted(one.message),
    })),
  };
}

async function preview(items: readonly Item[], context: Context, deadline: number) {
  const loaded = await context.schema.get();
  if (!loaded.ok) return loaded;
  const { schema } = loaded;
  // One problem per distinct key: the same key names the same field on every ticket.
  const problems = new Map<string, FieldError>();
  const resolved = items.map((one) => {
    const fields: [string, Field][] = [];
    for (const key of Object.keys(one.fields)) {
      const found = findField(schema, key);
      if (!found.ok) problems.set(key, found.problem);
      else if (fields.some(([, field]) => field.name === found.field.name)) {
        // The core refuses a field given twice (`ticketInput`): never in an approved table.
        problems.set(key, {
          field: key,
          code: "duplicate_field",
          message: `Field ${plainName(found.field.label)} is given more than once for one ticket.`,
        });
      } else fields.push([key, found.field]);
    }
    return fields;
  });
  if (problems.size > 0) {
    const hidden = problems.size - MAX_PROBLEMS;
    return {
      ok: false as const,
      error: {
        code: "validation" as const,
        http_status: null,
        message:
          "Not previewed: some fields cannot be set by this tool; nothing was read or changed." +
          (hidden > 0 ? ` ${hidden} more problems are not listed.` : ""),
        retryable: false,
        errors: [...problems.values()].slice(0, MAX_PROBLEMS),
      },
    };
  }

  let calls = loaded.attempts;
  const tickets: { ticket_id: number; changes: Record<string, unknown>[] }[] = [];
  const notPreviewed: { ticket_id: number; code: string }[] = [];
  const read: PreviewItem[] = [];
  let cut = false;
  for (const [at, one] of items.entries()) {
    if (cut) {
      notPreviewed.push({ ticket_id: one.ticket_id, code: "not_read" });
      continue;
    }
    const found = await getTicket(context.http, one.ticket_id, [], deadline, "expensive");
    calls += found.attempts ?? 0;
    if (!found.ok) {
      cut = isCut(found.error, context);
      notPreviewed.push({ ticket_id: one.ticket_id, code: cut ? "not_read" : found.error.code });
      continue;
    }
    tickets.push({
      ticket_id: one.ticket_id,
      changes: resolved[at]!.map(([key, field]) => ({
        field: plainName(field.label),
        current: current(context, schema, field, found.ticket),
        new: fieldValue(field, one.fields[key]),
      })),
    });
    read.push(one);
  }

  let previewId: string | null = null;
  let expires: string | null = null;
  if (read.length > 0) {
    const minted = mintPreviewId(TOOL, read);
    if (!minted.ok) return minted;
    previewId = minted.preview_id;
    expires = minted.expires_at;
  }
  return {
    ok: true as const,
    value: {
      preview_id: previewId,
      expires_at: expires,
      tickets,
      not_previewed: notPreviewed,
      api_calls_used: calls,
      note:
        previewId === null
          ? "No ticket could be read: nothing to apply."
          : "Nothing was changed. Show this table to the user; only after they approve, call again with confirm: true, this preview_id and the previewed items (any of them, each with exactly its fields) before expires_at." +
            (notPreviewed.length > 0
              ? " The tickets in not_previewed are not covered by this preview_id: preview them in another call."
              : ""),
    },
  };
}

async function apply(
  entry: CategorizeTicketsEntry,
  items: readonly Item[],
  previewId: string | undefined,
  context: Context,
  deadline: number,
) {
  if (previewId === undefined) {
    return refusal(
      "Not applied: confirm: true needs the preview_id a preview gave. Call without confirm to preview first.",
    );
  }
  const checked = checkPreviewId(TOOL, previewId, items);
  if (!checked.ok) return checked;
  const loaded = await context.schema.get();
  if (!loaded.ok) return loaded;
  let calls = loaded.attempts;
  const results: Record<string, unknown>[] = [];
  const counts = { written: 0, refused: 0, may_have_been_applied: 0, not_attempted: 0 };
  let cut = false;
  // Only the checked items: never the call's items again.
  for (const one of checked.items) {
    if (cut) {
      results.push({ ticket_id: one.ticket_id, result: "not_attempted" });
      counts.not_attempted += 1;
      continue;
    }
    const result = await entry.update({
      schema: loaded.schema,
      id: one.ticket_id,
      fields: one.fields as Record<string, unknown>,
      deadline,
    });
    calls += result.attempts;
    if (result.ok) {
      results.push({ ticket_id: one.ticket_id, result: "written" });
      counts.written += 1;
    } else if (result.error.code === "rate_limited") {
      cut = true;
      results.push({ ticket_id: one.ticket_id, result: "not_attempted" });
      counts.not_attempted += 1;
    } else {
      // Sent, then a 5xx, a timeout or an answer of another shape: Freshdesk may have applied it.
      const state =
        result.attempts > 0 && (result.error.code === "network" || result.error.code === "server")
          ? "may_have_been_applied"
          : "refused";
      results.push({ ticket_id: one.ticket_id, result: state, error: shown(result.error) });
      counts[state] += 1;
    }
  }
  const notes: string[] = [];
  if (counts.not_attempted > 0) {
    notes.push(
      `${counts.not_attempted} tickets were not attempted (the call's time or the API budget ran out); nothing was written to them. To apply them, call again with confirm: true, the same preview_id and only those tickets, each with the same fields, within 15 minutes of the preview.`,
    );
  }
  if (counts.may_have_been_applied > 0) {
    notes.push(
      `${counts.may_have_been_applied} tickets are may_have_been_applied: the change was sent and Freshdesk did not answer clearly, so it may have been applied. Check those tickets with get_ticket before sending them again.`,
    );
  }
  return {
    ok: true as const,
    value: {
      results,
      ...counts,
      api_calls_used: calls,
      ...(notes.length > 0 ? { note: notes.join(" ") } : {}),
    },
  };
}

export function categorizeTickets(entry: CategorizeTicketsEntry): Tool<typeof input> {
  return {
    name: TOOL,
    description: [
      `Set category fields on up to ${PREVIEW_CAP} tickets: the ticket type and custom fields (product, sub-product, issue type and the like), given per ticket in items as {ticket_id, fields}, each field by API name or label, each value by its choice name (a nested field as "A > B > C").`,
      "Status, priority, group, agent and every other default field are refused, and nothing is sent: use update_ticket for those.",
      "Two steps. Without confirm it changes nothing: it reads each ticket and returns a preview, the current and new value of each field, and a preview_id. Show that table to the user; only after they approve, call again with confirm: true, the preview_id and the previewed items (any of them, each with exactly its previewed fields), within 15 minutes. A ticket added or a field changed refuses the whole confirm: preview again.",
      "The confirm writes one ticket at a time and returns a result per ticket: written, refused (with the error; a value that is not a valid choice refuses that ticket only), may_have_been_applied (with the error: sent without a clear answer, so check the ticket with get_ticket before sending it again), or not attempted when the call's time (30 s) or the API budget ran out. To apply the tickets not attempted, call again with confirm: true, the same preview_id and only those tickets.",
      "Freshdesk automations may act on each change, as for an agent's edit.",
    ].join(" "),
    input,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    cost: `a preview, 1 API call per ticket; a confirm, 1 API call per ticket; at most ${PREVIEW_CAP} tickets, within 30 s; plus one per retry after an error, plus at least 3 when the ticket-field schema is not cached`,
    customerText: true,
    async handler(args, context) {
      const deadline = Date.now() + CALL_DEADLINE_MS;
      const confirm = args.confirm === true;
      const bad = itemsRefusal(args.items, confirm);
      if (bad !== undefined) return bad;
      if (confirm) return apply(entry, args.items, args.preview_id, context, deadline);
      if (args.preview_id !== undefined) {
        return refusal(
          "Not applied: a preview_id is taken only with confirm: true. Call with confirm: true after the user approves, or without a preview_id to preview.",
        );
      }
      return preview(args.items, context, deadline);
    },
  };
}
