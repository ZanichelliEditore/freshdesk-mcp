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
//   - `checkRecipients` caps the addresses of all fields together at
//     `RECIPIENT_CAP`, counted as given (a repeat counts again), and refuses
//     over it, never truncating. A refusal names the field and the 1-based
//     position, never the address. It never throws.

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

/** Whether `address` is one plain address that an entry of `allowList` matches. */
export function onAllowList(allowList: readonly string[], address: string): boolean {
  const parsed = parseAddress(address);
  if (parsed === null) return false;
  return allowList.some((entry) => {
    if (typeof entry !== "string") return false;
    if (entry.startsWith("@")) {
      const domain = parseAddress(`x${entry}`)?.domain;
      return domain !== undefined && domain === parsed.domain;
    }
    const full = parseAddress(entry);
    return full !== null && full.local === parsed.local && full.domain === parsed.domain;
  });
}

export type RecipientCheck =
  | { ok: true }
  | {
      ok: false;
      reason: "malformed" | "not_allowed" | "over_cap";
      /** The field refused, or `null` for the cap. */
      field: string | null;
      /** The 1-based position in `field`, or `null` for the cap or a field that is not a list. */
      position: number | null;
      /** Names the field and position, never an address. */
      message: string;
    };

/**
 * Checks every address of every field against `allowList`, fields in the
 * order given, after the cap over all fields together. The first refusal
 * wins.
 */
export function checkRecipients(
  allowList: readonly string[],
  fields: Readonly<Record<string, readonly string[]>>,
): RecipientCheck {
  const lists = Object.entries(fields);
  for (const [field, addresses] of lists) {
    if (!Array.isArray(addresses)) {
      return {
        ok: false,
        reason: "malformed",
        field,
        position: null,
        message: `\`${field}\` is not a list of addresses.`,
      };
    }
  }
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
  for (const [field, addresses] of lists) {
    for (const [index, address] of addresses.entries()) {
      const where = `The address at position ${index + 1} of \`${field}\``;
      if (parseAddress(address) === null) {
        return {
          ok: false,
          reason: "malformed",
          field,
          position: index + 1,
          message: `${where} is not one plain address.`,
        };
      }
      if (!onAllowList(allowList, address)) {
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
  return { ok: true };
}
