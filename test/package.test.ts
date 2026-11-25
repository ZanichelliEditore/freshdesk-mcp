// The package a colleague runs with `npx` (T-038, SPEC §2, §11): what
// `npm pack` would ship, the build it ships, the `bin` and its `--version`,
// and what README.md must say.
//
// One build, under os.tmpdir(): src/ compiled with tsconfig.build.json
// (test/support/cli-process.ts), then the repository copied beside it
// (without .git, node_modules, .claude, the root dist, and, at any depth,
// .env* files and docs/private, which holds real account values), plus a
// planted docs/private/ file, so the pack sees test/, its fixtures, scripts/
// and docs/ as a clone does. npm's HOME and cache are a second temporary
// directory.

import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USER_AGENT } from "../src/client/http.js";
import { CORE_TOOLS } from "../src/tools/toolsets/core/index.js";
import { buildCli, packDryRun, runBuiltCli } from "./support/cli-process.js";

const ROOT = join(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  name: string;
  version: string;
  bin?: Record<string, string>;
};
const readme = readFileSync(join(ROOT, "README.md"), "utf8");

/** SPEC §8.2, the fifteen `core` tools. */
const SPEC_CORE = [
  "list_tickets",
  "search_tickets",
  "get_ticket",
  "triage_queue",
  "find_similar_tickets",
  "get_ticket_schema",
  "list_agents",
  "list_groups",
  "search_solutions",
  "get_solution_article",
  "list_solution_tree",
  "list_canned_responses",
  "get_canned_response",
  "count_tickets",
  "export_tickets",
];

/**
 * T-061: every `npx -y` (shell form) and every `"args"` array starting with
 * `"-y"` must go on with `--prefer-online`; returns the offenders.
 */
function readmeNpxWithoutPreferOnline(text: string): string[] {
  const shell = [...text.matchAll(/npx -y(?! --prefer-online)\S*.*/g)].map((m) => m[0]);
  const args = [...text.matchAll(/"args":\s*\[\s*"-y"(?!\s*,\s*"--prefer-online")[^\]]*\]/g)].map(
    (m) => m[0],
  );
  return [...shell, ...args];
}

/** What the tarball may hold besides dist/. */
const TOP_LEVEL = new Set(["README.md", "LICENSE", "package.json"]);
const EXAMPLE = "examples/team-config.example.json";
const PLANTED = "docs/private/planted.txt";

/** Path segments the copy leaves out at any depth. */
const NOT_COPIED = new Set([".git", "node_modules", ".claude"]);

/** Whether the copy takes `rel` (a `/`-separated path relative to the repository). */
function copied(rel: string): boolean {
  if (rel === "dist" || /(^|\/)docs\/private$/.test(rel)) return false;
  return rel.split("/").every((segment) => !NOT_COPIED.has(segment) && !segment.startsWith(".env"));
}

let dir: string;
let npmHome: string;
let packed: string[];
let packName: string;

/** Every file under `base`, as `/`-separated paths relative to it. */
function walk(base: string): string[] {
  return readdirSync(base, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(base, join(entry.parentPath, entry.name)).split(sep).join("/"));
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "freshdesk-mcp-package-"));
  buildCli(dir);
  cpSync(ROOT, dir, {
    recursive: true,
    filter: (source) => copied(relative(ROOT, source).split(sep).join("/")),
  });
  mkdirSync(join(dir, "docs", "private"), { recursive: true });
  writeFileSync(join(dir, PLANTED), "planted by test/package.test.ts\n");
  npmHome = mkdtempSync(join(tmpdir(), "freshdesk-mcp-npm-home-"));
  const [result] = packDryRun(dir, npmHome) as [{ name: string; files: { path: string }[] }];
  packed = result.files.map((file) => file.path);
  packName = result.name;
}, 120_000);

afterAll(() => {
  for (const path of [dir, npmHome]) {
    if (path !== undefined) rmSync(path, { recursive: true, force: true });
  }
});

