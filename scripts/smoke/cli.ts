// Entry point of `make smoke` (scripts/smoke/smoke.ts): builds the real
// Agent, as `cli.ts` does for the server (RFC 2026-11-23, rule 2), so no test
// imports this file (the lint ban on `**/cli.ts` in test/** covers it).
// The report goes to stdout; the client's one line per request to stderr.

import { Agent } from "undici";
import { smoke } from "./smoke.js";

const agent = new Agent();
try {
  process.exitCode = await smoke(process.env, agent, (line) => {
    process.stdout.write(`${line}\n`);
  });
} finally {
  await agent.close();
}
