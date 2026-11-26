// The recipient allow-list matcher (RFC 2026-11-26-send-safety-core, OD-22
// and OD-23; T-081). Part of the safety core (AGENTS.md hard rule 1): a
// change to these rules goes through `/rfc` first. Pure: no client, no
// environment, no config read; the caller passes the team's
// `forward_allow_list` (src/config.ts is unchanged, OD-23).
//
//   - An address is one plain address: ASCII only, printable, no whitespace,
//     none of `"(),:;<>[\]` (so no display name, list or quote), exactly one
//     `@` with a non-empty local part and domain, and no trailing dot in the
//     domain. Anything else is refused, never matched. ASCII is checked
//     before lower-casing, so a character that lower-cases to ASCII (the
//     Kelvin sign) cannot slip through. An apostrophe stays allowed: it is a
//     plain local-part character (`o'brien@`), not a quote that can hide a
//     second address.
//   - Both sides are lower-cased. An entry `@domain` matches any local part
//     (plus-addressing included) at exactly that domain: no subdomain, no
//     suffix or prefix. A full-address entry matches only itself.
//   - An entry that no valid address can equal (`@example.com,`) matches
//     nothing: a bad team file fails closed. Entries are not trimmed.
//   - `checkRecipients` copies each list once (its length read once), then
//     caps the addresses of all fields together at `RECIPIENT_CAP`, counted
//     as given (a repeat counts again), and refuses over it, never
//     truncating. It returns the frozen copies it checked, which are what the
//     caller sends (T-082), so a list changed after the check cannot reach
//     Freshdesk. A refusal names the field and the 1-based position, never
//     the address.
//   - Neither function throws: an allow-list that is not a list refuses every
//     address, fields that are not an object or a list that throws when read
//     are `malformed`.

/** The most recipients one send may have, all fields together (OD-22, as OD-14). */
export const RECIPIENT_CAP = 10;

/** Printable ASCII but space and `"(),:;<>@[\]`. */
const PART = /^[!#-'*+\-./0-9=?A-Z^-~]+$/;

/** The lower-cased address, or `null` when it is not one plain address. */
function parseAddress(address: unknown): { local: string; domain: string } | null {
  if (typeof address !== "string") return null;
  const at = address.indexOf("@");
  if (at < 0) return null; // a second `@` fails PART
  const local = address.slice(0, at);
  const domain = address.slice(at + 1);
  if (!PART.test(local) || !PART.test(domain) || domain.endsWith(".")) return null;
  return { local: local.toLowerCase(), domain: domain.toLowerCase() };
}

/** A copy of `list` with its length read once; throws only if reading it throws. */
function snapshot(list: readonly unknown[]): unknown[] {
  const length = list.length;
  const copy: unknown[] = [];
  for (let i = 0; i < length; i++) copy.push(list[i]);
  return copy;
}

/** Whether a copied allow-list has an entry matching the parsed address. */
function matches(entries: readonly unknown[], parsed: { local: string; domain: string }): boolean {
  return entries.some((entry) => {
    if (typeof entry !== "string") return false;
    if (entry.startsWith("@")) {
      const domain = parseAddress(`x${entry}`)?.domain;
      return domain !== undefined && domain === parsed.domain;
    }
    const full = parseAddress(entry);
    return full !== null && full.local === parsed.local && full.domain === parsed.domain;
  });
}

/** The allow-list copied once, or none (refusing everything) when it is not a readable list. */
function entriesOf(allowList: readonly string[]): unknown[] {
  try {
    return Array.isArray(allowList) ? snapshot(allowList) : [];
  } catch {
    return [];
  }
}

/** Whether `address` is one plain address that an entry of `allowList` matches. */
export function onAllowList(allowList: readonly string[], address: string): boolean {
  const parsed = parseAddress(address);
  return parsed !== null && matches(entriesOf(allowList), parsed);
}

export type RecipientCheck =
  | {
      ok: true;
      /** The frozen copies checked, field by field: send these, not the caller's lists. */
      recipients: Readonly<Record<string, readonly string[]>>;
    }
  | {
      ok: false;
      reason: "malformed" | "not_allowed" | "over_cap";
      /** The field refused, or `null` for the cap or fields that cannot be read. */
      field: string | null;
      /** The 1-based position in `field`, or `null` when no one address is at fault. */
      position: number | null;
      /** Names the field and position, never an address. */
      message: string;
    };

/** The fields as `[field, copy]` pairs, or a refusal when they cannot be read as lists. */
function copyFields(fields: unknown): [string, unknown[]][] | RecipientCheck {
  const unreadable: RecipientCheck = {
    ok: false,
    reason: "malformed",
    field: null,
    position: null,
    message: "The recipients are not readable as lists of addresses.",
  };
  if (typeof fields !== "object" || fields === null || Array.isArray(fields)) return unreadable;
  try {
    const lists: [string, unknown[]][] = [];
    for (const [field, addresses] of Object.entries(fields)) {
      if (!Array.isArray(addresses)) {
        return {
          ok: false,
          reason: "malformed",
          field,
          position: null,
          message: `\`${field}\` is not a list of addresses.`,
        };
      }
      lists.push([field, snapshot(addresses)]);
    }
    return lists;
  } catch {
    return unreadable;
  }
}

/**
 * Checks every address of every field against `allowList`, fields in the
 * order given, after the cap over all fields together. The first refusal
 * wins. Never throws.
 */
export function checkRecipients(
  allowList: readonly string[],
  fields: Readonly<Record<string, readonly string[]>>,
): RecipientCheck {
  const lists = copyFields(fields);
  if (!Array.isArray(lists)) return lists;
  const total = lists.reduce((sum, [, addresses]) => sum + addresses.length, 0);
  if (total > RECIPIENT_CAP) {
    return {
      ok: false,
      reason: "over_cap",
      field: null,
      position: null,
      message: `${total} recipients; at most ${RECIPIENT_CAP} per send, all fields together.`,
    };
  }
  const entries = entriesOf(allowList);
  for (const [field, addresses] of lists) {
    for (const [index, address] of addresses.entries()) {
      const where = `The address at position ${index + 1} of \`${field}\``;
      const parsed = parseAddress(address);
      if (parsed === null) {
        return {
          ok: false,
          reason: "malformed",
          field,
          position: index + 1,
          message: `${where} is not one plain address.`,
        };
      }
      if (!matches(entries, parsed)) {
        return {
          ok: false,
          reason: "not_allowed",
          field,
          position: index + 1,
          message: `${where} is not on the forward allow-list.`,
        };
      }
    }
  }
  const recipients = Object.fromEntries(
    lists.map(([field, addresses]) => [field, Object.freeze(addresses as string[])]),
  );
  return { ok: true, recipients: Object.freeze(recipients) };
}
