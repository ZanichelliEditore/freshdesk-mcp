// App context (SPEC §7.3, §10): the one place a `Config` becomes the objects
// the tools work with. A tool takes the context, never the config.
//
//   - One limiter, held by the client alone: built from the team `limits`.
//   - One schema service on that client, its TTL `limits.schema_ttl_s`.
//   - The team settings (`team`): field meanings, limits, toolsets. They are
//     the context's own frozen copy, and the context object is frozen: a
//     later change to the `Config` changes nothing here.
//   - The limiter is not on the context: a tool meets it only through
//     `http`, whose refusals come back as `rate_limited`. The client and the
//     schema service are frozen and keep their state in private fields, so a
//     tool's mistake or a cast cannot re-point the host, swap the limiter or
//     drop the cache. Not claimed: hostile code in the process, which can
//     patch a prototype or read `process.env`; nor `.constructor` on the
//     client or the service, which reaches the class: the lint block for
//     src/tools/** does not refuse it either. That block refuses importing
//     the config, the client and the two schema modules in the forms its
//     tests list; a segment starting with a dot followed by `..`
//     (`../.x/../config.js`) still reaches `config` (PLAN, the proposed
//     allow-list row of 2026-11-23).
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
    schema: new SchemaService(http, team.limits.schema_ttl_s),
    team,
    ticketOutput: (schema: Schema, ticket: Record<string, unknown>) =>
      ticketOutput(schema, ticket, team.fields),
  });
}
