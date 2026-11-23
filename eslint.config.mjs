// Flat config. The toolchain is pinned in package.json (npm ci installs it).
// test/lint-rules.test.ts proves the two RFC blocks and the src/tools/** blocks below fire.
import tseslint from "typescript-eslint";
import toolImports from "./eslint.tool-imports.json" with { type: "json" };

// RFC 2026-11-23, rule 4: tests reach HTTP only through the mock helper.
// The RFC names undici, http, https, net and tls; http2, dgram, dns and
// child_process (spawning curl) are other ways out of the process.
const networkModules = [
  "undici",
  "http",
  "https",
  "http2",
  "net",
  "tls",
  "dgram",
  "dns",
  "child_process",
].flatMap((name) => (name === "undici" ? [name] : [name, `node:${name}`]));
const noNetworkInTests =
  "Tests must not open real connections (RFC 2026-11-23 rule 4): use test/support/mock-dispatcher.ts.";
const noGlobalFetch = "Use undici's fetch with the injected dispatcher (RFC 2026-11-23 rule 3).";

// A tool takes the context (src/tools/context.ts), never the config, the client,
// the schema service or ticketOutput on its own. In src/tools/** (context.ts
// exempt) the source of every import and re-export must be exactly one entry
// of eslint.tool-imports.json for the file's place: `T0` src/tools/*.ts, `T1`
// src/tools/toolsets/*.ts, `T2` src/tools/toolsets/core/*.ts; a file anywhere
// else under src/tools/ gets the bare list only (zod,
// @modelcontextprotocol/server, node:path, node:fs/promises, node:crypto).
// Everything else is refused, whatever its form: `value` entries in any form,
// `type` entries (the config, the schema service, ...) as types only. A
// source with leading or trailing whitespace is refused too (the rule trims
// it before matching), and so is any dynamic import().
//
// Adding a module is one line in eslint.tool-imports.json, made by the task
// that first needs it, in its own diff, and reviewed like any other change.
//
// Not refused by lint: createRequire from node:module is not listed, so it is
// refused as an import, but a global `require`, if a build ever exposed one,
// is not; a re-export through a module outside src/tools/ (a listed module
// that re-exports the config); a symlink under src/tools/ or under a listed
// path; `.constructor` on the client or the schema service, which reaches the
// class. test/lint-rules.test.ts proves the list's behaviour.
const noToolInternals =
  "A tool takes the context (src/tools/context.ts): it may import only the entries of eslint.tool-imports.json for its place.";
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exactly = (specifiers) => `(?:${specifiers.map(escapeRegex).join("|")})$`;

/** The rule for one place: anything off its list refused, its `type` entries as types only. */
function allowList({ files, value, type = [] }) {
  const where = files.join(", ");
  const patterns = [
    {
      regex: `^(?!${exactly([...toolImports.bare.value, ...value, ...type])})`,
      caseSensitive: true,
      message: `Not on the import allow-list for ${where} (eslint.tool-imports.json). Adding an entry is one line there, reviewed like any other change.`,
    },
  ];
  if (type.length > 0) {
    patterns.push({
      regex: `^${exactly(type)}`,
      caseSensitive: true,
      allowTypeImports: true,
      message: `Type only: ${where} may import this with \`import type\` (eslint.tool-imports.json).`,
    });
  }
  return { "@typescript-eslint/no-restricted-imports": ["error", { patterns }] };
}

const moduleSources = [
  "ImportDeclaration > Literal.source",
  "ExportNamedDeclaration > Literal.source",
  "ExportAllDeclaration > Literal.source",
  "TSExternalModuleReference > Literal.expression",
];
const toolImportBlocks = [
  {
    files: toolImports.bare.files,
    ignores: ["src/tools/context.ts"],
    rules: {
      ...allowList(toolImports.bare),
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression",
          message: `No dynamic import() in a tool. ${noToolInternals}`,
        },
        {
          selector: `:matches(${moduleSources.join(", ")})[value=/^\\s|\\s$/]`,
          message: `No whitespace at either end of an import source. ${noToolInternals}`,
        },
      ],
    },
  },
  ...Object.values(toolImports.places).map((place) => ({
    files: place.files,
    ignores: ["src/tools/context.ts"],
    rules: allowList(place),
  })),
];

const noGlobalFetchRules = {
  "no-restricted-globals": ["error", { name: "fetch", message: noGlobalFetch }],
  "no-restricted-properties": [
    "error",
    { object: "globalThis", property: "fetch", message: noGlobalFetch },
    { object: "global", property: "fetch", message: noGlobalFetch },
  ],
};

export default tseslint.config(
  ...tseslint.configs.recommended,
  { ignores: ["dist/", "node_modules/", "**/*.gen.*"] },
  {
    // RFC 2026-11-23, rule 3: src/ sends only through undici's fetch with an injected dispatcher.
    files: ["src/**"],
    rules: noGlobalFetchRules,
  },
  {
    files: ["test/**"],
    ignores: ["test/support/mock-dispatcher.ts", "test/setup.ts"],
    rules: {
      ...noGlobalFetchRules,
      "no-restricted-imports": [
        "error",
        {
          paths: networkModules.map((name) => ({ name, message: noNetworkInTests })),
          patterns: [
            { group: networkModules.map((name) => `${name}/*`), message: noNetworkInTests },
            {
              group: ["**/cli", "**/cli.js", "**/cli.ts"],
              message:
                "Tests must not import cli.ts, which builds the real Agent (RFC 2026-11-23 rule 2).",
            },
          ],
        },
      ],
    },
  },
  ...toolImportBlocks,
);
