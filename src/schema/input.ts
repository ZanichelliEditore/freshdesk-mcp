// Input mapping (SPEC §7.3): what a tool is given, as `{field: value}`, turned
// into a Freshdesk API v2 ticket body, checked against the schema's choices.
//
//   - A field is named by its API name, compared exactly, or by its label,
//     compared trimmed, NFC-normalised and lower-cased (`fold`, as for hidden
//     fields). A key that names more than one field, as a shared label or as
//     one field's API name and another's label, is refused, naming their API
//     names; so is a field given twice, a name no field has, and a key whose
//     value would land where another key's already did. A nested level is not
//     a field: its top field takes the path.
//   - Where a value goes: a default field's at the body's top level under its
//     ticket key (`agent` → `responder_id`), a custom field's under
//     `custom_fields`, as output.ts reads them.
//   - A value is matched like a label: an exact choice first, then a single
//     choice that folds alike; Freshdesk's own spelling is sent. Several
//     choices folding alike and none exact is refused.
//       dropdown, ticket type   a choice from the list
//       status                  its agent name, or an id it has → the id
//       priority, source        a name, or an id among them → the id
//       nested field            "A > B > C": each level among the choices
//                               under the one before; a shorter path sends
//                               `null` for the levels after it, a longer one
//                               is refused
//       any other type          with a non-empty list of choices, one of
//                               them; with choices of another shape,
//                               refused; with none, passed through unchanged
//                               (agent, group and requester stay ids)
//     A status, priority or source name two ids share is refused; a status
//     key that is not a whole number is not offered.
//   - `null` clears a field (every level of a nested one); a key not given
//     is not sent. `null` and absent `choices` are alike.
//   - Every problem is reported, as one `validation` error whose `errors[]`
//     has one entry per input key, at most MAX_FIELD_ERRORS; an invalid
//     choice lists the valid ones at the failing level. Echoed keys and
//     values and the choice lists are clipped, each message to
//     MAX_FIELD_TEXT. `http_status` is `null`: nothing was sent.
//   - Lookups use own keys only, and the body is built with defined
//     properties: a name such as `__proto__` or `constructor` is data.

import {
  type FieldError,
  type FreshdeskError,
  MAX_FIELD_ERRORS,
  MAX_FIELD_TEXT,
} from "../client/errors.js";
import type { TicketField } from "../client/resources/ticket-fields.js";
import type { Schema } from "./index.js";
import { fold, ticketKey } from "./output.js";

type Raw = Record<string, unknown>;

export type InputResult = { ok: true; body: Raw } | { ok: false; error: FreshdeskError };

/** Characters of an echoed key or value, and of a list of choices, in a message. */
const MAX_QUOTE = 80;
const MAX_LIST = 300;

/** One problem with one input key, before it becomes a FieldError. */
class Refusal {
  constructor(
    readonly code: string,
    readonly message: string,
  ) {}
}

