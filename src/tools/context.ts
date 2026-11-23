// App context (SPEC §7.3, §10): the one place a `Config` becomes the objects
// the tools work with. A tool takes the context, never the config.
//
//   - One limiter, shared by the client: built from the team `limits`.
//   - One schema service on that client, its TTL `limits.schema_ttl_s`.
//   - The team settings (`team`): field meanings, limits, toolsets.
//   - `ticketOutput` with the team `fields` already given, so no tool decides
//     which fields are hidden.
//   - The API key goes to the client and nowhere else: the context has no
//     `config`, `domain` or `apiKey`.
//
// The dispatcher is the caller's (RFC 2026-11-23, rule 2): `cli.ts` passes
// the Agent, tests the mock. A domain the client refuses throws `ConfigError`
// here.

import type { Dispatcher } from "undici";
import { HttpClient } from "../client/http.js";
import { RateLimiter } from "../client/rate-limit.js";
import type { Config, TeamConfig } from "../config.js";
import { type Schema, SchemaService } from "../schema/index.js";
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
  const { team } = config;
  const limiter = new RateLimiter(team.limits);
  const http = new HttpClient({
    domain: config.domain,
    apiKey: config.apiKey,
    ...(config.hostOverride === undefined ? {} : { hostOverride: config.hostOverride }),
    dispatcher,
    limiter,
  });
  return {
    http,
    limiter,
    schema: new SchemaService(http, team.limits.schema_ttl_s),
    team,
    ticketOutput: (schema, ticket) => ticketOutput(schema, ticket, team.fields),
  };
}
