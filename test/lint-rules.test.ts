// Proves the eslint bans of RFC 2026-11-23 rules 3-4, the src/tools/**
// blocks (a tool imports only its allow-list, eslint.tool-imports.json) and
// the core fences (RFC 2026-11-25-write-safety-core) fire:
// a wrong glob or pattern in eslint.config.mjs would otherwise pass unnoticed,
// because no committed file breaks them.
import { readdirSync } from "node:fs";
import { join, matchesGlob, posix, relative, sep } from "node:path";
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
  const T3 = "src/tools/toolsets/write/x.ts";
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
        [T3, toolImports.places.T3],
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

  // T-071: a write tool gets its entry point from the wiring, never from src/core.
  it.each([
    "../../../core/write-path.js",
    "../../../core/resources.js",
    "../../../schema/input.js",
    "../../../client/http.js",
  ])("refuses in src/tools/toolsets/write/x.ts a value or type import of %s", async (spec) => {
    expect(await verdict(value(spec), T3)).toEqual(["list"]);
    expect(await verdict(type(spec), T3)).toEqual(["list"]);
  });

  it("refuses a re-export of the client", async () => {
    expect(await verdict('export { HttpClient } from "../../../client/http.js";', T2)).toEqual([
      "list",
    ]);
  });

  // RFC 2026-11-25-write-safety-core, invariant 1 (T-064): the core holds the
  // one client; only src/tools/context.ts, which builds the context, imports it.
  it("lists no src/core path for any place", () => {
    // An entry resolved from its place's directory (a glob's fixed part):
    // `./core/index.js` in src/tools/toolsets/ is the toolset, not src/core.
    // A non-relative entry (zod, node:path) is not a path: skipped.
    const resolveAt = (glob: string, spec: string) =>
      spec.startsWith(".") ? posix.join(glob.slice(0, glob.lastIndexOf("/")), spec) : null;
    // The directory is cut at the last `/`, right only for a glob whose `*`
    // are in its last segment: a `**` would put `../core/` elsewhere.
    const starStar = (glob: string) => glob.includes("**");
    // Bare entries apply at every depth, so none may be a path at all.
    const pathLike = (spec: string) => /^[./]/.test(spec);
    const inCore = (path: string) => path === "src/core" || path.startsWith("src/core/");

    expect(places.flatMap((p) => p.files).filter(starStar)).toEqual([]);
    expect(bare.filter(pathLike)).toEqual([]);
    const resolved = places.flatMap((p) =>
      p.files.flatMap((glob) =>
        [...p.value, ...(p.type ?? [])].flatMap((spec) => resolveAt(glob, spec) ?? []),
      ),
    );
    expect(resolved.length).toBeGreaterThan(0);
    expect(resolved.filter(inCore)).toEqual([]);
    // Raw entries too: an absolute or file: entry is not resolved above.
    const raw = places.flatMap((p) => [...p.value, ...(p.type ?? [])]);
    expect([...bare, ...raw, ...resolved].filter((spec) => spec.includes("src/core"))).toEqual([]);

    // The checks can fail: an entry for the core from a place's glob, a `**`
    // place glob, a relative bare entry; and a non-relative entry is skipped.
    expect(resolveAt("src/tools/toolsets/core/*.ts", "../../../core/notify.js")).toBe(
      "src/core/notify.js",
    );
    expect(inCore("src/core/notify.js")).toBe(true);
    expect(inCore("src/tools/toolsets/core/x.js")).toBe(false);
    expect(starStar("src/tools/**/*.ts")).toBe(true);
    expect(starStar("src/tools/*.ts")).toBe(false);
    expect(["../core/notify.js", "./x.js", "/abs.js"].filter(pathLike)).toHaveLength(3);
    expect(["zod", "node:path", "@modelcontextprotocol/server"].filter(pathLike)).toEqual([]);
    expect(resolveAt("src/tools/*.ts", "node:path")).toBeNull();
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

  it.each([[T2, "../../../client/resources/agents.js"]])(
    "allows in %s a value import of %s",
    async (filePath, spec) => {
      expect(await verdict(value(spec), filePath)).toEqual([]);
    },
  );

  // T-071 review: context.ts exports `toolsetsOf`, which holds the write
  // tools; a tool takes the context as a type only, so no tool can call it.
  it.each([
    [T0, "./context.js"],
    [T1, "../context.js"],
    [T2, "../../context.js"],
  ])(
    "refuses in %s a value import of %s (toolsetsOf, createContext): type only",
    async (filePath, spec) => {
      expect(await verdict('import { toolsetsOf } from "' + spec + '";', filePath)).toEqual([
        "type-only",
      ]);
      expect(await verdict(type(spec), filePath)).toEqual([]);
    },
  );

  it("refuses in src/tools/toolsets/write/x.ts any import of the context, value or type", async () => {
    expect(await verdict(value("../../context.js"), T3)).toEqual(["list"]);
    expect(await verdict(type("../../context.js"), T3)).toEqual(["list"]);
  });

  it("puts every file under src/tools in context.ts or in a place (T0 to T3), none ignored", async () => {
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
      'import { createWritePath } from "../core/write-path.js";',
      'import { ticketOutput } from "../schema/output.js";',
      'import { SchemaService } from "../schema/index.js";',
    ].join("\n");
    expect(await ruleIds(code, "src/tools/context.ts")).toEqual([]);
  });

  it("does not reach outside src/tools", async () => {
    const code = [
      'import type { HttpClient } from "./client/http.js";',
      'import { SchemaService } from "./schema/index.js";',
      'void import("./config.js");',
      "void process.env.FRESHDESK_API_KEY;",
    ].join("\n");
    expect(await ruleIds(code, "src/server.ts")).toEqual([]);
  });
});

