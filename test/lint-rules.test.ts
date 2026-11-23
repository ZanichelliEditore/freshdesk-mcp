// Proves the eslint bans of RFC 2026-11-23 rules 3-4 fire: a wrong glob or
// pattern in eslint.config.mjs would otherwise pass unnoticed, because no
// committed file breaks them.
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint();
// Only the rules under test: the snippets also trip unrelated rules
// (an unused import, a bare expression).
const BANS = new Set([
  "no-restricted-imports",
  "no-restricted-globals",
  "no-restricted-properties",
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
