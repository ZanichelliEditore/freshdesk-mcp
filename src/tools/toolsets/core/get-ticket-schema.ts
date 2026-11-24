// `get_ticket_schema` (SPEC §8.2, C1, C8): the ticket fields with their
// labels, API names, types, choices and team meanings, from the schema
// service's cache (SPEC §7.3).
//
//   - Every field the schema has is listed: the team file's `hidden` is not
//     applied here (owner, 2026-11-23; SPEC §7.3).
//   - A field's team `meaning` is found by its label or API name, the keys
//     the team file's `fields` takes, compared as `ticketOutput` compares a
//     `hidden` key: trimmed, NFC-normalised, lower-cased. (src/schema/
//     output.ts, which has that rule, is not on this place's import list.)
//     The meaning is the team's own text, returned as written.
//   - Labels, API names, types and choice names are admin-set: through
//     `plainName` (tags stripped, capped), not wrapped (owner, 2026-11-23).
//   - Choices by type: a status as `{id, name, customer_name}`; a nested
//     field as a tree of `{name, choices}` down to a list of names, with its
//     `levels`; a list of names as is; a name → id record (priority, source,
//     agent, group) as `{id, name}`.
//   - At most CHOICE_CAP choices per field, every level of a tree counted,
//     filled level by level so the top levels come first. A list cut short
//     has `choices_not_shown`, the count left out; a choice whose list was
//     not reached at all has `choices: []`.

import { z } from "zod";
import type { Schema } from "../../../schema/index.js";
import { NAME_CAP, plainName } from "../../format.js";
import type { Tool } from "../index.js";

/** Most choices one field lists, every level of a tree counted. */
export const CHOICE_CAP = 200;

type TicketField = Schema["fields"][number];

type Choice = string | object;

interface Branch {
  choices: Choice[];
  choices_not_shown?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function id(key: string): number | string {
  return /^\d+$/.test(key) ? Number(key) : plainName(key);
}

/** One level of choices as entries: a leaf has no subtree. */
function entries(field: TicketField, node: unknown): [Choice, unknown][] {
  if (Array.isArray(node)) {
    return node.map((name) => [plainName(String(name)), undefined]);
  }
  if (!isRecord(node)) return [];
  if (field.type === "default_status") {
    return Object.entries(node).map(([key, names]) => {
      const [name, customer] = Array.isArray(names) ? names : [];
      return [
        { id: id(key), name: plainName(name), customer_name: plainName(customer) },
        undefined,
      ];
    });
  }
  if (field.type === "nested_field") {
    return Object.entries(node).map(([name, sub]) => [plainName(name), sub]);
  }
  return Object.entries(node).map(([name, value]) => [
    { id: typeof value === "number" ? value : null, name: plainName(name) },
    undefined,
  ]);
}

/** The field's choices, level by level, at most CHOICE_CAP in all. */
function capChoices(field: TicketField): Branch {
  const root: Branch = { choices: [] };
  const queue: [Branch, unknown][] = [[root, field.choices]];
  let left = CHOICE_CAP;
  for (let i = 0; i < queue.length; i++) {
    const [branch, node] = queue[i];
    const all = entries(field, node);
    const kept = all.slice(0, left);
    left -= kept.length;
    branch.choices = kept.map(([choice, sub]) => {
      if (sub === undefined) return choice;
      const child: Branch & { name: Choice } = { name: choice, choices: [] };
      queue.push([child, sub]);
      return child;
    });
    if (all.length > kept.length) branch.choices_not_shown = all.length - kept.length;
  }
  return root;
}

/** As `fold` in src/schema/output.ts. */
function fold(text: string): string {
  return text.normalize("NFC").trim().toLowerCase();
}

function describeField(field: TicketField, meanings: ReadonlyMap<string, string>) {
  const meaning = [field.label, field.name]
    .map((name) => meanings.get(fold(name)))
    .find((text) => text !== undefined);
  const levels = [...(field.nested_ticket_fields ?? [])]
    .sort((a, b) => a.level - b.level)
    .map((level) => ({
      label: plainName(level.label),
      name: plainName(level.name),
      level: level.level,
    }));
  return {
    label: plainName(field.label),
    name: plainName(field.name),
    type: plainName(field.type),
    ...(field.choices == null ? {} : capChoices(field)),
    ...(levels.length === 0 ? {} : { levels }),
    ...(meaning === undefined ? {} : { meaning }),
  };
}

const input = z.object({});

export const getTicketSchema: Tool<typeof input> = {
  name: "get_ticket_schema",
  description: [
    "The ticket fields: each one's label, API name, type and choices, with the team's meaning where the team config gives one.",
    "A nested field's choices are a tree of {name, choices}, with its levels' labels and API names.",
    `At most ${CHOICE_CAP} choices are listed per field, every level counted; a list cut short says how many choices it leaves out in choices_not_shown.`,
    `Labels and names are shown without HTML and cut at ${NAME_CAP} characters (ending with …).`,
  ].join(" "),
  input,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  cost: "0 API calls while the schema is cached (limits.schema_ttl_s, default 1 h); a cold load is 1 call for the ticket fields plus 1 per 100 agents and 1 per 100 groups, at least 3, within 30 s",
  customerText: false,
  async handler(_args, context) {
    const loaded = await context.schema.get();
    if (!loaded.ok) return loaded;
    const meanings = new Map<string, string>();
    for (const [key, entry] of Object.entries(context.team.fields)) {
      if (entry.meaning !== undefined && !meanings.has(fold(key)))
        meanings.set(fold(key), entry.meaning);
    }
    return {
      ok: true,
      value: { fields: loaded.schema.fields.map((field) => describeField(field, meanings)) },
    };
  },
};
