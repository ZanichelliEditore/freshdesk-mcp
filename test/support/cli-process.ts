// The one file under test/ that may start a process (eslint.config.mjs exempts
// it from the child_process ban by path, and from nothing else): Node itself,
// on a script the caller names. Used to run the built `cli` entry, which no
// test may import (RFC 2026-11-23, rule 2).
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");

/** Compile src/ (tsconfig.build.json) into `outDir`. */
export function buildInto(outDir: string): void {
  execFileSync(
    process.execPath,
    [
      join(ROOT, "node_modules", "typescript", "bin", "tsc"),
      "-p",
      "tsconfig.build.json",
      "--outDir",
      outDir,
    ],
    { cwd: ROOT, stdio: "pipe" },
  );
}

export interface NodeRun {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Run `node <script>` with exactly `env` and an empty stdin. */
export function runNode(script: string, env: Record<string, string>): NodeRun {
  const run = spawnSync(process.execPath, [script], {
    env,
    input: "",
    encoding: "utf8",
    timeout: 20_000,
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}
