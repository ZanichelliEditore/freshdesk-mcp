// Entry point of `make smoke` (scripts/smoke/smoke.ts): builds the real
// Agent, as `cli.ts` does for the server (RFC 2026-11-23, rule 2), so no test
// imports this file (the lint ban on `**/cli.ts` in test/** covers it).
// The report goes to stdout; the client's one line per request to stderr.
// `main` turns any error into one fixed line; closing the Agent cannot add one.
// `--probes` runs T-022's probes instead of the schema report.

import { Agent } from "undici";
import { main } from "./smoke.js";

const agent = new Agent();
const mode = process.argv.includes("--probes") ? "probes" : "report";
process.exitCode = await main(
  process.env,
  agent,
  (line) => {
    process.stdout.write(`${line}\n`);
  },
  mode,
);
await agent.close().catch(() => undefined);
