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
//     patch a prototype or read `process.env`.
//   - Lint (eslint.config.mjs; the list is eslint.tool-imports.json, not
//     repeated here): in src/tools/** (this file exempt) an import or
//     re-export source must be an entry of that list for the file's place,
//     its `type` entries as types only; any dynamic import() is refused. In
//     all of src/tools/**, this file included, the global `process` (so
//     `process.env` and `process.getBuiltinModule`), eval, `new Function`
//     and implied eval are refused. Not refused by lint: `.constructor` on
//     the client or the service, which reaches the class, or on any
//     function; a computed property on globalThis; a global `require`, if a
//     build ever exposed one (createRequire from node:module is not listed,
//     so it is refused as an import); a re-export through a module
//     outside src/tools/; a symlink under src/tools/ or under a listed path.
//   - `ticketOutput` with the team `fields` already given.
//   - `exportDir`: the personal export directory as set (`--export-dir`, else
//     FRESHDESK_EXPORT_DIR), `undefined` when unset; `export_tickets` checks
//     it when it runs.
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
  /** `--export-dir`, else FRESHDESK_EXPORT_DIR, as set (unchecked); `undefined` when unset. */
  readonly exportDir: string | undefined;
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
    exportDir: config.exportDir,
    ticketOutput: (schema: Schema, ticket: Record<string, unknown>) =>
      ticketOutput(schema, ticket, team.fields),
  });
}
