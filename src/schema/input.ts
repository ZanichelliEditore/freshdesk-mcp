// Input mapping (SPEC §7.3): what a tool is given, as `{field: value}`, turned
// into a Freshdesk API v2 ticket body, checked against the schema's choices.
//
//   - A field is named by its API name, compared exactly, or by its label,
//     compared trimmed, NFC-normalised and lower-cased (`fold`, as for hidden
//     fields). An API name wins over another field's label. A label two
//     fields share is refused, naming their API names; so is a field given
//     twice and a name no field has. A nested level is not a field: its top
//     field takes the path.
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
//                               under the one before; a shorter path is
//                               allowed, a longer one refused
//       anything else           passed through unchanged (agent, group and
//                               requester stay ids: no name lookup here)
//   - `null` clears a field (every level of a nested one); a key not given
//     is not sent. `null` and absent `choices` are alike: no valid choice.
//   - Every problem is reported, as one `validation` error whose `errors[]`
//     has one entry per input key; an invalid choice lists the valid ones at
//     the failing level. `http_status` is `null`: nothing was sent.
//   - Lookups go through Maps and own keys only, and the body is built with
//     defined properties: a name such as `__proto__` or `constructor` is data.

import type { FieldError, FreshdeskError } from "../client/errors.js";
import type { TicketField } from "../client/resources/ticket-fields.js";
import type { Schema } from "./index.js";
import { fold, ticketKey } from "./output.js";

type Raw = Record<string, unknown>;

export type InputResult = { ok: true; body: Raw } | { ok: false; error: FreshdeskError };

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

function findField(schema: Schema, key: string): TicketField | Refusal {
  const byName = schema.fields.find((field) => field.name === key);
  if (byName) return byName;
  const byLabel = schema.fields.filter((field) => fold(field.label) === fold(key));
  if (byLabel.length === 1) return byLabel[0]!;
  if (byLabel.length > 1) {
    const names = byLabel.map((field) => field.name).join(", ");
    return new Refusal(
      "ambiguous_field",
      `The label "${key}" belongs to several fields (${names}): name one by its API name.`,
    );
  }
  return new Refusal("unknown_field", `No ticket field is named or labelled "${key}".`);
}

function listed(options: readonly string[]): string {
  return options.length > 0 ? options.join(", ") : "(none)";
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
        `"${wanted}" matches several choices for ${where} (${alike.join(", ")}): give one exactly.`,
      );
    }
  }
  return new Refusal(
    "invalid_choice",
    `${JSON.stringify(wanted)} is not a valid choice for ${where}. Valid choices: ${listed(options)}.`,
  );
}

/** name → id pairs of a status (its agent name), priority or source. */
function namedIds(field: TicketField): [string, number][] {
  const choices = field.choices;
  if (!isRecord(choices)) return [];
  const pairs: [string, number][] = [];
  for (const [key, entry] of Object.entries(choices)) {
    if (field.type === "default_status") {
      if (Array.isArray(entry) && typeof entry[0] === "string") pairs.push([entry[0], Number(key)]);
    } else if (typeof entry === "number") {
      pairs.push([key, entry]);
    }
  }
  return pairs;
}

function idValue(field: TicketField, value: unknown): number | Refusal {
  const pairs = namedIds(field);
  if (typeof value === "number" && pairs.some(([, id]) => id === value)) return value;
  const name = pick(
    pairs.map(([label]) => label),
    value,
    `field ${field.label}`,
  );
  if (name instanceof Refusal) return name;
  return pairs.find(([label]) => label === name)![1];
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
      `Field ${field.label} has ${levels.length} levels; the path ${JSON.stringify(value)} has ${parts.length}.`,
    );
  }
  const out: [string, unknown][] = [];
  const chosen: string[] = [];
  let node: unknown = field.choices;
  for (const [i, part] of parts.entries()) {
    const options = Array.isArray(node)
      ? (node as string[])
      : isRecord(node)
        ? Object.keys(node)
        : [];
    const under = chosen.length > 0 ? ` under ${chosen.join(" > ")}` : "";
    const picked = pick(options, part.trim(), `level ${levels[i]!.label}${under}`);
    if (picked instanceof Refusal) return picked;
    out.push([levels[i]!.name, picked]);
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
      const choice = pick(
        options,
        typeof value === "string" ? value.trim() : value,
        `field ${field.label}`,
      );
      return choice instanceof Refusal ? choice : [[field.name, choice]];
    }
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
    const values =
      field instanceof Refusal
        ? field
        : seen.has(field.name)
          ? new Refusal("duplicate_field", `Field ${field.label} is given more than once.`)
          : fieldValues(field, value);
    if (values instanceof Refusal) {
      problems.push({ field: key, code: values.code, message: values.message });
      continue;
    }
    const { default: isDefault, name: fieldName } = field as TicketField;
    seen.add(fieldName);
    for (const [name, shown] of values)
      put(isDefault ? body : custom, ticketKey(name, isDefault), shown);
  }

  if (problems.length > 0) {
    return {
      ok: false,
      error: {
        code: "validation",
        http_status: null,
        message: "Some ticket fields are not valid; nothing was sent.",
        retryable: false,
        errors: problems,
      },
    };
  }
  if (Object.keys(custom).length > 0) put(body, "custom_fields", custom);
  return { ok: true, body };
}