// T-067 (RFC 2026-11-25-write-safety-core): src/core/resources.ts sends
// writes on the full client, so only the core imports it. The rule covers
// src/** and scripts/**; in src/tools/** the allow-list already refuses it
// (and replaces this rule there), in src/tools/context.ts this rule applies.
describe("eslint: only src/core/** imports src/core/resources", () => {
  const RULE = "@typescript-eslint/no-restricted-imports";
  const MESSAGE =
    "Only src/core/** may import src/core/resources (RFC 2026-11-25-write-safety-core): it sends writes on the full client.";

  async function messages(code: string, filePath: string): Promise<string[]> {
    const [result] = await eslint.lintText(code, { filePath });
    return (
      result.messages
        .filter((m) => m.ruleId === null || BANS.has(m.ruleId))
        // The rule puts its own prefix before the message: the message is the end.
        .map((m) =>
          m.message.endsWith(MESSAGE)
            ? `${m.ruleId}: ${MESSAGE}`
            : `${m.ruleId ?? "fatal"}: ${m.message}`,
        )
    );
  }

  // [file, the specifier that reaches src/core/resources.ts from it]
  const outside: [string, string][] = [
    ["src/server.ts", "./core/resources.js"],
    ["src/cli.ts", "./core/resources.js"],
    ["src/client/x.ts", "../core/resources.js"],
    ["src/client/resources/x.ts", "../../core/resources.js"],
    ["src/schema/x.ts", "../core/resources.js"],
    ["src/tools/context.ts", "../core/resources.js"],
    ["scripts/smoke/write.ts", "../../src/core/resources.js"],
    ["scripts/x.ts", "../src/core/resources.js"],
  ];

  /** Other spellings of the same module that must not pass. */
  function spellings(spec: string): string[] {
    const head = spec.slice(0, spec.lastIndexOf("core/"));
    return [
      spec,
      spec.replace(/\.js$/, ""),
      spec.replace(/\.js$/, ".ts"),
      `${head}core//resources.js`,
      `${head}core/./resources.js`,
      `${head}core/../core/resources.js`,
      `${head}Core/Resources.js`,
      `${spec}/`,
    ];
  }

  const cases = outside.flatMap(([file, spec]) =>
    spellings(spec).map((variant) => [file, variant] as const),
  );

  it.each(cases)("refuses in %s an import of %s, value, type and re-export", async (file, spec) => {
    for (const code of [
      `import { x } from ${JSON.stringify(spec)};`,
      `import type { X } from ${JSON.stringify(spec)};`,
      `import ${JSON.stringify(spec)};`,
      `export * from ${JSON.stringify(spec)};`,
      `export { x } from ${JSON.stringify(spec)};`,
    ]) {
      // context.ts may have no export list (T-077): a re-export there is refused twice.
      const exportList =
        file === "src/tools/context.ts" && code.startsWith("export")
          ? [
              "no-restricted-syntax: No re-export or export list in a module a core fence exempts (RFC 2026-11-25-write-safety-core): it must not pass what it holds on under another name.",
            ]
          : [];
      expect((await messages(code, file)).sort()).toEqual(
        [`${RULE}: ${MESSAGE}`, ...exportList].sort(),
      );
    }
  });

  it.each(outside)("refuses in %s a dynamic import of %s", async (file, spec) => {
    expect(await messages(`void import(${JSON.stringify(spec)});`, file)).toEqual([
      `no-restricted-syntax: ${MESSAGE}`,
    ]);
  });

  // T-080 (RFC 2026-11-26-send-safety-core): the fence is per module, so the
  // send resources sit behind it too; one case per name, the future
  // smoke-send script (T-086) among the files.
  it.each(
    ["postReply", "postForward"].flatMap((name) =>
      [
        ...outside,
        ["scripts/smoke/send.ts", "../../src/core/resources.js"] as [string, string],
      ].map(([file, spec]) => [name, file, spec] as const),
    ),
  )("refuses an import of %s in %s from %s", async (name, file, spec) => {
    expect(await messages(`import { ${name} } from ${JSON.stringify(spec)};`, file)).toEqual([
      `${RULE}: ${MESSAGE}`,
    ]);
    expect(
      await messages(`const { ${name} } = await import(${JSON.stringify(spec)});`, file),
    ).toEqual([`no-restricted-syntax: ${MESSAGE}`]);
  });

  it.each([
    ["src/tools/x.ts", "../core/resources.js"],
    ["src/tools/toolsets/core/x.ts", "../../../core/resources.js"],
  ])("refuses in %s (the allow-list) an import of %s", async (file, spec) => {
    const found = await messages(`import { x } from ${JSON.stringify(spec)};`, file);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(
      /^@typescript-eslint\/no-restricted-imports: .* Not on the import allow-list /,
    );
  });

  it.each([
    ["src/core/write-path.ts", "./resources.js"],
    ["src/core/entries.ts", "./resources.js"],
    ["src/core/sub/x.ts", "../resources.js"],
    ["test/core/resources.test.ts", "../../src/core/resources.js"],
  ])("allows in %s an import of %s", async (file, spec) => {
    expect(await messages(`import { x } from ${JSON.stringify(spec)};`, file)).toEqual([]);
    expect(await messages(`void import(${JSON.stringify(spec)});`, file)).toEqual([]);
  });

  it.each([
    ["src/server.ts", "./core/write-path.js"],
    ["src/tools/context.ts", "../core/write-path.js"],
    ["src/client/x.ts", "./resources/agents.js"],
    ["src/tools/context.ts", "../client/resources/tickets.js"],
    ["scripts/smoke/smoke.ts", "../../src/client/resources/agents.js"],
  ])("leaves in %s an import of %s alone", async (file, spec) => {
    expect(await messages(`import { x } from ${JSON.stringify(spec)};`, file)).toEqual([]);
  });

  it("lints scripts/**: no file under it is ignored", async () => {
    expect(await eslint.isPathIgnored("scripts/smoke/write.ts")).toBe(false);
    expect(await eslint.isPathIgnored("scripts/smoke/smoke.ts")).toBe(false);
  });
});

