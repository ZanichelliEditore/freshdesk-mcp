#!/usr/bin/env node
// Entry point (SPEC §7): serves the MCP server on stdio; the package's `bin`.
//
//   - `--version` prints the version on stdout and exits, reading no
//     environment and starting nothing.
//   - While serving, stdout carries protocol frames only: nothing here writes
//     to it, the HTTP client logs to stderr (SPEC §9).
//   - The one place the real undici `Agent` is built (RFC 2026-11-23, rule
//     2), with explicit timeouts and the default `maxHeaderSize`
//     (docs/improvements.md, `2a0e56c` (1), `6d4013a` (2)). No test imports
//     this file: test/server.test.ts spawns the build of it.
//   - A configuration problem (environment, team file, a toolset this
//     version does not have) is found before serving: its message goes to
//     stderr and the exit code is 1. Any other start error prints one fixed
//     line, never its text.

import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { Agent } from "undici";
import { ConfigError, loadConfig } from "./config.js";
import { createServer } from "./server.js";
import { type AppContext, createContext } from "./tools/context.js";
import { VERSION } from "./version.js";

/** Each phase of one request; `http.ts` also cuts an attempt off at 10 s. */
const TIMEOUT_MS = 10_000;

function start(): AppContext | undefined {
  try {
    const config = loadConfig(process.env);
    const agent = new Agent({
      connectTimeout: TIMEOUT_MS,
      headersTimeout: TIMEOUT_MS,
      bodyTimeout: TIMEOUT_MS,
    });
    const context = createContext(config, agent);
    // Built once here so a bad toolset or tool stops the start, not the first request.
    createServer(context);
    return context;
  } catch (err) {
    const message =
      err instanceof ConfigError ? err.message : "could not start (unexpected error).";
    process.stderr.write(`freshdesk-mcp: ${message}\n`);
    return undefined;
  }
}

if (process.argv[2] === "--version") {
  process.stdout.write(`${VERSION}\n`);
} else {
  const context = start();
  if (context === undefined) {
    process.exitCode = 1;
  } else {
    serveStdio(() => createServer(context), {
      onerror: (error) => process.stderr.write(`freshdesk-mcp: transport error (${error.name}).\n`),
    });
  }
}
