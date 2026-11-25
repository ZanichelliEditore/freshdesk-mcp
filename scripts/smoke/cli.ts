// Entry point of `make smoke` (scripts/smoke/smoke.ts): builds the real
// Agent, as `cli.ts` does for the server (RFC 2026-11-23, rule 2), so no test
// imports this file (the lint ban on `**/cli.ts` in test/** covers it).
// The report goes to stdout; the client's one line per request to stderr.
// `main` turns any error into one fixed line; closing the Agent cannot add one.
// `--probes` runs T-022's probes instead of the schema report; `--dates`,
// T-055's date probes; `--core`, T-039's run of every `core` tool, its period
// the last `--days N` days (7 when absent); `--order`, T-063's order probe of
// search on the UTC day `--day YYYY-MM-DD` (yesterday when absent or empty).

import { Agent } from "undici";
import { main } from "./smoke.js";

const agent = new Agent();
const argv = process.argv;
// The mode is read from the flags only: a value given to --day or --days
// (`DAY=--core`) never picks another run.
const flags = argv.filter((_, i) => argv[i - 1] !== "--day" && argv[i - 1] !== "--days");
const mode = flags.includes("--core")
  ? "core"
  : flags.includes("--order")
    ? "order"
    : flags.includes("--dates")
      ? "dates"
      : flags.includes("--probes")
        ? "probes"
        : "report";
const at = argv.indexOf("--days");
const days = at === -1 ? undefined : (argv[at + 1] ?? "");
const dayAt = argv.indexOf("--day");
const day = dayAt === -1 ? undefined : (argv[dayAt + 1] ?? "");
process.exitCode = await main(
  process.env,
  agent,
  (line) => {
    process.stdout.write(`${line}\n`);
  },
  mode,
  { ...(days === undefined ? {} : { days }), ...(day === undefined ? {} : { day }) },
);
await agent.close().catch(() => undefined);