// T-077 (RFC 2026-11-25-write-safety-core, invariants 1 to 3): outside
// src/core/** nothing builds an HttpClient or a RateLimiter, imports
// ticketInput or (src/tools/context.ts apart) reaches createWritePath, and no
// core module re-exports anything past those rules. In src/tools/** the
// allow-list refuses the imports ("list"); the syntax rules apply there too.
describe("eslint: the client, the limiter, ticketInput and createWritePath stay in the core", () => {
  const IMPORTS = "@typescript-eslint/no-restricted-imports";
  const SYNTAX = "no-restricted-syntax";
  const FENCES = {
    CLIENT:
      "Only src/core/** may build an HttpClient or a RateLimiter (RFC 2026-11-25-write-safety-core, invariant 1): import them as types only.",
    TICKET_INPUT:
      "Only src/core/** and its own module may import ticketInput (RFC 2026-11-25-write-safety-core, invariant 2): the core's table is the one source of an allow set.",
    WRITE_PATH:
      "Outside src/core/**, only src/tools/context.ts may import or call createWritePath (RFC 2026-11-25-write-safety-core, invariant 3): it builds the write side from the team file.",
    REEXPORT:
      "No re-export in src/core/** (RFC 2026-11-25-write-safety-core): a core module must not pass the client, src/core/resources or ticketInput on past the lint fence.",
    EXEMPT_EXPORT:
      "No re-export or export list in a module a core fence exempts (RFC 2026-11-25-write-safety-core): it must not pass what it holds on under another name.",
  } as const;

  /** Each message as `rule: FENCE`, `rule: list` for a tool's allow-list, else as it is. */
  async function messages(code: string, filePath: string): Promise<string[]> {
    const [result] = await eslint.lintText(code, { filePath });
    return result.messages
      .filter((m) => m.ruleId === null || BANS.has(m.ruleId))
      .map((m) => {
        const fence = Object.entries(FENCES).find(([, text]) => m.message.endsWith(text));
        if (fence) return `${m.ruleId}: ${fence[0]}`;
        if (/Not on the import allow-list /.test(m.message)) return `${m.ruleId}: list`;
        return `${m.ruleId ?? "fatal"}: ${m.message}`;
      });
  }
  /** The specifier that reaches `target` (a path from the repo root) from `file`. */
  function specFrom(file: string, target: string): string {
    const spec = posix.relative(posix.dirname(file), target);
    return spec.startsWith(".") ? spec : `./${spec}`;
  }
  /** Other spellings of a specifier that must not pass. */
  const spellings = (spec: string) => [
    spec,
    spec.replace(/\.js$/, ""),
    spec.replace(/\.js$/, ".ts"),
    `${spec}/`,
    spec.replace(/[^/]+$/, (name) => `./${name[0].toUpperCase()}${name.slice(1)}`),
  ];
  /** Every file under src/ and scripts/ outside src/core/, from the repo root. */
  function filesOutsideCore(): string[] {
    const root = join(import.meta.dirname, "..");
    return ["src", "scripts"]
      .flatMap((dir) =>
        readdirSync(join(root, dir), { recursive: true, withFileTypes: true })
          .filter((entry) => entry.isFile())
          .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join("/")),
      )
      .filter((file) => !file.startsWith("src/core/"));
  }
  /** The modules a fence exempts, which may export no list: a re-export there is refused twice. */
  const exportFenced = new Set([
    "src/client/http.ts",
    "src/client/rate-limit.ts",
    "src/schema/input.ts",
    "scripts/smoke/smoke.ts",
    "src/tools/context.ts",
  ]);
  const plusExport = (file: string, code: string, verdict: string) =>
    code.startsWith("export") && exportFenced.has(file)
      ? [verdict, `${SYNTAX}: EXEMPT_EXPORT`].sort()
      : [verdict];
  const inTools = (file: string) =>
    file.startsWith("src/tools/") && file !== "src/tools/context.ts";

  describe("HttpClient and RateLimiter", () => {
    const HTTP = "src/client/http.js";
    const LIMITER = "src/client/rate-limit.js";
    const EXEMPT = ["src/client/http.ts", "src/client/rate-limit.ts", "scripts/smoke/smoke.ts"];
    const outside = [
      "src/server.ts",
      "src/cli.ts",
      "src/client/x.ts",
      "src/client/resources/x.ts",
      "src/schema/x.ts",
      "src/tools/context.ts",
      "scripts/x.ts",
      "scripts/smoke/core.ts",
    ];
    const cases = outside.flatMap((file) =>
      (
        [
          ["HttpClient", HTTP],
          ["RateLimiter", LIMITER],
        ] as const
      ).flatMap(([name, target]) =>
        spellings(specFrom(file, target)).map((spec) => [file, name, spec] as const),
      ),
    );

    it.each(cases)("refuses in %s a value import of %s from %s", async (file, name, spec) => {
      const from = JSON.stringify(spec);
      for (const code of [
        `import { ${name} } from ${from};`,
        `import { ${name} as Renamed } from ${from};`,
        `import { type Other, ${name} } from ${from};`,
        `import * as all from ${from};`,
        `export { ${name} } from ${from};`,
        `export * from ${from};`,
      ]) {
        expect((await messages(code, file)).sort(), code).toEqual(
          plusExport(file, code, `${IMPORTS}: CLIENT`),
        );
      }
    });

    it.each(cases)("allows in %s a type-only import of %s from %s", async (file, name, spec) => {
      const from = JSON.stringify(spec);
      for (const code of [
        `import type { ${name} } from ${from};`,
        `import { type ${name} } from ${from};`,
        `import type * as all from ${from};`,
        `import { other } from ${from};`,
      ]) {
        expect(await messages(code, file), code).toEqual([]);
      }
    });

    it.each(
      [...outside, "src/tools/x.ts", "src/tools/toolsets/core/x.ts"].flatMap((file) =>
        ["new HttpClient({});", "new RateLimiter({});", "new all.HttpClient({});"].map(
          (code) => [file, code] as const,
        ),
      ),
    )("refuses in %s: %s", async (file, code) => {
      expect(await messages(code, file)).toEqual([`${SYNTAX}: CLIENT`]);
    });

    it.each(cases)(
      "refuses in %s a literal dynamic import of %s from %s",
      async (file, _, spec) => {
        const code = `void import(${JSON.stringify(spec)});`;
        expect(await messages(code, file)).toEqual([`${SYNTAX}: CLIENT`]);
      },
    );

    // SmokeClient extends HttpClient: its prototype chain reaches the full client.
    it.each(outside.filter((file) => file !== "scripts/smoke/smoke.ts"))(
      "refuses in %s an import of SmokeClient",
      async (file) => {
        const from = JSON.stringify(specFrom(file, "scripts/smoke/smoke.js"));
        for (const code of [
          `import { SmokeClient } from ${from};`,
          `import * as smoke from ${from};`,
        ]) {
          expect(await messages(code, file), code).toEqual([`${IMPORTS}: CLIENT`]);
        }
        expect(await messages(`void import(${from});`, file)).toEqual([`${SYNTAX}: CLIENT`]);
        expect(await messages(`import { main } from ${from};`, file)).toEqual([]);
      },
    );

    it.each(EXEMPT)("exempts %s", async (file) => {
      const code = [
        `import { HttpClient } from ${JSON.stringify(specFrom(file, HTTP))};`,
        `import { RateLimiter } from ${JSON.stringify(specFrom(file, LIMITER))};`,
        "new HttpClient({ limiter: new RateLimiter({}) });",
      ].join("\n");
      expect(await messages(code, file)).toEqual([]);
    });

    it("exempts exactly those files: every other file under src/ and scripts/ is refused", async () => {
      const files = [
        ...filesOutsideCore(),
        "src/client/http2.ts",
        "src/client/rate-limit2.ts",
        "scripts/smoke/smoke2.ts",
        "scripts/smoke.ts",
      ];
      expect(files).toEqual(expect.arrayContaining(EXEMPT));
      const exempt: string[] = [];
      for (const file of files) {
        const code = [
          `import { HttpClient } from ${JSON.stringify(specFrom(file, HTTP))};`,
          "new HttpClient({});",
        ].join("\n");
        const found = await messages(code, file);
        if (found.length === 0) exempt.push(file);
        else
          expect(found, file).toEqual([
            `${IMPORTS}: ${inTools(file) ? "list" : "CLIENT"}`,
            `${SYNTAX}: CLIENT`,
          ]);
      }
      expect(exempt.sort()).toEqual([...EXEMPT].sort());
    });

    it.each(["src/core/write-path.ts", "src/core/x.ts", "test/client/http.test.ts"])(
      "leaves %s alone",
      async (file) => {
        const code = [
          `import { HttpClient } from ${JSON.stringify(specFrom(file, HTTP))};`,
          `import * as limits from ${JSON.stringify(specFrom(file, LIMITER))};`,
          "new HttpClient({ limiter: new limits.RateLimiter({}) });",
        ].join("\n");
        expect(await messages(code, file)).toEqual([]);
      },
    );
  });

  describe("ticketInput", () => {
    const INPUT = "src/schema/input.js";
    const outside = [
      "src/server.ts",
      "src/schema/index.ts",
      "src/schema/x.ts",
      "src/client/resources/x.ts",
      "src/tools/context.ts",
      "scripts/x.ts",
      "scripts/smoke/smoke.ts",
    ];
    const cases = outside.flatMap((file) =>
      spellings(specFrom(file, INPUT)).map((spec) => [file, spec] as const),
    );

    it.each(cases)("refuses in %s an import of ticketInput from %s", async (file, spec) => {
      const from = JSON.stringify(spec);
      for (const code of [
        `import { ticketInput } from ${from};`,
        `import { ticketInput as build } from ${from};`,
        `import * as input from ${from};`,
        `export { ticketInput } from ${from};`,
        `export * from ${from};`,
      ]) {
        expect((await messages(code, file)).sort(), code).toEqual(
          plusExport(file, code, `${IMPORTS}: TICKET_INPUT`),
        );
      }
    });

    it.each(cases)("refuses in %s a literal dynamic import of %s", async (file, spec) => {
      const code = `void import(${JSON.stringify(spec)});`;
      expect(await messages(code, file)).toEqual([`${SYNTAX}: TICKET_INPUT`]);
    });

    it("exempts exactly src/schema/input.ts: every other file under src/ and scripts/ is refused", async () => {
      const exempt: string[] = [];
      for (const file of filesOutsideCore()) {
        const code = `import { ticketInput } from ${JSON.stringify(specFrom(file, INPUT))};`;
        const found = await messages(code, file);
        if (found.length === 0) exempt.push(file);
        else
          expect(found, file).toEqual([`${IMPORTS}: ${inTools(file) ? "list" : "TICKET_INPUT"}`]);
      }
      expect(exempt).toEqual(["src/schema/input.ts"]);
    });

    it.each(cases)("allows in %s the module's other names from %s", async (file, spec) => {
      const from = JSON.stringify(spec);
      expect(await messages(`import { type FieldSet, other } from ${from};`, file)).toEqual([]);
    });

    it.each([
      ["src/tools/x.ts", "list"],
      ["src/tools/toolsets/core/x.ts", "list"],
    ])("refuses in %s (the allow-list) an import of ticketInput", async (file, verdict) => {
      const code = `import { ticketInput } from ${JSON.stringify(specFrom(file, INPUT))};`;
      expect(await messages(code, file)).toEqual([`${IMPORTS}: ${verdict}`]);
    });

    it.each([
      "src/schema/input.ts",
      "src/core/write-path.ts",
      "src/core/x.ts",
      "test/schema/x.test.ts",
    ])("leaves %s alone", async (file) => {
      const from = JSON.stringify(specFrom(file, INPUT));
      for (const code of [`import { ticketInput } from ${from};`, `import * as i from ${from};`]) {
        expect(await messages(code, file), code).toEqual([]);
      }
    });
  });

  describe("exports of the modules a fence exempts", () => {
    const exempt = [
      "src/client/http.ts",
      "src/client/rate-limit.ts",
      "src/schema/input.ts",
      "scripts/smoke/smoke.ts",
    ];

    it.each(
      exempt.flatMap((file) =>
        [
          "class HttpClient {}\nexport { HttpClient as Client };",
          "function ticketInput() {}\nexport { ticketInput as build };",
          'export { x } from "./other.js";',
          'export * from "./other.js";',
        ].map((code) => [file, code] as const),
      ),
    )("refuses in %s: %s", async (file, code) => {
      expect(await messages(code, file)).toEqual([`${SYNTAX}: EXEMPT_EXPORT`]);
    });

    it.each(exempt)("allows in %s a declaration and a type export list", async (file) => {
      const code = "export class C {}\ntype T = 1;\nexport type { T };";
      expect(await messages(code, file)).toEqual([]);
    });
  });

  describe("re-exports in src/core/**", () => {
    const core = ["src/core/write-path.ts", "src/core/x.ts", "src/core/sub/x.ts"];

    it.each(
      core.flatMap((file) =>
        [
          'export { HttpClient } from "../client/http.js";',
          'export { ticketInput as build } from "../schema/input.js";',
          'export * from "./resources.js";',
          'export * as resources from "./resources.js";',
          'export type { X } from "./x.js";',
          'import { ticketInput } from "../schema/input.js";\nexport { ticketInput };',
          "const a = 1;\nexport { a as b };",
          "const a = 1;\nexport type { a };",
        ].map((code) => [file, code] as const),
      ),
    )("refuses in %s: %s", async (file, code) => {
      expect(await messages(code, file)).toEqual([`${SYNTAX}: REEXPORT`]);
    });

    it.each(
      [
        "export function f() {}",
        "export const c = 1;",
        "export class C {}",
        "export interface I { a: 1 }",
        "export type T = 1;",
        "export default 1;",
      ].map((code) => ["src/core/x.ts", code] as const),
    )("allows in %s a declaration: %s", async (file, code) => {
      expect(await messages(code, file)).toEqual([]);
    });

    it("leaves re-exports outside src/core/** to the other rules", async () => {
      expect(await messages('export { x } from "./format.js";', "src/server.ts")).toEqual([]);
      expect(
        await messages('export * from "../../format.js";', "src/tools/toolsets/core/x.ts"),
      ).toEqual([]);
    });
  });

  describe("createWritePath", () => {
    const WRITE_PATH = "src/core/write-path.js";
    const outside = [
      "src/server.ts",
      "src/cli.ts",
      "src/client/x.ts",
      "src/schema/x.ts",
      "src/tools/other.ts",
      "scripts/x.ts",
      "scripts/smoke/smoke.ts",
    ];
    const cases = outside
      .filter((file) => !inTools(file))
      .flatMap((file) =>
        spellings(specFrom(file, WRITE_PATH)).map((spec) => [file, spec] as const),
      );

    it.each(cases)("refuses in %s an import of createWritePath from %s", async (file, spec) => {
      const from = JSON.stringify(spec);
      for (const code of [
        `import { createWritePath } from ${from};`,
        `import { createWritePath as build } from ${from};`,
        `import * as writePath from ${from};`,
        `export { createWritePath } from ${from};`,
      ]) {
        expect((await messages(code, file)).sort(), code).toEqual(
          plusExport(file, code, `${IMPORTS}: WRITE_PATH`),
        );
      }
    });

    it.each(cases)("refuses in %s a literal dynamic import of %s", async (file, spec) => {
      const code = `void import(${JSON.stringify(spec)});`;
      expect(await messages(code, file)).toEqual([`${SYNTAX}: WRITE_PATH`]);
    });

    it.each(cases)("allows in %s a type import from %s", async (file, spec) => {
      const code = `import type { WritePath } from ${JSON.stringify(spec)};`;
      expect(await messages(code, file)).toEqual([]);
    });

    it.each(
      outside.flatMap((file) =>
        ["createWritePath({});", "writePath.createWritePath({});"].map(
          (code) => [file, code] as const,
        ),
      ),
    )("refuses in %s a call: %s", async (file, code) => {
      expect(await messages(code, file)).toEqual([`${SYNTAX}: WRITE_PATH`]);
    });

    it("refuses an import in a tool (the allow-list)", async () => {
      const file = "src/tools/other.ts";
      const code = `import { createWritePath } from ${JSON.stringify(specFrom(file, WRITE_PATH))};`;
      expect(await messages(code, file)).toEqual([`${IMPORTS}: list`]);
    });

    it("lets every file but src/tools/context.ts outside src/core/** be refused", async () => {
      const importers: string[] = [];
      for (const file of filesOutsideCore()) {
        const code = [
          `import { createWritePath } from ${JSON.stringify(specFrom(file, WRITE_PATH))};`,
          "createWritePath({});",
        ].join("\n");
        const found = await messages(code, file);
        if (found.length === 0) importers.push(file);
        else
          expect(found, file).toEqual([
            `${IMPORTS}: ${inTools(file) ? "list" : "WRITE_PATH"}`,
            `${SYNTAX}: WRITE_PATH`,
          ]);
      }
      expect(importers).toEqual(["src/tools/context.ts"]);
    });

    it.each([
      'export { createWritePath } from "../core/write-path.js";',
      'import { createWritePath } from "../core/write-path.js";\nexport { createWritePath as build };',
      'import { createWritePath as cwp } from "../core/write-path.js";\nexport { cwp };',
      'import * as wp from "../core/write-path.js";\nexport { wp };',
      'export * from "../core/write-path.js";',
      'export * as writePath from "../core/write-path.js";',
    ])("refuses in src/tools/context.ts a re-export: %s", async (code) => {
      expect(await messages(code, "src/tools/context.ts")).toEqual([`${SYNTAX}: EXEMPT_EXPORT`]);
    });

    it.each(["src/tools/context.ts", "src/core/x.ts", "test/core/entries.test.ts"])(
      "leaves %s alone",
      async (file) => {
        const from = JSON.stringify(specFrom(file, WRITE_PATH));
        const code = [
          `import { createWritePath } from ${from};`,
          `import * as writePath from ${from};`,
          "createWritePath({});",
          "writePath.createWritePath({});",
        ].join("\n");
        expect(await messages(code, file)).toEqual([]);
      },
    );
  });
});
