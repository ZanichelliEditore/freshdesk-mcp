// Agents (SPEC §7.3): `GET /agents`, every page, for the schema service's
// id → name map. An agent's name is on its contact.
//
// An agent needs a whole-number `id` and a `contact` with a non-empty `name`;
// keys this module does not know are passed through. Paging and the malformed
// page error: see `list-all.ts`.
//
// `getAgent` (T-067; RFC 2026-11-25-write-safety-core, invariant 4):
// `GET /agents/{id}`, one agent's id, work email and whether it is active,
// for the core's notify lookup (T-069), and nothing else of the record.
//   - Active (OD-14, owner 2026-11-25: an agent not clearly active is
//     refused): Freshdesk's documented agent object marks it in
//     `contact.active` ("Set to true if the agent is verified"), and
//     documents `deactivated` ("True if the agent is deactivated") on service
//     accounts and the availability list. `active` is true only when
//     `contact.active` is the boolean `true` and `deactivated` is absent or
//     the boolean `false`: a flag missing or of another type reads as not
//     active. Not measured on the account (a GET-only probe would settle it).
//   - The email is `contact.email` as sent, a string, or null when null or
//     absent: refusing a null or empty one is the caller's.
//   - A record that is not an object, whose `id` is not the one asked for,
//     with no `contact` object, or an email of another type is `server` with
//     the real status, not retryable, fixed text quoting nothing from the
//     body. An HTTP failure (a 404 is `not_found`) is returned unchanged.
//   - An id that is not a positive safe integer is `validation`,
//     `http_status: null`, with nothing sent. `attempts`: the requests sent,
//     retries included. `deadline` (epoch ms, optional): see
//     `requestWithRetry`.

import { z } from "zod";
import type { FreshdeskError } from "../errors.js";
import type { GetHttp } from "../http.js";
import { listAll, type ListResult } from "./list-all.js";

const agent = z.looseObject({
  id: z.number().int(),
  contact: z.looseObject({ name: z.string().min(1) }),
});

export type Agent = z.infer<typeof agent>;

export type AgentsResult = ListResult<Agent>;

export function listAgents(http: GetHttp, deadline?: number): Promise<AgentsResult> {
  return listAll(http, "/agents", agent, "agents", deadline);
}

const agentRecord = z.looseObject({
  id: z.number().int(),
  deactivated: z.unknown().optional(),
  contact: z.looseObject({
    active: z.unknown().optional(),
    email: z.string().nullish(),
  }),
});

/** What `getAgent` keeps of an agent's record. */
export interface AgentContact {
  id: number;
  email: string | null;
  active: boolean;
}

export type AgentResult =
  | { ok: true; agent: AgentContact; attempts: number }
  | { ok: false; error: FreshdeskError; attempts: number };

export async function getAgent(http: GetHttp, id: number, deadline?: number): Promise<AgentResult> {
  if (!(Number.isSafeInteger(id) && id > 0)) {
    return {
      ok: false,
      error: {
        code: "validation",
        http_status: null,
        message: "Not sent: agent id is not a valid value.",
        retryable: false,
      },
      attempts: 0,
    };
  }
  const result = await http.requestWithRetry({ path: "/agents/{id}", params: { id } }, deadline);
  if (!result.ok) return { ok: false, error: result.error, attempts: result.attempts };
  const parsed = agentRecord.safeParse(result.body);
  if (!parsed.success || parsed.data.id !== id) {
    return {
      ok: false,
      error: {
        code: "server",
        http_status: result.status,
        message: `Freshdesk sent an agent in an unexpected shape (HTTP ${result.status}).`,
        retryable: false,
      },
      attempts: result.attempts,
    };
  }
  const { contact, deactivated } = parsed.data;
  const active = contact.active === true && (deactivated === undefined || deactivated === false);
  return {
    ok: true,
    agent: { id, email: contact.email ?? null, active },
    attempts: result.attempts,
  };
}
