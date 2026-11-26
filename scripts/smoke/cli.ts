// Entry point of `make smoke` (scripts/smoke/smoke.ts): builds the real
// Agent, as `cli.ts` does for the server (RFC 2026-11-23, rule 2), so no test
// imports this file (the lint ban on `**/cli.ts` in test/** covers it).
// The report goes to stdout; the client's one line per request to stderr.
// `main` turns any error into one fixed line; closing the Agent cannot add one.
// `--probes` runs T-022's probes instead of the schema report; `--dates`,
// T-055's date probes; `--core`, T-039's run of every `core` tool, its period
// the last `--days N` days (7 when absent); `--order`, T-063's order probe of
// search on the UTC day `--day YYYY-MM-DD` (yesterday when absent or empty).
// `--write` runs T-075's write smoke (./write.ts) instead, the case and its
// arguments from `--case`, `--tickets`, `--fields` and `--notify`: through
// the write path built from the same configuration as the server, not
// through the smoke's GET-only client.

import { Agent } from "undici";
import { main } from "./smoke.js";
import { runWrite } from "./write.js";

const agent = new Agent();
const argv = process.argv;
// The mode is read from the flags only: a value given to an option that
// takes one (`DAY=--core`, `FIELDS=--write`) never picks another run.
const VALUED = ["--day", "--days", "--case", "--tickets", "--fields", "--notify"];
const flags = argv.filter((_, i) => !VALUED.includes(argv[i - 1] ?? ""));
const valueOf = (name: string) => {
  const at = argv.indexOf(name);
  return at === -1 ? undefined : (argv[at + 1] ?? "");
};
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
const out = (line: string) => {
  process.stdout.write(`${line}\n`);
};
process.exitCode = flags.includes("--write")
  ? await runWrite(process.env, agent, out, {
      case: valueOf("--case"),
      tickets: valueOf("--tickets"),
      fields: valueOf("--fields"),
      notify: valueOf("--notify"),
    })
  : await main(process.env, agent, out, mode, {
      ...(days === undefined ? {} : { days }),
      ...(day === undefined ? {} : { day }),
    });
await agent.close().catch(() => undefined);
