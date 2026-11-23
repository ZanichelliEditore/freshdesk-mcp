// Proves the eslint bans of RFC 2026-11-23 rules 3-4, and the src/tools/**
// block (a tool takes the context), fire: a wrong glob or
// pattern in eslint.config.mjs would otherwise pass unnoticed, because no
// committed file breaks them.
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint();
// Only the rules under test: the snippets also trip unrelated rules
// (an unused import, a bare expression).
const BANS = new Set([
  "no-restricted-imports",
  "no-restricted-globals",
  "no-restricted-properties",
  "@typescript-eslint/no-restricted-imports",
  "no-restricted-syntax",
]);

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  // A parse error has no ruleId: keep it as "fatal" so it never reads as a pass.
  return result.messages
    .map((m) => m.ruleId ?? "fatal")
    .filter((id) => id === "fatal" || BANS.has(id));
}

const networkImports = [
  'import { Agent } from "undici";',
  'import x from "undici/lib/x";',
  'import "node:http";',
  'import "http";',
  'import "node:https";',
  'import "https";',
  'import "node:http2";',
  'import "node:net";',
  'import "node:tls";',
  'import "tls";',
  'import "node:dgram";',
  'import "node:dns";',
  'import "node:dns/promises";',
  'import "node:child_process";',
  'import "../src/cli.js";',
  'import "../../src/cli.js";',
  'import "../../src/cli.ts";',
];

const globalFetches = ["fetch('https://x.example');", "globalThis.fetch;", "global.fetch;"];

describe("eslint: test/** network import ban (RFC rule 4)", () => {
  it.each(networkImports)("refuses %s", async (code) => {
    expect(await ruleIds(code, "test/client/x.test.ts")).toEqual(["no-restricted-imports"]);
  });

  it.each(["test/support/mock-dispatcher.ts", "test/setup.ts"])("exempts %s", async (filePath) => {
    expect(await ruleIds('import "undici";', filePath)).toEqual([]);
  });

  it("exempts no other file under test/support", async () => {
    expect(await ruleIds('import "undici";', "test/support/other.ts")).toEqual([
      "no-restricted-imports",
    ]);
  });

  it("allows an ordinary import", async () => {
    expect(await ruleIds('import "../../src/client/errors.js";', "test/client/x.test.ts")).toEqual(
      [],
    );
  });
});

describe("eslint: global fetch ban (RFC rule 3)", () => {
  it.each(["src/client/x.ts", "test/client/x.test.ts"])("refuses it in %s", async (filePath) => {
    expect(await ruleIds(globalFetches.join("\n"), filePath)).toEqual([
      "no-restricted-globals",
      "no-restricted-properties",
      "no-restricted-properties",
    ]);
  });
});

describe("eslint: a tool takes the context (src/tools/**)", () => {
  const TOOL = "src/tools/x.ts";
  const CORE = "src/tools/core/x.ts";
  const restricted = ["@typescript-eslint/no-restricted-imports"];
  /** The five modules a tool may name as types only, each from where it is written. */
  const FIVE: [string, string][] = [
    [TOOL, "../config"],
    [CORE, "../../config"],
    [CORE, "../../client/http"],
    [CORE, "../../schema/output"],
    [CORE, "../../schema/index"],
  ];
  /** One id per rule, whatever the number of patterns it matched. */
  const once = async (code: string, filePath: string) => [
    ...new Set(await ruleIds(code, filePath)),
  ];

  it.each(FIVE.flatMap(([file, name]) => [".js", ".ts", ""].map((ext) => [file, name + ext])))(
    "refuses in %s a value import of %s",
    async (filePath, name) => {
      expect(await once(`import { x } from "${name}";`, filePath)).toEqual(restricted);
    },
  );

  it.each([
    ["src/tools/a/b/x.ts", "../../../config.js"],
    [TOOL, "../../src/config.js"],
    [TOOL, "./../config.js"],
    [TOOL, ".././config.js"],
    [TOOL, "../tools/../config.js"],
    [CORE, "../../tools/../config.js"],
  ])("refuses in %s a value import of %s", async (filePath, name) => {
    expect(await once(`import { x } from "${name}";`, filePath)).toEqual(restricted);
  });

  it("puts no file under src/tools deeper than one subfolder", () => {
    const root = join(import.meta.dirname, "..", "src", "tools");
    const files = readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep));
    expect(files.length).toBeGreaterThan(0);
    expect(files.filter((segments) => segments.length > 2)).toEqual([]);
  });

  it.each(FIVE.map(([file, name]) => [file, `${name}.js`]))(
    "allows in %s a type import of %s",
    async (filePath, name) => {
      expect(await ruleIds(`import type { X } from "${name}";`, filePath)).toEqual([]);
    },
  );

  it("allows an inline type import of Schema from the schema service", async () => {
    expect(await ruleIds('import { type Schema } from "../../schema/index.js";', CORE)).toEqual([]);
  });

  it.each([
    [TOOL, "./config.js"],
    [CORE, "./config.js"],
    [CORE, "../context.js"],
    [CORE, "../../client/resources/agents.js"],
  ])("allows in %s a value import of %s", async (filePath, name) => {
    expect(await ruleIds(`import { x } from "${name}";`, filePath)).toEqual([]);
  });

  it("refuses a dynamic import", async () => {
    expect(await once('void import("../../config.js");', CORE)).toEqual(["no-restricted-syntax"]);
  });

  it("exempts src/tools/context.ts", async () => {
    const code = [
      'import { HttpClient } from "../client/http.js";',
      'import { ticketOutput } from "../schema/output.js";',
      'import { SchemaService } from "../schema/index.js";',
    ].join("\n");
    expect(await ruleIds(code, "src/tools/context.ts")).toEqual([]);
  });

  it("does not reach outside src/tools", async () => {
    const code = [
      'import { HttpClient } from "./client/http.js";',
      'import { SchemaService } from "./schema/index.js";',
      'void import("./config.js");',
    ].join("\n");
    expect(await ruleIds(code, "src/server.ts")).toEqual([]);
  });
});
