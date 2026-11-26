// The MCP server (SPEC §7, §8.1): built from the toolsets the team file
// enables, and from nothing else: there is no `FRESHDESK_TOOLSETS` variable
// (owner, 2026-11-23), and this module reads no environment.
//
// The toolsets are the registry's (`core`) plus, when the team file enables
// them, `write` and `send`, built by the context from its own write path
// (`toolsetsOf`, src/tools/context.ts; T-071, T-084). A toolset the team file
// enables but the toolsets given do not have is a `ConfigError` naming it,
// thrown before any tool registers.
// A tool without its annotations or call cost throws a `TypeError` from the
// registry (src/tools/toolsets/index.ts). The transport is the caller's:
// `cli.ts` serves stdio, tests the in-memory one.

import { McpServer } from "@modelcontextprotocol/server";
import { ConfigError } from "./config.js";
import { type AppContext, toolsetsOf } from "./tools/context.js";
import { registerTool, type Toolsets } from "./tools/toolsets/index.js";
import { VERSION } from "./version.js";

export const SERVER_INFO = { name: "@zanichelli/freshdesk-mcp", version: VERSION } as const;

/** A server with every tool of the context's enabled toolsets. Throws `ConfigError`, `TypeError`. */
export function createServer(
  context: AppContext,
  toolsets: Toolsets = toolsetsOf(context),
): McpServer {
  const available = Object.keys(toolsets);
  const enabled = [...new Set(context.team.toolsets)].map((name) => {
    const tools = Object.hasOwn(toolsets, name) ? toolsets[name] : undefined;
    if (tools === undefined) {
      throw new ConfigError(
        `The team config's "toolsets" enables "${name}", which this version does not have (it has: ${available.join(", ")}). Remove it from "toolsets".`,
      );
    }
    return tools;
  });
  const server = new McpServer(SERVER_INFO);
  for (const tools of enabled) {
    for (const tool of tools) registerTool(server, tool, context);
  }
  return server;
}
