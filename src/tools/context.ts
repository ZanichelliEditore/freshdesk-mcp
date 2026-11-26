// App context (SPEC §7.3, §10): the one place a `Config` becomes the objects
// the tools work with. A tool takes the context, never the config.
//
//   - The write path (src/core/write-path.ts; RFC 2026-11-25-write-safety-core,
//     invariant 1) builds the one client on the one limiter, from the team
//     `limits`, and keeps it. The context holds only its GET-only view:
//     `http` refuses any method but GET, in the type and at runtime, with
//     nothing sent. It also gets the team `toolsets`, so its write entries
//     exist only with `write`.
//   - The write tools (T-071): with entries, this module builds the `write`
//     toolset from them through its wiring (src/tools/toolsets/write/
//     index.ts), which hands each tool its own entry. The send tools (T-084)
//     likewise: with the write path's `sends` (present only with `send`,
//     RFC 2026-11-26-send-safety-core, OD-25), the `send` toolset through
//     src/tools/toolsets/send/index.ts. The tools are not on
//     the context, which every handler receives: they are kept in a module
//     WeakMap keyed by the context, and `toolsetsOf(context)` gives
//     `createServer` (src/server.ts) the registry's toolsets plus `write`
//     and `send` when the context has them. No context, no entries: a
//     context built without `write` has no write tools, and one without
//     `send` no send tools, by construction. No module under
//     src/tools/ can call `toolsetsOf`: every place in
//     eslint.tool-imports.json lists this module as a type import only, the
//     write and send tools' places not at all (test/lint-rules.test.ts).
//   - One schema service on that view, its TTL `limits.schema_ttl_s`.
//   - The team settings (`team`): field meanings, limits, toolsets. They are
//     the context's own frozen copy, and the context object is frozen: a
//     later change to the `Config` changes nothing here.
//   - The limiter is not on the context: a tool meets it only through
//     `http`, whose refusals come back as `rate_limited`. The view and the
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
//     the view or the service, which reaches the class, or on any
//     function; a computed property on globalThis; a global `require`, if a
//     build ever exposed one (createRequire from node:module is not listed,
//     so it is refused as an import); a re-export through a module
//     outside src/tools/; a symlink under src/tools/ or under a listed path.
//     src/core/ is on no place's list (RFC 2026-11-25-write-safety-core,
//     invariant 1): this file is the one under src/tools/ that imports it.
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
import type { GetHttp } from "../client/http.js";
import type { Config, TeamConfig } from "../config.js";
import { createWritePath } from "../core/write-path.js";
import { deepFreeze, type Schema, SchemaService } from "../schema/index.js";
import { ticketOutput } from "../schema/output.js";
import { TOOLSETS, type Toolsets } from "./toolsets/index.js";
import { sendTools } from "./toolsets/send/index.js";
import { writeTools } from "./toolsets/write/index.js";

export interface AppContext {
  /** The write path's GET-only view (src/core/write-path.ts), never the client. */
  readonly http: GetHttp;
  readonly schema: SchemaService;
  readonly team: TeamConfig;
  /** `--export-dir`, else FRESHDESK_EXPORT_DIR, as set (unchecked); `undefined` when unset. */
  readonly exportDir: string | undefined;
  /** `ticketOutput` (src/schema/output.ts) with the team's `fields`. */
  ticketOutput(schema: Schema, ticket: Record<string, unknown>): Record<string, unknown>;
}

/** Each context's `write` and `send` tools, built from its own write path's entries. */
const BUILT_TOOLS = new WeakMap<AppContext, Toolsets>();

export function createContext(config: Config, dispatcher: Dispatcher): AppContext {
  const team = deepFreeze(structuredClone(config.team));
  const path = createWritePath({
    domain: config.domain,
    apiKey: config.apiKey,
    ...(config.hostOverride === undefined ? {} : { hostOverride: config.hostOverride }),
    dispatcher,
    limits: team.limits,
    toolsets: team.toolsets,
    forwardAllowList: team.forward_allow_list,
  });
  const http = path.view;
  const context: AppContext = Object.freeze({
    http,
    schema: new SchemaService(http, team.limits.schema_ttl_s),
    team,
    exportDir: config.exportDir,
    ticketOutput: (schema: Schema, ticket: Record<string, unknown>) =>
      ticketOutput(schema, ticket, team.fields),
  });
  BUILT_TOOLS.set(
    context,
    Object.freeze({
      ...(path.entries === undefined ? {} : { write: writeTools(path.entries) }),
      ...(path.sends === undefined ? {} : { send: sendTools(path.sends) }),
    }),
  );
  return context;
}

/** The registry's toolsets, plus `write` and `send` when this context was built with them. */
export function toolsetsOf(context: AppContext): Toolsets {
  const built = BUILT_TOOLS.get(context);
  return built === undefined ? TOOLSETS : Object.freeze({ ...TOOLSETS, ...built });
}
