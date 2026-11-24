// Ticket rows (SPEC §8.4): what the list tools and `get_ticket`'s recent
// tickets return for a ticket, built on `ticketOutput` as it is.
//
//   - `ticketRow`: `{id, subject, status, priority, category, updated,
//     agent, group}`. The subject is customer text: cut to SUBJECT_CAP code
//     points, inside `<ticket_content>`, the marker for a cut one after the
//     block. Status, priority, agent and group are names through `fieldValue`
//     (stripped of HTML, capped, not wrapped); an id it cannot name is said
//     so by `ticketOutput` (an agent missing from a truncated list "not
//     loaded"). A field the schema lacks, or the team hides, leaves its key
//     out; an unassigned agent or group is `null`.
//   - `category`: `{label: value}` for the team's `uncategorised_fields`
//     (matched by label or API name, trimmed, NFC, any case), else for the
//     first nested field (SPEC §10's category field). The label goes through
//     `plainName`, the value through `fieldValue`: a validated choice path is
//     plain, anything else wrapped.
//   - `updated`: the ticket's `updated_at` as a UTC ISO 8601 instant when it
//     is an ISO 8601 date-time with a zone, else `null`.
//   - `ticketDetail`: `{id, updated, fields}`, `fields` every field
//     `ticketOutput` gives, keyed by its label through `plainName` (a label
//     already used keys the later field `Label (api_name)`), each value
//     through `fieldValue` by its own field's type; the description as text
//     (`bodyText`), wrapped.

import type { TicketField } from "../client/resources/ticket-fields.js";
import type { Ticket } from "../client/resources/tickets.js";
import type { Schema } from "../schema/index.js";
import type { AppContext } from "./context.js";
import { bodyText, fieldValue, plainName, untrusted } from "./format.js";

/** Code points of a row's subject. */
export const SUBJECT_CAP = 120;

export type RowContext = Pick<AppContext, "team" | "ticketOutput">;

export interface TicketRow {
  id: number;
  subject: string;
  status?: unknown;
  priority?: unknown;
  category: Record<string, unknown>;
  updated: string | null;
  agent?: unknown;
  group?: unknown;
}

export interface TicketDetail {
  id: number;
  updated: string | null;
  fields: Record<string, unknown>;
}

/** The row's name keys and the field type each is read from. */
const ROW_TYPES = {
  status: "default_status",
  priority: "default_priority",
  agent: "default_agent",
  group: "default_group",
} as const;

const ISO_WITH_ZONE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})$/;

function fold(text: string): string {
  return text.normalize("NFC").trim().toLowerCase();
}

/** One field through `ticketOutput`: `{ found: false }` when it gives no key (absent or hidden). */
function outputOf(
  ctx: RowContext,
  schema: Schema,
  field: TicketField,
  ticket: Ticket,
): { found: true; value: unknown } | { found: false } {
  const out = ctx.ticketOutput({ ...schema, fields: [field] }, ticket);
  const values = Object.values(out);
  return values.length === 0 ? { found: false } : { found: true, value: values[0] };
}

function isoUpdated(value: unknown): string | null {
  if (typeof value !== "string" || !ISO_WITH_ZONE.test(value)) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function categoryFields(ctx: RowContext, schema: Schema): readonly TicketField[] {
  const listed = ctx.team.uncategorised_fields;
  if (listed === undefined) {
    const nested = schema.fields.find((field) => field.type === "nested_field");
    return nested ? [nested] : [];
  }
  const keys = new Set(listed.map(fold));
  return schema.fields.filter((field) => keys.has(fold(field.label)) || keys.has(fold(field.name)));
}

/** Defined, not assigned: a key `__proto__` stays an own key. */
function put(out: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(out, key, { value, enumerable: true, writable: true, configurable: true });
}

export function ticketRow(ctx: RowContext, schema: Schema, ticket: Ticket): TicketRow {
  const named = (key: keyof typeof ROW_TYPES): Partial<TicketRow> => {
    const field = schema.fields.find((candidate) => candidate.type === ROW_TYPES[key]);
    if (!field) return {};
    const shown = outputOf(ctx, schema, field, ticket);
    return shown.found ? { [key]: fieldValue(field, shown.value) } : {};
  };
  const category: Record<string, unknown> = {};
  for (const field of categoryFields(ctx, schema)) {
    const shown = outputOf(ctx, schema, field, ticket);
    if (shown.found) put(category, plainName(field.label), fieldValue(field, shown.value));
  }
  return {
    id: ticket.id,
    subject: untrusted(ticket.subject, {
      cap: SUBJECT_CAP,
      rest: "get_ticket returns the full subject",
    }),
    ...named("status"),
    ...named("priority"),
    category,
    updated: isoUpdated(ticket.updated_at),
    ...named("agent"),
    ...named("group"),
  };
}

export function ticketDetail(ctx: RowContext, schema: Schema, ticket: Ticket): TicketDetail {
  const fields: Record<string, unknown> = {};
  for (const field of schema.fields) {
    const shown = outputOf(ctx, schema, field, ticket);
    if (!shown.found) continue;
    const label = plainName(field.label);
    const key = Object.hasOwn(fields, label) ? `${label} (${plainName(field.name)})` : label;
    const value =
      field.type === "default_description"
        ? bodyText(ticket.description_text, shown.value)
        : fieldValue(field, shown.value);
    put(fields, key, value);
  }
  return { id: ticket.id, updated: isoUpdated(ticket.updated_at), fields };
}