function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function put(target: Raw, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** A key or value as JSON, clipped: what a message may echo of the input. */
function quote(value: unknown): string {
  let text: string | undefined;
  try {
    text = JSON.stringify(value);
  } catch {
    text = undefined;
  }
  return clip(text ?? String(typeof value), MAX_QUOTE);
}

function listed(options: readonly string[]): string {
  if (options.length === 0) return "(none)";
  const shown: string[] = [];
  let length = 0;
  for (const option of options) {
    const text = quote(option);
    if (shown.length > 0 && length + text.length > MAX_LIST) break;
    shown.push(text);
    length += text.length + 2;
  }
  const rest = options.length - shown.length;
  return shown.join(", ") + (rest > 0 ? ` … and ${rest} more` : "");
}

function findField(schema: Schema, key: string): TicketField | Refusal {
  const found = schema.fields.filter(
    (field) => field.name === key || fold(field.label) === fold(key),
  );
  if (found.length === 1) return found[0]!;
  if (found.length > 1) {
    return new Refusal(
      "ambiguous_field",
      `${quote(key)} names several fields (${listed(found.map((field) => field.name))}): name one by its API name or its own label.`,
    );
  }
  return new Refusal("unknown_field", `No ticket field is named or labelled ${quote(key)}.`);
}

/** The option `wanted` names: exact first, then the one option that folds alike. */
function pick(options: readonly string[], wanted: unknown, where: string): string | Refusal {
  if (typeof wanted === "string") {
    if (options.includes(wanted)) return wanted;
    const alike = options.filter((option) => fold(option) === fold(wanted));
    if (alike.length === 1) return alike[0]!;
    if (alike.length > 1) {
      return new Refusal(
        "ambiguous_choice",
        `${quote(wanted)} matches several choices for ${where} (${listed(alike)}): give one exactly.`,
      );
    }
  }
  return new Refusal(
    "invalid_choice",
    `${quote(wanted)} is not a valid choice for ${where}. Valid choices: ${listed(options)}.`,
  );
}

/** name → id pairs of a status (its agent name), priority or source. */
function namedIds(field: TicketField): [string, number][] {
  const choices = field.choices;
  if (!isRecord(choices)) return [];
  const pairs: [string, number][] = [];
  for (const [key, entry] of Object.entries(choices)) {
    if (field.type === "default_status") {
      if (/^\d+$/.test(key) && Array.isArray(entry) && typeof entry[0] === "string") {
        pairs.push([entry[0], Number(key)]);
      }
    } else if (typeof entry === "number") {
      pairs.push([key, entry]);
    }
  }
  return pairs;
}

function idValue(field: TicketField, value: unknown): number | Refusal {
  const pairs = namedIds(field);
  if (typeof value === "number" && pairs.some(([, id]) => id === value)) return value;
  const where = `field ${field.label}`;
  const name = pick(
    pairs.map(([label]) => label),
    value,
    where,
  );
  if (name instanceof Refusal) return name;
  const ids = pairs.filter(([label]) => label === name).map(([, id]) => id);
  if (ids.length > 1) {
    return new Refusal(
      "ambiguous_choice",
      `${quote(name)} names several ids for ${where} (${ids.join(", ")}): give the id.`,
    );
  }
  return ids[0]!;
}

function levelFields(field: TicketField): { name: string; label: string }[] {
  const levels = [...(field.nested_ticket_fields ?? [])].sort((a, b) => a.level - b.level);
  return [{ name: field.name, label: field.label }, ...levels];
}

/** "A > B > C" → each level's API name and Freshdesk's spelling of its choice. */
function nestedValues(field: TicketField, value: unknown): [string, unknown][] | Refusal {
  const levels = levelFields(field);
  if (value === null) return levels.map((level) => [level.name, null]);
  if (typeof value !== "string") {
    return new Refusal(
      "invalid_choice",
      `Field ${field.label} takes a path such as "A > B" as a string.`,
    );
  }
  const parts = value.split(" > ");
  if (parts.length > levels.length) {
    return new Refusal(
      "invalid_choice",
      `Field ${field.label} has ${levels.length} levels; the path ${quote(value)} has ${parts.length}.`,
    );
  }
  const out: [string, unknown][] = levels.map((level) => [level.name, null]);
  const chosen: string[] = [];
  let node: unknown = field.choices;
  for (const [i, part] of parts.entries()) {
    const options = Array.isArray(node)
      ? (node as string[])
      : isRecord(node)
        ? Object.keys(node)
        : [];
    const under = chosen.length > 0 ? ` under ${chosen.join(" > ")}` : "";
    const picked = pick(options, part, `level ${levels[i]!.label}${under}`);
    if (picked instanceof Refusal) return picked;
    out[i]![1] = picked;
    chosen.push(picked);
    node = isRecord(node) && Object.hasOwn(node, picked) ? node[picked] : undefined;
  }
  return out;
}

/** The field's value or values as `[API name, value]`, or why it is refused. */
function fieldValues(field: TicketField, value: unknown): [string, unknown][] | Refusal {
  if (field.type === "nested_field") return nestedValues(field, value);
  if (value === null) return [[field.name, null]];
  switch (field.type) {
    case "default_status":
    case "default_priority":
    case "default_source": {
      const id = idValue(field, value);
      return id instanceof Refusal ? id : [[field.name, id]];
    }
    case "custom_dropdown":
    case "default_ticket_type": {
      const options = Array.isArray(field.choices) ? field.choices : [];
      const choice = pick(options, value, `field ${field.label}`);
      return choice instanceof Refusal ? choice : [[field.name, choice]];
    }
  }
  const choices = field.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const choice = pick(choices, value, `field ${field.label}`);
    return choice instanceof Refusal ? choice : [[field.name, choice]];
  }
  if (choices && !Array.isArray(choices) && Object.keys(choices).length > 0) {
    return new Refusal(
      "unsupported_field",
      `Field ${field.label} has choices this server cannot check: it cannot be set here.`,
    );
  }
  return [[field.name, value]];
}

export function ticketInput(schema: Schema, input: Raw): InputResult {
  const body: Raw = {};
  const custom: Raw = {};
  const seen = new Set<string>();
  const problems: FieldError[] = [];

  for (const [key, value] of Object.entries(input)) {
    const field = findField(schema, key);
    let values =
      field instanceof Refusal
        ? field
        : seen.has(field.name)
          ? new Refusal("duplicate_field", `Field ${field.label} is given more than once.`)
          : fieldValues(field, value);
    const isDefault = !(field instanceof Refusal) && field.default;
    const target = isDefault ? body : custom;
    if (
      !(values instanceof Refusal) &&
      values.some(([name]) => Object.hasOwn(target, ticketKey(name, isDefault)))
    ) {
      values = new Refusal(
        "duplicate_field",
        `${quote(key)} sets a ticket field another key already sets.`,
      );
    }
    if (values instanceof Refusal) {
      problems.push({
        field: clip(key, MAX_FIELD_TEXT),
        code: values.code,
        message: clip(values.message, MAX_FIELD_TEXT),
      });
      continue;
    }
    seen.add((field as TicketField).name);
    for (const [name, shown] of values) put(target, ticketKey(name, isDefault), shown);
  }

  if (problems.length > 0) {
    const hidden = problems.length - MAX_FIELD_ERRORS;
    return {
      ok: false,
      error: {
        code: "validation",
        http_status: null,
        message:
          "Some ticket fields are not valid; nothing was sent." +
          (hidden > 0 ? ` ${hidden} more problems are not listed.` : ""),
        retryable: false,
        errors: problems.slice(0, MAX_FIELD_ERRORS),
      },
    };
  }
  if (Object.keys(custom).length > 0) put(body, "custom_fields", custom);
  return { ok: true, body };
}
