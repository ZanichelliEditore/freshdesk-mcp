// Schema service (SPEC §7.3): the ticket fields, plus agents and groups as
// id → name maps, loaded together and kept for a TTL in seconds the caller
// gives (to be the team config's `limits.schema_ttl_s`, default 1 h; nothing
// wires it yet).
//
//   - One load per TTL: the TTL runs from the moment the load started. Calls
//     made while a load is in flight share it. A clock that went back before
//     the load started counts as expired.
//   - Every caller gets the same schema, so it is read-only: typed so, and
//     frozen deep (the maps are read-only by type only).
//   - A failed load is not cached: its error is returned unchanged and the
//     next call loads again. The lists are read one after the other and the
//     first failure stops the load.
//   - Of an agent only the id and the name are kept: the contact's personal
//     data (email, phone) is dropped here.
//   - `truncated` is carried from the list: an id missing from a truncated
//     list is "not loaded", not "unknown" (see output.ts).

import type { FreshdeskError } from "../client/errors.js";
import type { HttpClient } from "../client/http.js";
import { listAgents } from "../client/resources/agents.js";
import { listGroups } from "../client/resources/groups.js";
import { listTicketFields, type TicketField } from "../client/resources/ticket-fields.js";

export interface NameMap {
  readonly names: ReadonlyMap<number, string>;
  /** The list stopped at its page cap: an id not in `names` may still exist. */
  readonly truncated: boolean;
}

export interface Schema {
  readonly fields: readonly TicketField[];
  readonly agents: NameMap;
  readonly groups: NameMap;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !(value instanceof Map)) {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

export type SchemaResult = { ok: true; schema: Schema } | { ok: false; error: FreshdeskError };

export class SchemaService {
  private cached?: { schema: Schema; loadedAt: number };
  private inFlight?: Promise<SchemaResult>;

  constructor(
    private readonly http: HttpClient,
    private readonly ttlS: number,
  ) {}

  /** The cached schema while its TTL lasts; otherwise a new load. */
  get(): Promise<SchemaResult> {
    const age = this.cached ? Date.now() - this.cached.loadedAt : -1;
    if (this.cached && age >= 0 && age < this.ttlS * 1000) {
      return Promise.resolve({ ok: true, schema: this.cached.schema });
    }
    this.inFlight ??= this.load().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private async load(): Promise<SchemaResult> {
    const startedAt = Date.now();
    const fields = await listTicketFields(this.http);
    if (!fields.ok) return fields;
    const agents = await listAgents(this.http);
    if (!agents.ok) return agents;
    const groups = await listGroups(this.http);
    if (!groups.ok) return groups;

    const schema: Schema = deepFreeze({
      fields: fields.fields,
      agents: {
        names: new Map(agents.items.map((agent) => [agent.id, agent.contact.name])),
        truncated: agents.truncated,
      },
      groups: {
        names: new Map(groups.items.map((group) => [group.id, group.name])),
        truncated: groups.truncated,
      },
    });
    this.cached = { schema, loadedAt: startedAt };
    return { ok: true, schema };
  }
}
