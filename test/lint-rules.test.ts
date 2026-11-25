// Proves the eslint bans of RFC 2026-11-23 rules 3-4, and the src/tools/**
// blocks (a tool imports only its allow-list, eslint.tool-imports.json), fire:
// a wrong glob or pattern in eslint.config.mjs would otherwise pass unnoticed,
// because no committed file breaks them.
import { readdirSync } from "node:fs";
import { join, matchesGlob, relative, sep } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import toolImports from "../eslint.tool-imports.json" with { type: "json" };

const eslint = new ESLint();
// Only the rules under test: the snippets also trip unrelated rules
// (an unused import, a bare expression).
const BANS = new Set([
  "no-restricted-imports",
  "no-restricted-globals",
  "no-restricted-properties",
  "@typescript-eslint/no-restricted-imports",
  "no-restricted-syntax",
  "no-eval",
  "no-new-func",
  "no-implied-eval",
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

  it.each(['import "node:child_process";', 'import { spawn } from "child_process";'])(
    "lets test/support/cli-process.ts, and no other file, start a process: %s",
    async (code) => {
      expect(await ruleIds(code, "test/support/cli-process.ts")).toEqual([]);
      expect(await ruleIds(code, "test/support/other.ts")).toEqual(["no-restricted-imports"]);
    },
  );

  it.each(networkImports.filter((code) => !code.includes("child_process")))(
    "still refuses in test/support/cli-process.ts %s",
    async (code) => {
      expect(await ruleIds(code, "test/support/cli-process.ts")).toEqual(["no-restricted-imports"]);
    },
  );

  it("allows an ordinary import", async () => {
    expect(await ruleIds('import "../../src/client/errors.js";', "test/client/x.test.ts")).toEqual(
      [],
    );
  });
});

describe("eslint: global fetch ban (RFC rule 3)", () => {
  it.each(["src/client/x.ts", "src/tools/x.ts", "src/tools/context.ts", "test/client/x.test.ts"])(
    "refuses it in %s",
    async (filePath) => {
      expect(await ruleIds(globalFetches.join("\n"), filePath)).toEqual([
        "no-restricted-globals",
        "no-restricted-properties",
        "no-restricted-properties",
      ]);
    },
  );
});