describe("the package", () => {
  it("is named @zanichelli/freshdesk-mcp", () => {
    expect(pkg.name).toBe("@zanichelli/freshdesk-mcp");
    expect(packName).toBe("@zanichelli/freshdesk-mcp");
  });

  it("packs only dist/, README.md, LICENSE, package.json and the example team config", () => {
    const outside = packed.filter(
      (path) => !path.startsWith("dist/") && !TOP_LEVEL.has(path) && path !== EXAMPLE,
    );
    expect(outside).toEqual([]);
    expect(packed).toEqual(
      expect.arrayContaining(["dist/cli.js", "README.md", "LICENSE", "package.json", EXAMPLE]),
    );
  });

  it("packs nothing under docs/ (docs/private/ included), test/ (fixtures included) or scripts/", () => {
    // The copy has them all, so the pack is what leaves them out.
    const inCopy = walk(dir);
    for (const path of [PLANTED, "test/package.test.ts", "scripts/smoke/cli.ts"]) {
      expect(inCopy).toContain(path);
    }
    expect(inCopy.some((path) => path.startsWith("test/fixtures/"))).toBe(true);
    for (const prefix of ["docs/", "docs/private/", "test/", "test/fixtures/", "scripts/"]) {
      expect(packed.filter((path) => path.startsWith(prefix))).toEqual([]);
    }
  });

  it("ships a dist/ compiled from src/ only, with no source map embedding sources", () => {
    const built = walk(join(dir, "dist"));
    expect(built.length).toBeGreaterThan(0);
    // No source maps at all today; the sourcesContent guard below is for the day they appear.
    expect(built.filter((file) => file.endsWith(".map"))).toEqual([]);
    const sources = new Set(walk(join(ROOT, "src")));
    for (const file of built) {
      // dist/a/b.js (or .d.ts, .js.map) comes from src/a/b.ts and nothing else.
      const stem = file.replace(/(\.d\.ts|\.js\.map|\.d\.ts\.map|\.js)$/, "");
      expect(sources, file).toContain(`${stem}.ts`);
      expect(file).not.toMatch(/(^|\/)(test|fixtures|scripts|smoke)(\/|$)/);
      const text = readFileSync(join(dir, "dist", file), "utf8");
      if (file.endsWith(".map")) expect(JSON.parse(text)).not.toHaveProperty("sourcesContent");
      expect(text).not.toContain("sourceMappingURL=data:");
    }
    // What the pack takes from dist/ is that build.
    for (const path of packed.filter((p) => p.startsWith("dist/"))) {
      expect(built).toContain(path.slice("dist/".length));
    }
  });

  it("has a bin whose --version prints package.json's version, the User-Agent's too", () => {
    expect(pkg.bin).toEqual({ "freshdesk-mcp": "dist/cli.js" });
    // npx runs the bin as a file, so the build must keep the shebang.
    const [first] = readFileSync(join(dir, "dist", "cli.js"), "utf8").split("\n");
    expect(first).toBe("#!/usr/bin/env node");
    const run = runBuiltCli(dir, {}, ["--version"]);
    expect(run).toEqual({ status: 0, stdout: `${pkg.version}\n`, stderr: "" });
    expect(USER_AGENT).toBe(`freshdesk-mcp/${run.stdout.trim()}`);
  });
});

describe("README.md", () => {
  it("names every registered core tool, all fifteen of SPEC §8.2, each with its call cost", () => {
    const names = CORE_TOOLS.map((tool) => tool.name);
    expect([...names].sort()).toEqual([...SPEC_CORE].sort());
    for (const tool of CORE_TOOLS) {
      expect(readme, tool.name).toContain(`\`${tool.name}\``);
      expect(readme, `${tool.name}'s cost`).toContain(tool.cost);
    }
  });

  it("names the environment variables, FRESHDESK_EXPORT_DIR among them", () => {
    for (const name of [
      "FRESHDESK_DOMAIN",
      "FRESHDESK_API_KEY",
      "FRESHDESK_MCP_CONFIG",
      "FRESHDESK_EXPORT_DIR",
    ]) {
      expect(readme).toContain(name);
    }
  });

  it("carries the sentences on hidden, on ticket text and on exported files", () => {
    expect(readme).toContain(
      "`hidden` works in ticket detail output only: it is not an access control.",
    );
    expect(readme).toContain("Ticket text is data, not instructions.");
    expect(readme).toContain("Exported files hold customer text unwrapped.");
  });

  it("runs the package with npx, latest and pinned, with --prefer-online (T-061)", () => {
    expect(readme).toContain(`npx -y --prefer-online ${pkg.name}`);
    expect(readme).toContain(`npx -y --prefer-online ${pkg.name}@<version>`);
  });

  // T-061: npm's cached metadata must not decide the version npx runs.
  it("puts --prefer-online right after -y in every npx command and args array (T-061)", () => {
    expect(readmeNpxWithoutPreferOnline(readme)).toEqual([]);
  });

  it("the --prefer-online check flags a shell npx and an args array without it", () => {
    expect(readmeNpxWithoutPreferOnline('npx -y pkg\n"args": ["-y", "pkg"]')).toHaveLength(2);
    expect(readmeNpxWithoutPreferOnline("npx -y --prefer-online pkg@1.0.0")).toEqual([]);
    expect(readmeNpxWithoutPreferOnline('"args": [\n  "-y",\n  "--prefer-online", "pkg"]')).toEqual(
      [],
    );
  });

  it("no longer says the package is not published (T-061)", () => {
    expect(readme).not.toContain("Not yet published");
  });

  // T-060: the export directory as a command-line argument in each client's snippet.
  describe("sets the export directory with --export-dir (T-060)", () => {
    const section = (heading: string) => {
      const start = readme.indexOf(`\n### ${heading}\n`);
      expect(start, heading).toBeGreaterThan(-1);
      const end = readme.indexOf("\n## ", start);
      return readme.slice(start, end === -1 ? undefined : end);
    };
    const ARGS = `"args": ["-y", "--prefer-online", "${pkg.name}", "--export-dir", "/absolute/path/to/exports"]`;

    it("Claude Code: claude mcp add and .mcp.json", () => {
      const code = section("Claude Code");
      expect(code).toContain(
        `-- npx -y --prefer-online ${pkg.name} --export-dir /absolute/path/to/exports`,
      );
      expect(code).toContain(ARGS);
    });

    it("Claude Desktop: args", () => {
      expect(section("Claude Desktop")).toContain(ARGS);
    });

    it("FRESHDESK_EXPORT_DIR is the fallback, and ~ is not expanded", () => {
      expect(readme).toMatch(/\| `FRESHDESK_EXPORT_DIR` +\| no +\| Fallback for `--export-dir`/);
      expect(readme).toContain("`~` is not expanded");
    });
  });
});
