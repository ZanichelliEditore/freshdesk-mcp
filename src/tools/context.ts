// App context (SPEC §7.3, §10): the one place a `Config` becomes the objects
// the tools work with. A tool takes the context, never the config.
//
//   - One limiter, shared by the client: built from the team `limits`.
//   - One schema service on that client, its TTL `limits.schema_ttl_s`.
//   - The team settings (`team`): field meanings, limits, toolsets. They are
//     the context's own frozen copy, and the context object is frozen: a
//     later change to the `Config` changes nothing here. The limiter, the
//     client and the schema service are not frozen (PLAN, the hardening row).
//   - `ticketOutput` with the team `fields` already given.
//   - The API key goes to the client, which keeps it in a private field: the
//     context has no `config`, `domain` or `apiKey`, and the key cannot be
//     read or printed from the context (serialised or inspected, it shows
//     neither the key nor the Authorization header).
//
// The dispatcher is the caller's (RFC 2026-11-23, rule 2): `cli.ts` passes
// the Agent, tests the mock.
//
// Throws `ConfigError` for a domain the client refuses. A `Config` from
// `loadConfig` throws nothing else; one built by hand with `floor_pct` above
// `reserve_pct` gets the limiter's `RangeError`.

import type { Dispatcher } from "undici";
import { HttpClient } from "../client/http.js";
import { RateLimiter } from "../client/rate-limit.js";
import type { Config, TeamConfig } from "../config.js";
import { deepFreeze, type Schema, SchemaService } from "../schema/index.js";
import { ticketOutput } from "../schema/output.js";

export interface AppContext {
  readonly http: HttpClient;
  readonly limiter: RateLimiter;
  readonly schema: SchemaService;
  readonly team: TeamConfig;
  /** `ticketOutput` (src/schema/output.ts) with the team's `fields`. */
  ticketOutput(schema: Schema, ticket: Record<string, unknown>): Record<string, unknown>;
}

export function createContext(config: Config, dispatcher: Dispatcher): AppContext {
  const team = deepFreeze(structuredClone(config.team));
  const limiter = new RateLimiter(team.limits);
  const http = new HttpClient({
    domain: config.domain,
    apiKey: config.apiKey,
    ...(config.hostOverride === undefined ? {} : { hostOverride: config.hostOverride }),
    dispatcher,
    limiter,
  });
  return Object.freeze({
    http,
    limiter,
    schema: new SchemaService(http, team.limits.schema_ttl_s),
    team,
    ticketOutput: (schema: Schema, ticket: Record<string, unknown>) =>
      ticketOutput(schema, ticket, team.fields),
  });
}
