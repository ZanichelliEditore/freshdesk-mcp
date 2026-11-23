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

**Runtime stack** ([RFC 2026-11-23](../rfc/active/2026-11-23-adopt-runtime-stack.md)):
Node ≥ 22.19, `zod ^4.2`, `undici ^8`, `@modelcontextprotocol/server ^2`;
tests on `vitest ^5` with undici `MockAgent`. The HTTP client takes its
dispatcher as a required argument and never uses the global `fetch`.

## Dependency rules

_TODO: state which parts may depend on which. Enforce mechanically (e.g. with an
architecture test) once the boundaries stabilize._
