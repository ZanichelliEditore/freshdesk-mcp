// Untrusted content (SPEC §7.4): what a tool does to text before returning it.
//
//   - Customer-written text (subject, description, conversation bodies,
//     attachment names, requester and company names, a conversation's from,
//     to and cc, KB articles and canned responses) goes through `untrusted`:
//     inside one `<ticket_content>…</ticket_content>` block. A string is the
//     block's text; an array or object, its JSON. `null`, `undefined`,
//     numbers and booleans pass unchanged.
//   - An embedded delimiter cannot end or open the block: every `<` that
//     comes before `ticket…content` with nothing but non-letters, non-digits
//     and no `>` between them (`</TICKET_CONTENT >`, `< /ticket content>`,
//     `<​/ticket_content>`) becomes `‹`. It runs on the text the reader
//     sees, so an entity in an HTML body is decoded first and then caught.
//     A delimiter written as entities in plain text (`&lt;/ticket_content&gt;`
//     in a `body_text`) is left as it is: it is not a delimiter there.
//   - Text, not HTML: `bodyText` takes `body_text` / `description_text` when
//     it is a string, else converts the HTML body with `htmlToText`. No HTML
//     parser: comments, script and style are dropped, `<br>` and the end of a
//     block become a newline, every other tag is removed, entities decoded
//     once (`&amp;lt;` gives `&lt;`), whitespace collapsed.
//   - A text over its cap (`TEXT_CAP` code points unless the caller gives
//     one) is cut on a code point, and a marker inside the block says how many
//     characters were cut and, from the caller's `rest`, how to fetch them.
//   - Admin-set text (agent and group names, field labels, choice names,
//     article, folder and canned titles) is not wrapped (owner, 2026-11-23):
//     `plainName` strips tags, collapses whitespace and caps it at `NAME_CAP`,
//     ending a cut one with `…`.
//   - A ticket field's value (`fieldValue`) is wrapped unless its type is a
//     known closed one and the value is of that type: a number (or decimal
//     string) for `custom_number` / `custom_decimal`, a boolean for
//     `custom_checkbox`, an ISO 8601 date for `custom_date` /
//     `custom_date_time`, a choice found in the field's own choices for
//     `custom_dropdown`, `default_ticket_type` and `nested_field` (each level
//     of the " > " path). A validated choice, and a status, priority, source,
//     agent or group name, goes through `plainName`. Any other type is wrapped.
//
// Every pass over the text is linear in its length: no regex here can
// backtrack over a long run (a tag strip stops at the last `>`).

import type { TicketField } from "../client/resources/ticket-fields.js";

export const OPEN = "<ticket_content>";
export const CLOSE = "</ticket_content>";

/** Code points of customer text kept by default. */
export const TEXT_CAP = 10_000;
/** Code points of an admin-set name kept by default. */
export const NAME_CAP = 100;

export interface CutOptions {
  /** Code points kept; `TEXT_CAP` when absent. */
  cap?: number;
  /** How to fetch the rest, said in the marker (e.g. "call get_ticket with ..."). */
  rest?: string;
}

const DELIMITER_WORD = /ticket[^\p{L}\p{N}<>]*content/giu;
const GAP_END = /[\p{L}\p{N}>]/u;

/** Turn every `<` that could start a delimiter into `‹`. */
function neutralise(text: string): string {
  let units: string[] | undefined;
  for (const match of text.matchAll(DELIMITER_WORD)) {
    for (let at = match.index - 1; at >= 0 && !GAP_END.test(text[at] ?? ""); at--) {
      if (text[at] === "<") {
        units ??= text.split("");
        units[at] = "‹";
      }
    }
  }
  return units ? units.join("") : text;
}

function cut(text: string, cap: number): { kept: string; more: number } {
  if (text.length <= cap) return { kept: text, more: 0 };
  const points = Array.from(text);
  if (points.length <= cap) return { kept: text, more: 0 };
  return { kept: points.slice(0, cap).join(""), more: points.length - cap };
}

function wrap(text: string, options: CutOptions = {}): string {
  const { kept, more } = cut(neutralise(text), options.cap ?? TEXT_CAP);
  const marker =
    more === 0
      ? ""
      : `\n[… ${more} more characters not shown${options.rest ? `; ${options.rest}` : ""}]`;
  return `${OPEN}${kept}${marker}${CLOSE}`;
}

