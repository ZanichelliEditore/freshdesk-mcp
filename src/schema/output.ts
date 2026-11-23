// Output mapping (SPEC §7.3, §8.4): a raw API v2 ticket as `{label: value}`,
// one key per ticket field, in the order of the field list.
//
//   - Where a value is: a default field's at the ticket's top level under its
//     API key (`agent` → `responder_id`, `group` → `group_id`, ...), a custom
//     field's under `custom_fields`. A key the ticket does not carry leaves
//     the field out; `null` stays `null`.
//   - Status, priority and source become their names, agent and group their
//     names from the schema's maps. Which rule applies is decided by the
//     field's `type`, never by the shape of its choices: a status's choices
//     and a 2-level tree look alike.
//   - A nested field is one key, its top label, with the path of its levels
//     joined by " > ", stopping at the first empty level.
//   - An id that cannot be resolved is named, not guessed: `unknown status 9`;
//     for an agent or group missing from a list that was truncated,
//     `agent 9 (name not loaded: the agent list is incomplete)`.
//   - `null` and absent `choices` or `nested_ticket_fields` are alike.
//   - Hidden (team config `fields`, keyed by label or API name, any case): the
//     field is left out; a hidden nested level cuts the path before it.
//   - A label already used keys the later field as `Label (api_name)`.
//
// Not here: the requester's name (needs contacts, M1), the ticket's own keys
// such as id and dates, and untrusted-content wrapping (SPEC §7.4, M1).

import type { TicketField } from "../client/resources/ticket-fields.js";
import type { TeamConfig } from "../config.js";
import type { NameMap, Schema } from "./index.js";

/** Default fields whose value sits under another key of the ticket. */
const TICKET_KEY: Record<string, string> = {
  agent: "responder_id",
  group: "group_id",
  requester: "requester_id",
  company: "company_id",
  product: "product_id",
  ticket_type: "type",
};

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The field's value in the ticket, or `undefined` when the ticket has no such key. */
function rawValue(ticket: Raw, name: string, isDefault: boolean): unknown {
  const holder = isDefault ? ticket : ticket.custom_fields;
  const key = isDefault ? (TICKET_KEY[name] ?? name) : name;
  if (!isRecord(holder) || !Object.hasOwn(holder, key)) return undefined;
  return holder[key];
}

/** A status's choices: id → [agent label, customer label]. */
function statusName(choices: TicketField["choices"], value: unknown): string {
  const entry = isRecord(choices) ? choices[String(value)] : undefined;
  return Array.isArray(entry) && typeof entry[0] === "string"
    ? entry[0]
    : `unknown status ${String(value)}`;
}

/** A priority's or source's choices: name → id. */
function idName(kind: string, choices: TicketField["choices"], value: unknown): string {
  const found = isRecord(choices)
    ? Object.entries(choices).find(([, id]) => id === value)
    : undefined;
  return found ? found[0] : `unknown ${kind} ${String(value)}`;
}

function mapName(kind: string, map: NameMap, value: unknown): string {
  const name = typeof value === "number" ? map.names.get(value) : undefined;
  if (name !== undefined) return name;
  return map.truncated
    ? `${kind} ${String(value)} (name not loaded: the ${kind} list is incomplete)`
    : `unknown ${kind} ${String(value)}`;
}

function nestedPath(
  field: TicketField,
  ticket: Raw,
  top: unknown,
  hidden: (name: string, label: string) => boolean,
): unknown {
  if (top === null) return null;
  const parts = [String(top)];
  const levels = [...(field.nested_ticket_fields ?? [])].sort((a, b) => a.level - b.level);
  for (const level of levels) {
    if (hidden(level.name, level.label)) break;
    const value = rawValue(ticket, level.name, field.default);
    if (value === undefined || value === null || value === "") break;
    parts.push(String(value));
  }
  return parts.join(" > ");
}

export function ticketOutput(schema: Schema, ticket: Raw, fields: TeamConfig["fields"]): Raw {
  const hiddenKeys = new Set(
    Object.entries(fields)
      .filter(([, entry]) => entry.hidden)
      .map(([key]) => key.toLowerCase()),
  );
  const hidden = (name: string, label: string) =>
    hiddenKeys.has(name.toLowerCase()) || hiddenKeys.has(label.toLowerCase());

  const out: Raw = {};
  for (const field of schema.fields) {
    if (hidden(field.name, field.label)) continue;
    const value = rawValue(ticket, field.name, field.default);
    if (value === undefined) continue;

    let shown: unknown = value;
    if (value !== null) {
      switch (field.type) {
        case "default_status":
          shown = statusName(field.choices, value);
          break;
        case "default_priority":
          shown = idName("priority", field.choices, value);
          break;
        case "default_source":
          shown = idName("source", field.choices, value);
          break;
        case "default_agent":
          shown = mapName("agent", schema.agents, value);
          break;
        case "default_group":
          shown = mapName("group", schema.groups, value);
          break;
      }
    }
    if (field.type === "nested_field") shown = nestedPath(field, ticket, value, hidden);

    const key = Object.hasOwn(out, field.label) ? `${field.label} (${field.name})` : field.label;
    // Defined, not assigned: a label `__proto__` stays an own key.
    Object.defineProperty(out, key, {
      value: shown,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return out;
}
