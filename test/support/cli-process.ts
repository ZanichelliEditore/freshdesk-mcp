// The one file under test/ that may start a process (eslint.config.mjs exempts
// it from the child_process ban by path, and from nothing else; RFC
// 2026-11-23, Review, note of 2026-11-24). It runs Node on two scripts only:
// `tsc`, to build src/ into a directory under os.tmpdir(), and that build's
// `cli.js`, which no test may import (rule 2). The cli runs with no API key
// and no host override: an env carrying either is refused before anything
// is spawned, so the process can never reach Freshdesk.
import { execFileSync, spawnSync } from "node:child_process";
import { realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const REFUSED_ENV = ["FRESHDESK_API_KEY", "FRESHDESK_HOST_OVERRIDE"];

/** `dir`, real path, when it is strictly inside os.tmpdir(); throws otherwise. */
function underTmp(dir: string): string {
  const real = realpathSync(dir);
  const rel = relative(realpathSync(tmpdir()), real);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`cli-process: ${dir} is not a directory under os.tmpdir().`);
  }
  return real;
}

/**
 * Build src/ (tsconfig.build.json) into `<dir>/dist`, with the repository's
 * node_modules linked and a `{"type":"module"}` package.json beside it, so
 * the build loads as it does from the package. `dir` must be under os.tmpdir().
 */
export function buildCli(dir: string): void {
  const out = underTmp(dir);
  execFileSync(
    process.execPath,
    [
      join(ROOT, "node_modules", "typescript", "bin", "tsc"),
      "-p",
      "tsconfig.build.json",
      "--outDir",
      join(out, "dist"),
    ],
    { cwd: ROOT, stdio: "pipe" },
  );
  symlinkSync(join(ROOT, "node_modules"), join(out, "node_modules"), "dir");
  writeFileSync(join(out, "package.json"), '{"type":"module"}\n');
}

export interface CliRun {
  status: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Run `<dir>/dist/cli.js` (from `buildCli`) with exactly `env` and an empty
 * stdin. Throws, spawning nothing, when `dir` is not under os.tmpdir() or
 * `env` names FRESHDESK_API_KEY or FRESHDESK_HOST_OVERRIDE (even empty).
 */
export function runBuiltCli(dir: string, env: Record<string, string>): CliRun {
  const refused = REFUSED_ENV.filter((name) => Object.hasOwn(env, name));
  if (refused.length > 0) {
    throw new Error(`cli-process: the cli runs without ${refused.join(" and ")}.`);
  }
  const out = underTmp(dir);
  const run = spawnSync(process.execPath, [join(out, "dist", "cli.js")], {
    env,
    input: "",
    encoding: "utf8",
    timeout: 20_000,
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}
