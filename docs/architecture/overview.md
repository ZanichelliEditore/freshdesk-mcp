# Architecture overview

> Brand-new project — only the agent-native scaffolding exists so far. The tooling
> components below are pre-filled (the wizard built them); add the product
> components and dependency rules as real code lands.

## Components

### Tooling & process

- **`AGENTS.md`** — the contract every contributor (human or AI) works from: the navigation map, the command surface, and the four execution principles.
- **`docs/`** — `architecture/` (this map, reflecting the active RFCs) and `rfc/` (the decision lifecycle `proposed/` → `active/` → `superseded/`/`retired/`).
- **`tools/checks/`** — scripts that enforce the RFC/docs conventions mechanically (e.g. keeping each RFC in the folder its Status names).
- **Quality gate** — linters/formatters wired at the pre-commit, command-surface, and CI layers so violations are caught mechanically.
- **CI** (`.github/workflows/`) — the quality gate plus a secrets + dependency scan on every push/PR.

### Product

_TODO: list the application's own components and their responsibilities as they land._

- **`src/client/errors.ts`** — the one normalised error shape (SPEC §7.1): maps an HTTP status or a network failure to seven codes, with a documented fallback.
- **`src/client/rate-limit.ts`** — the rate limiter (SPEC §7.2): a budget read from the response headers, with a reserve for expensive operations, a floor, pacing and the hold after a 429; it owns every wait, bounded at 15 s per call or by the caller's shorter bound, and refuses with `rate_limited`. Called by the HTTP core around every request.
- **`src/client/http.ts`** — the HTTP core (SPEC §7.1): the one send function. Basic auth and UA, `https` on the default port to exactly the configured host (checked at construction and on every URL), redirects not followed, each status mapped to its error code, the limiter acquired before and fed after, stderr limited to method, path template, status and duration, each attempt cut off after 10 s. On top of that one function: `requestWithRetry` (a GET is retried on 429, 5xx and network errors, at most 3 times with backoff; any other method on 429 only, so a write is never applied twice; the whole call ends within 30 s, with a limiter wait that would reach the deadline refused as `rate_limited` and an attempt in flight at it aborted as `network`) and `paginate` (follows `Link` to the caller's cap of pages and items, every page URL through the host check; each page gets its own 30 s; its return value says whether a cap cut the list).
- **`src/client/resources/ticket-fields.ts`** — `listTicketFields` (SPEC §7.3): one `GET /ticket_fields` through `requestWithRetry`, the body checked by a zod schema that passes unknown keys through (choices as a list, a 2- or 3-level tree, status names or ids); a body in any other shape is `server` with the real status and a message that quotes nothing from it.
- **`src/client/resources/agents.ts`, `groups.ts`** — `listAgents`, `listGroups` (SPEC §7.3): every page of `GET /agents` and `GET /groups` (100 per page, at most 10 pages) through `list-all.ts`, which checks each page with a zod schema before asking for the next (an agent's whole-number `id` and non-empty `contact.name`, a group's `id` and `name`; unknown keys passed through); a page in any other shape is `server` with its real status, a message that quotes nothing from it, and no further page asked for; a list the 10-page cap cut comes back with `truncated: true`.
- **`src/config.ts`** — `loadConfig(env)` (SPEC §10): personal settings from the environment (domain, API key, team-file path, custom-domain override), team settings from an optional JSON file under a strict zod schema with defaults; a `ConfigError` names the variable or the file and key path. Example: `examples/team-config.example.json`.

**Runtime stack** ([RFC 2026-11-23](../rfc/active/2026-11-23-adopt-runtime-stack.md)):
Node ≥ 22.19, `zod ^4.2`, `undici ^8`, `@modelcontextprotocol/server ^2`;
tests on `vitest ^5` with undici `MockAgent`. The HTTP client takes its
dispatcher as a required argument and never uses the global `fetch`.

## Dependency rules

_TODO: state which parts may depend on which. Enforce mechanically (e.g. with an
architecture test) once the boundaries stabilize._
