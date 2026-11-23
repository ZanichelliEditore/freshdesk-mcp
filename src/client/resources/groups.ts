// Groups (SPEC §7.3): `GET /groups`, every page, for the schema service's
// id → name map.
//
// A group needs a whole-number `id` and a non-empty `name`; keys this module
// does not know are passed through. Paging and the malformed page error: see
// `list-all.ts`.

import { z } from "zod";
import type { HttpClient } from "../http.js";
import { listAll, type ListResult } from "./list-all.js";

const group = z.looseObject({
  id: z.number().int(),
  name: z.string().min(1),
});

export type Group = z.infer<typeof group>;

export type GroupsResult = ListResult<Group>;

export function listGroups(http: HttpClient): Promise<GroupsResult> {
  return listAll(http, "/groups", group, "groups");
}