describe("eslint: a tool imports only its allow-list (src/tools/**)", () => {
  const RULE = "@typescript-eslint/no-restricted-imports";
  const T0 = "src/tools/x.ts";
  const T1 = "src/tools/toolsets/x.ts";
  const T2 = "src/tools/toolsets/core/x.ts";
  /** Not a listed place: the bare entries only. */
  const TX = "src/tools/core/x.ts";

  interface Place {
    files: string[];
    value: string[];
    type?: string[];
  }
  const places: Place[] = Object.values(toolImports.places);
  const bare: string[] = toolImports.bare.value;
  /**
   * Whether a file is in a place's glob, as ESLint matches it: ESLint matches
   * dotfiles (minimatch `dot: true`), node's matchesGlob does not, so a
   * segment's leading dot is neutralised first.
   */
  const inGlob = (filePath: string, glob: string) =>
    matchesGlob(filePath.replace(/(^|\/)\./g, "$1_"), glob);
  /** The list that applies to a file: its place's, else the bare one. */
  const listFor = (filePath: string): Place =>
    places.find((p) => p.files.some((glob) => inGlob(filePath, glob))) ?? toolImports.bare;

  /**
   * The bans each message is: "list" for the allow-list's own message for the
   * file's place, "type-only" for its type-only message, else the rule id.
   */
  async function verdict(code: string, filePath: string): Promise<string[]> {
    const [result] = await eslint.lintText(code, { filePath });
    const where = listFor(filePath).files.join(", ");
    return result.messages
      .filter((m) => m.ruleId === null || BANS.has(m.ruleId))
      .map((m) => {
        if (m.ruleId === RULE) {
          const listMessage = `Not on the import allow-list for ${where} (eslint.tool-imports.json). Adding an entry is one line there, reviewed like any other change.`;
          if (m.message.endsWith(listMessage)) return "list";
          if (
            m.message.endsWith(
              `Type only: ${where} may import this with \`import type\` (eslint.tool-imports.json).`,
            )
          )
            return "type-only";
        }
        return m.ruleId ?? "fatal";
      });
  }
  // JSON.stringify writes a tab, a backslash or a space into the source as the value itself.
  const value = (spec: string) => `import { x } from ${JSON.stringify(spec)};`;
  const type = (spec: string) => `import type { X } from ${JSON.stringify(spec)};`;

  /** Every entry at its place, with the form it may take: [file, specifier, form]. */
  const entries: [string, string, "value" | "type"][] = [
    ...(
      [
        [T0, toolImports.places.T0],
        [T1, toolImports.places.T1],
        [T2, toolImports.places.T2],
      ] as [string, Place][]
    ).flatMap(([file, place]) => [
      ...[...bare, ...place.value].map(
        (spec) => [file, spec, "value"] as [string, string, "value"],
      ),
      ...(place.type ?? []).map((spec) => [file, spec, "type"] as [string, string, "type"]),
    ]),
    ...bare.map((spec) => [TX, spec, "value"] as [string, string, "value"]),
  ];

  /** The spellings of an entry that must not pass: extra `./`, doubled `/`, trailing `/`, a case change. */
  function variants(spec: string): string[] {
    const last = spec.lastIndexOf("/");
    const [head, tail] = last < 0 ? ["", spec] : [spec.slice(0, last + 1), spec.slice(last + 1)];
    const letter = spec.search(/[a-z]/);
    const out = new Set([
      `./${spec}`,
      `${head}./${tail}`,
      `${spec}/`,
      spec.slice(0, letter) + spec[letter].toUpperCase() + spec.slice(letter + 1),
    ]);
    if (last >= 0) out.add(`${head}/${tail}`);
    return [...out];
  }
  const generated = entries.flatMap(([file, spec, form]) =>
    variants(spec).map((variant) => [file, variant, form] as const),
  );

  it("generates at least four refused spellings per entry", () => {
    expect(entries.length).toBeGreaterThan(0);
    expect(generated.length).toBeGreaterThanOrEqual(entries.length * 4);
  });

  it.each(entries)("allows in %s the entry %s as a %s import", async (filePath, spec, form) => {
    expect(await verdict(form === "value" ? value(spec) : type(spec), filePath)).toEqual([]);
  });

  it.each(generated)("refuses in %s %j as a %s import", async (filePath, spec, form) => {
    expect(await verdict(form === "value" ? value(spec) : type(spec), filePath)).toEqual(["list"]);
  });

  it.each([
    [T0, "..//config.js"],
    [T0, "..\\config.js"],
    [T0, "../%63onfig.js"],
    [T0, "../config.js?x"],
    [T0, "../config.js#x"],
    [T0, "./../config.js"],
    [T0, "../tools/../config.js"],
    [T0, "../.x/../config.js"],
    [T0, "../..x/../config.js"],
    [T0, "../.../../config.js"],
    [T0, "../con\tfig.js"],
    [T0, "/src/config.js"],
    [T0, "file:///src/config.js"],
    [T0, "ms/../../src/./config.js"],
    [T0, "ms/../../%64ist/config.js"],
    [T0, "../client/http.js"],
    [T0, "../schema/output.js"],
    [T0, "../../dist/config.js"],
    [T2, "../../../client/http.js"],
    [T2, "../../../schema/output.js"],
    [T2, "../../../../dist/config.js"],
    [TX, "../../dist/config.js"],
    [TX, "../../../dist/config.js"],
    [TX, "../context.js"],
    // The file write is export_tickets' alone (T-037): the core tools' place only.
    [T0, "node:fs/promises"],
    [T1, "node:fs/promises"],
    [TX, "node:fs/promises"],
    [T2, "node:fs"],
  ])("refuses in %s a value import of %j", async (filePath, spec) => {
    expect(await verdict(value(spec), filePath)).toEqual(["list"]);
  });

  it("refuses a file: URL with a leading space, and its whitespace", async () => {
    expect(await verdict(value(" file:///src/config.js"), T0)).toEqual([
      "list",
      "no-restricted-syntax",
    ]);
  });

  it.each([
    [T0, "../config.js"],
    [T0, "../schema/index.js"],
    [T2, "../../../config.js"],
    [T2, "../../../schema/index.js"],
  ])("refuses in %s a value import of the type entry %s", async (filePath, spec) => {
    expect(await verdict(value(spec), filePath)).toEqual(["type-only"]);
  });

  it.each([
    [T0, 'import type { X } from "../.x/../config.js";'],
    [T0, 'export { x } from "../client/http.js";'],
    [T0, 'export * from "../schema/output.js";'],
  ])("refuses in %s: %s", async (filePath, code) => {
    expect(await verdict(code, filePath)).toEqual(["list"]);
  });

  it.each([
    [T2, 'export { x } from "../../format.js";'],
    [T2, 'export * from "../../list.js";'],
    [T2, 'import { type Schema } from "../../../schema/index.js";'],
  ])("allows in %s: %s", async (filePath, code) => {
    expect(await verdict(code, filePath)).toEqual([]);
  });

  it.each([
    [T2, 'import { x } from " ../../format.js";'],
    [T2, 'export * from "../../list.js ";'],
    [T1, 'import { z } from "zod\\n";'],
    [T2, 'export { x } from " ../../format.js";'],
    [T0, 'import x = require(" ./format.js");'],
  ])("refuses in %s whitespace the rule would trim: %s", async (filePath, code) => {
    expect(await verdict(code, filePath)).toEqual(["no-restricted-syntax"]);
  });

  // T-050's cases, at the places of the task files (one more `../` under toolsets/core).
  it.each(
    (
      [
        [T0, "../config"],
        [T2, "../../../config"],
        [T2, "../../../client/http"],
        [T2, "../../../schema/output"],
        [T2, "../../../schema/index"],
      ] as const
    ).flatMap(([file, name]) => [".js", ".ts", ""].map((ext) => [file, name + ext] as const)),
  )("refuses in %s a value import of %s", async (filePath, spec) => {
    const typeEntry = (listFor(filePath).type ?? []).includes(spec);
    expect(await verdict(value(spec), filePath)).toEqual([typeEntry ? "type-only" : "list"]);
  });

  it.each([
    ["src/tools/a/b/x.ts", "../../../config.js"],
    [T0, "../../src/config.js"],
    [T0, ".././config.js"],
    [T2, "../../../tools/../config.js"],
    [T2, "../../../client//http.js"],
    [T2, "../../../schema//index.js"],
  ])("refuses in %s a value import of %s", async (filePath, spec) => {
    expect(await verdict(value(spec), filePath)).toEqual(["list"]);
  });

  it("refuses a type import of a path that is not an entry", async () => {
    expect(await verdict(type("./../config.js"), T0)).toEqual(["list"]);
  });

  it.each(["../../../client/http.js", "../../../schema/output.js"])(
    "refuses in src/tools/toolsets/core/x.ts even a type import of %s, not on the list",
    async (spec) => {
      expect(await verdict(type(spec), T2)).toEqual(["list"]);
    },
  );

  it("refuses a re-export of the client", async () => {
    expect(await verdict('export { HttpClient } from "../../../client/http.js";', T2)).toEqual([
      "list",
    ]);
  });

  // RFC 2026-11-25-write-safety-core, invariant 1 (T-064): the core holds the
  // one client; only src/tools/context.ts, which builds the context, imports it.
  it("lists no src/core path for any place", () => {
    const listed = [bare, ...places.flatMap((p) => [p.value, p.type ?? []])].flat();
    expect(listed.filter((spec) => /(^|\/)core\/write-path|\.\.\/core\//.test(spec))).toEqual([]);
  });

  it.each([
    [T0, "../core/write-path.js"],
    [T1, "../../core/write-path.js"],
    [T2, "../../../core/write-path.js"],
    [TX, "../../core/write-path.js"],
  ])("refuses in %s an import of %s, value or type", async (filePath, spec) => {
    expect(await verdict(value(spec), filePath)).toEqual(["list"]);
    expect(await verdict(type(spec), filePath)).toEqual(["list"]);
    expect(await verdict(`export * from ${JSON.stringify(spec)};`, filePath)).toEqual(["list"]);
  });

  it.each([
    [T0, "../config.js"],
    [T2, "../../../config.js"],
    [T2, "../../../schema/index.js"],
  ])("allows in %s a type import of %s", async (filePath, spec) => {
    expect(await verdict(type(spec), filePath)).toEqual([]);
  });

  it.each([
    [T2, "../../context.js"],
    [T2, "../../../client/resources/agents.js"],
  ])("allows in %s a value import of %s", async (filePath, spec) => {
    expect(await verdict(value(spec), filePath)).toEqual([]);
  });

  it("puts every file under src/tools in context.ts or in T0, T1 or T2, none ignored", async () => {
    const root = join(import.meta.dirname, "..", "src", "tools");
    const files = readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) =>
        ["src", "tools", ...relative(root, join(entry.parentPath, entry.name)).split(sep)].join(
          "/",
        ),
      );
    expect(files.length).toBeGreaterThan(0);
    const placed = (file: string) =>
      file === "src/tools/context.ts" ||
      places.some((p) => p.files.some((glob) => inGlob(file, glob)));
    expect(files.filter((file) => !placed(file))).toEqual([]);
    // A globally ignored file (`**/*.gen.*`) would escape every block.
    const ignored = [];
    for (const file of files) if (await eslint.isPathIgnored(file)) ignored.push(file);
    expect(ignored).toEqual([]);
  });

  it("refuses an off-list import in a dotfile", async () => {
    expect(await verdict('import "../config.js";', "src/tools/.x.ts")).toEqual(["type-only"]);
  });

  // No way round the list or the context without an import.
  it.each(
    [T0, T2, "src/tools/context.ts"].flatMap((file) =>
      (
        [
          ['process.getBuiltinModule("node:module");', "no-restricted-globals"],
          ['globalThis.process.getBuiltinModule("node:http");', "no-restricted-properties"],
          ['global.process.getBuiltinModule("node:http");', "no-restricted-properties"],
          ["void process.env.FRESHDESK_API_KEY;", "no-restricted-globals"],
          ["const { env } = process;", "no-restricted-globals"],
          ['eval("1");', "no-eval"],
          ['new Function("return 1");', "no-new-func"],
          ['setTimeout("x()", 1);', "no-implied-eval"],
        ] as const
      ).map(([code, rule]) => [file, code, rule] as const),
    ),
  )("refuses in %s: %s", async (filePath, code, rule) => {
    expect(await verdict(code, filePath)).toEqual([rule]);
  });

  it("refuses a dynamic import", async () => {
    expect(await verdict('void import("../../../config.js");', T2)).toEqual([
      "no-restricted-syntax",
    ]);
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
      "void process.env.FRESHDESK_API_KEY;",
    ].join("\n");
    expect(await ruleIds(code, "src/server.ts")).toEqual([]);
  });
});
