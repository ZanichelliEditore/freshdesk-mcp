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
//   - A load ends within LOAD_DEADLINE_MS, its three lists together: every
//     request carries the one deadline (see `requestWithRetry`), so at it the
//     request in flight is cut and no other is started. The error is the
//     client's: `network`, retryable, or `rate_limited` for a limiter wait
//     that would reach it. Like any failed load, it is not cached.
//   - `attempts` on a loaded result is the requests that load sent, retries
//     included (the three lists' `attempts` added up), for the one call that
//     started the load: what a tool adds to its `api_calls_used`. A call
//     served from the cache, or joining a load in flight, gets 0, so a load's
//     requests are counted once whoever reports them. A failed load reports
//     none, as the lists it reads report none on failure.
//   - Every result handed out is frozen, a failed one with its error: the
//     load's result is shared with the calls that joined it, so the call
//     that started it cannot swap the schema or the error they get.
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

/** Longest one load may take, ticket fields, agents and groups together. */
export const LOAD_DEADLINE_MS = 30_000;

export type SchemaResult =
  { ok: true; schema: Schema; attempts: number } | { ok: false; error: FreshdeskError };

export class SchemaService {
  // Real private members, and the instance frozen at the end of the
  // constructor: a tool's mistake or a cast cannot drop the cache, plant a
  // load or change the TTL (it gets a TypeError). Not claimed: hostile code
  // in the process.
  #cached?: { schema: Schema; loadedAt: number };
  #inFlight?: Promise<SchemaResult>;
  readonly #ttlS: number;
  readonly #http: HttpClient;

  constructor(http: HttpClient, ttlS: number) {
    this.#http = http;
    this.#ttlS = ttlS;
    Object.freeze(this);
  }

  /**
   * The cached schema while its TTL lasts; otherwise a new load. `attempts`
   * is the load's requests for the call that started it, 0 for any other.
   */
  get(): Promise<SchemaResult> {
    const age = this.#cached ? Date.now() - this.#cached.loadedAt : -1;
    if (this.#cached && age >= 0 && age < this.#ttlS * 1000) {
      return Promise.resolve(Object.freeze({ ok: true, schema: this.#cached.schema, attempts: 0 }));
    }
    if (this.#inFlight) {
      return this.#inFlight.then((result) =>
        result.ok ? Object.freeze({ ...result, attempts: 0 }) : result,
      );
    }
    this.#inFlight = this.#load()
      .then(deepFreeze)
      .finally(() => {
        this.#inFlight = undefined;
      });
    return this.#inFlight;
  }

  async #load(): Promise<SchemaResult> {
    const startedAt = Date.now();
    const deadline = startedAt + LOAD_DEADLINE_MS;
    const fields = await listTicketFields(this.#http, deadline);
    if (!fields.ok) return fields;
    // A failed list's `attempts` is dropped: a failed load reports none.
    const agents = await listAgents(this.#http, deadline);
    if (!agents.ok) return { ok: false, error: agents.error };
    const groups = await listGroups(this.#http, deadline);
    if (!groups.ok) return { ok: false, error: groups.error };

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
    this.#cached = { schema, loadedAt: startedAt };
    return { ok: true, schema, attempts: fields.attempts + agents.attempts + groups.attempts };
  }
}
