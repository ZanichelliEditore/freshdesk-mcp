// The one file under test/ that may start a process (eslint.config.mjs exempts
// it from the child_process ban by path, and from nothing else; RFC
// 2026-11-23, Review, notes of 2026-11-24). It runs Node on two scripts:
// `tsc`, to build src/ into a directory under os.tmpdir(), and that build's
// `cli.js`, which no test may import (rule 2). The cli runs with no API key
// and no host override: an env carrying either is refused before anything
// is spawned, so the process can never reach Freshdesk. And it runs one npm
// command (T-038): `npm pack --dry-run --json` in a directory under
// os.tmpdir(), offline, with no lifecycle scripts and an env of PATH and
// HOME only.
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
 * Run `<dir>/dist/cli.js` (from `buildCli`) with `args`, exactly `env` and an
 * empty stdin. Throws, spawning nothing, when `dir` is not under os.tmpdir()
 * or `env` names FRESHDESK_API_KEY or FRESHDESK_HOST_OVERRIDE (even empty).
 */
export function runBuiltCli(
  dir: string,
  env: Record<string, string>,
  args: readonly string[] = [],
): CliRun {
  const refused = REFUSED_ENV.filter((name) => Object.hasOwn(env, name));
  if (refused.length > 0) {
    throw new Error(`cli-process: the cli runs without ${refused.join(" and ")}.`);
  }
  const out = underTmp(dir);
  const run = spawnSync(process.execPath, [join(out, "dist", "cli.js"), ...args], {
    env,
    input: "",
    encoding: "utf8",
    timeout: 20_000,
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

/**
 * `npm pack --dry-run --json` in `dir` (under os.tmpdir()), parsed: what npm
 * would put in the tarball, written nowhere. `--ignore-scripts` so no
 * lifecycle script (a `prepack` build, say) runs: the test checks the build
 * it made itself, and stays fast. `--offline` so npm asks no registry.
 */
export function packDryRun(dir: string): unknown {
  const out = underTmp(dir);
  const env: Record<string, string> = {};
  for (const name of ["PATH", "HOME"]) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  const json = execFileSync(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts", "--offline"],
    { cwd: out, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 },
  );
  return JSON.parse(json);
}