/** Customer-written text as one `<ticket_content>` block; null and numbers unchanged. */
export function untrusted(value: string, options?: CutOptions): string;
export function untrusted(value: unknown, options?: CutOptions): unknown;
export function untrusted(value: unknown, options?: CutOptions): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return wrap(value, options);
  // Each string neutralised before JSON escapes its newlines and tabs.
  const json = JSON.stringify(value, (_key, inner: unknown) =>
    typeof inner === "string" ? neutralise(inner) : inner,
  );
  return wrap(json, options);
}

/** Remove every `<…>`; only up to the last `>`, so a run of `<` is not rescanned. */
function stripTags(text: string): string {
  const end = text.lastIndexOf(">") + 1;
  return text.slice(0, end).replace(/<[^>]*>/g, "") + text.slice(end);
}

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function codePoint(n: number): string {
  return Number.isSafeInteger(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)
    ? String.fromCodePoint(n)
    : "�";
}

/** One pass: `&amp;lt;` gives `&lt;`, never `<`. An unknown name stays as written. */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);?/gi, (whole, ref: string) => {
    if (ref[0] === "#") {
      const hex = ref[1] === "x" || ref[1] === "X";
      return codePoint(Number.parseInt(ref.slice(hex ? 2 : 1), hex ? 16 : 10));
    }
    return NAMED[ref.toLowerCase()] ?? whole;
  });
}

/** An HTML body as plain text, with no tag. */
export function htmlToText(html: string): string {
  const text = stripTags(
    html
      .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
      .replace(/<(script|style)\b[\s\S]*?(?:<\/\1\s*>|$)/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|tr|h[1-6]|blockquote|pre)\s*>/gi, "\n"),
  );
  return decodeEntities(text)
    .replace(/[ \t\r\f\v ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * A body or description: its text form when Freshdesk gives one (a string,
 * even empty), else its HTML converted; wrapped. `null` when neither is a string.
 */
export function bodyText(text: unknown, html: unknown, options?: CutOptions): string | null {
  if (typeof text === "string") return wrap(text, options);
  if (typeof html === "string") return wrap(htmlToText(html), options);
  return null;
}

/** Admin-set text: tags stripped, whitespace collapsed, capped; not wrapped. */
export function plainName(value: string, cap?: number): string;
export function plainName(value: unknown, cap?: number): unknown;
export function plainName(value: unknown, cap = NAME_CAP): unknown {
  if (typeof value !== "string") return value;
  const { kept, more } = cut(neutralise(stripTags(value).replace(/\s+/g, " ").trim()), cap);
  return more === 0 ? kept : `${kept}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether each part is a choice at its level of the field's list or tree. */
function inChoices(choices: unknown, parts: readonly string[]): boolean {
  let node = choices;
  for (const part of parts) {
    if (Array.isArray(node)) {
      if (!node.includes(part)) return false;
      node = undefined;
    } else if (isRecord(node) && Object.hasOwn(node, part)) {
      node = node[part];
    } else {
      return false;
    }
  }
  return parts.length > 0;
}

const NUMBER_TYPES = new Set(["custom_number", "custom_decimal"]);
const DATE_TYPES = new Set(["custom_date", "custom_date_time"]);
const CHOICE_TYPES = new Set(["custom_dropdown", "default_ticket_type"]);
const NAME_TYPES = new Set([
  "default_status",
  "default_priority",
  "default_source",
  "default_agent",
  "default_group",
]);
const DECIMAL = /^-?\d+(?:\.\d+)?$/;
const ISO_DATE =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** A ticket field's value: wrapped unless its type is a known closed one and the value fits it. */
export function fieldValue(field: TicketField, value: unknown, options?: CutOptions): unknown {
  const { type } = field;
  if (NAME_TYPES.has(type)) return plainName(value);
  if (typeof value === "string") {
    if (NUMBER_TYPES.has(type) && DECIMAL.test(value)) return value;
    if (DATE_TYPES.has(type) && ISO_DATE.test(value)) return value;
    if (CHOICE_TYPES.has(type) && inChoices(field.choices, [value])) return plainName(value);
    if (type === "nested_field" && inChoices(field.choices, value.split(" > "))) {
      return plainName(value);
    }
  }
  if (type === "custom_checkbox" && typeof value === "boolean") return value;
  return untrusted(value, options);
}
