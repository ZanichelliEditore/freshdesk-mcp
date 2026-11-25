// Agents (SPEC §7.3): `GET /agents`, every page, for the schema service's
// id → name map. An agent's name is on its contact.
//
// An agent needs a whole-number `id` and a `contact` with a non-empty `name`;
// keys this module does not know are passed through. Paging and the malformed
// page error: see `list-all.ts`.

import { z } from "zod";
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
