// Schema service (SPEC §7.3): the ticket fields, plus agents and groups as
// id → name maps, loaded together and kept for a TTL in seconds the caller
// gives (the team config's `limits.schema_ttl_s`, default 1 h, wired in
// src/tools/context.ts).
//
//   - One load per TTL: the TTL runs from the moment the load started. Calls
//     made while a load is in flight share it. A clock that went back before
//     the load started counts as expired.
//   - Every caller gets the same schema, so it is read-only: typed so, and
//     frozen deep. The name maps are a `FrozenMap`, which has no method
//     that changes it, since freezing a Map does not stop its `set`.
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

/**
 * A read-only view of a Map. The Map is a private field: a caller that casts
 * the view to `Map` finds no `set`, and `Map.prototype.set` refuses it.
 */
export class FrozenMap<K, V> implements ReadonlyMap<K, V> {
  readonly #map: Map<K, V>;

  constructor(entries: Iterable<readonly [K, V]>) {
    this.#map = new Map(entries);
  }

  get size(): number {
    return this.#map.size;
  }

  get(key: K): V | undefined {
    return this.#map.get(key);
  }

  has(key: K): boolean {
    return this.#map.has(key);
  }

  forEach(callback: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown): void {
    this.#map.forEach((value, key) => {
      callback.call(thisArg, value, key, this);
    });
  }

  entries(): MapIterator<[K, V]> {
    return this.#map.entries();
  }

  keys(): MapIterator<K> {
    return this.#map.keys();
  }

  values(): MapIterator<V> {
    return this.#map.values();
  }

  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.#map.entries();
  }
}

// The class and its prototype too: no one swaps `get` for every view.
Object.freeze(FrozenMap.prototype);
Object.freeze(FrozenMap);

export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

export type SchemaResult = { ok: true; schema: Schema } | { ok: false; error: FreshdeskError };

export class SchemaService {
  private cached?: { schema: Schema; loadedAt: number };
  private inFlight?: Promise<SchemaResult>;

  readonly #http: HttpClient;

  constructor(
    http: HttpClient,
    private readonly ttlS: number,
  ) {
    this.#http = http;
  }

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
    const fields = await listTicketFields(this.#http);
    if (!fields.ok) return fields;
    const agents = await listAgents(this.#http);
    if (!agents.ok) return agents;
    const groups = await listGroups(this.#http);
    if (!groups.ok) return groups;

    const schema: Schema = deepFreeze({
      fields: fields.fields,
      agents: {
        names: new FrozenMap(agents.items.map((agent) => [agent.id, agent.contact.name] as const)),
        truncated: agents.truncated,
      },
      groups: {
        names: new FrozenMap(groups.items.map((group) => [group.id, group.name] as const)),
        truncated: groups.truncated,
      },
    });
    this.cached = { schema, loadedAt: startedAt };
    return { ok: true, schema };
  }
}
