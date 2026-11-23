// Ticket fields (SPEC §7.3): `GET /ticket_fields`, the list the schema
// service maps labels and choices from. One request, not paginated.
//
// The body is checked here, not trusted: a field needs a whole-number `id`, a
// non-empty `name` and `label`, a `type` and a boolean `default`; keys this
// module does not know are passed through. `choices` takes the shapes API v2 sends:
//   - a dropdown's list of names                         ["A", "B"]
//   - a nested field's tree, two or three levels deep    {"A": {"B": ["C"]}}
//   - a status's id → [agent name, customer name]        {"2": ["Open", "..."]}
//   - a priority's or source's name → id                 {"Low": 1}
// A tree deeper than three levels is refused: Freshdesk has none. A status's
// choices and a 2-level tree share one shape: tell them apart by `type`.
// `null` for `choices` or `nested_ticket_fields` is taken as absent.
//
// A body in any other shape is `server` with the response's real status, not
// retryable. Its message is fixed text: it quotes nothing from the body.

import { z } from "zod";
import type { FreshdeskError } from "../errors.js";
import type { HttpClient } from "../http.js";

const names = z.array(z.string());
const choiceTree = z.union([
  names,
  z.record(z.string(), z.union([names, z.record(z.string(), names)])),
]);
const ids = z.record(z.string(), z.number());

const nestedLevel = z.looseObject({
  name: z.string(),
  label: z.string(),
  level: z.number().int(),
});

const ticketField = z.looseObject({
  id: z.number().int(),
  name: z.string().min(1),
  label: z.string().min(1),
  type: z.string(),
  default: z.boolean(),
  choices: z.union([choiceTree, ids]).nullish(),
  nested_ticket_fields: z.array(nestedLevel).nullish(),
});

const ticketFields = z.array(ticketField);

export type TicketField = z.infer<typeof ticketField>;

export type TicketFieldsResult =
  { ok: true; fields: TicketField[] } | { ok: false; error: FreshdeskError };

/** `deadline` (epoch ms) is the caller's: see `requestWithRetry`. */
export async function listTicketFields(
  http: HttpClient,
  deadline?: number,
): Promise<TicketFieldsResult> {
  const result = await http.requestWithRetry({ path: "/ticket_fields" }, deadline);
  if (!result.ok) return result;
  const parsed = ticketFields.safeParse(result.body);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "server",
        http_status: result.status,
        message: `Freshdesk sent ticket fields in an unexpected shape (HTTP ${result.status}).`,
        retryable: false,
      },
    };
  }
  return { ok: true, fields: parsed.data };
}
