// Flat config. The toolchain is pinned in package.json (npm ci installs it).
// test/lint-rules.test.ts proves the two RFC blocks, the core-resources block and the src/tools/** blocks below fire.
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
/** The test/** import ban over `modules`, plus cli.ts. */
const testImportBan = (modules) => [
  "error",
  {
    paths: modules.map((name) => ({ name, message: noNetworkInTests })),
    patterns: [
      { group: modules.map((name) => `${name}/*`), message: noNetworkInTests },
      {
        group: ["**/cli", "**/cli.js", "**/cli.ts"],
        message:
          "Tests must not import cli.ts, which builds the real Agent (RFC 2026-11-23 rule 2).",
      },
    ],
  },
];
const noGlobalFetch = "Use undici's fetch with the injected dispatcher (RFC 2026-11-23 rule 3).";

const noGlobalFetchRules = {
  "no-restricted-globals": ["error", { name: "fetch", message: noGlobalFetch }],
  "no-restricted-properties": [
    "error",
    { object: "globalThis", property: "fetch", message: noGlobalFetch },
    { object: "global", property: "fetch", message: noGlobalFetch },
  ],
};

// A tool takes the context (src/tools/context.ts), never the config, the client,
// the schema service or ticketOutput on its own. In src/tools/** (context.ts
// exempt) the source of every import and re-export must be exactly one entry
// of eslint.tool-imports.json for the file's place; that file is the list and
// names the places. Everything else is refused, whatever its form: `value`
// entries in any form, `type` entries as types only. A source with whitespace
// at either end is refused too (the rule trims it before matching), and so is
// any dynamic import().
//
// Adding a module is one line in eslint.tool-imports.json, made by the task
// that first needs it, in its own diff, and reviewed like any other change.
//
// In all of src/tools/** (context.ts included, which needs none of them) the
// global `process` (so `process.env`, which holds the API key, and
// `process.getBuiltinModule`, which reaches any built-in with no import),
// `globalThis.process`, `global.process`, eval, `new Function` and implied
// eval are refused.
//
// Not refused by lint: createRequire from node:module is not listed, so it is
// refused as an import, but a global `require`, if a build ever exposed one,
// is not; a re-export through a module outside src/tools/ (a listed module
// that re-exports the config); a symlink under src/tools/ or under a listed
// path; `.constructor` on the client or the schema service, which reaches the
// class, or on any function, which reaches Function; a computed property on
// globalThis (`globalThis["pro" + "cess"]`). test/lint-rules.test.ts proves
// the rest.
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
const noProcess =
  "No `process` in src/tools/**: it holds the API key (process.env) and every built-in (process.getBuiltinModule).";
const toolImportBlocks = [
  {
    files: ["src/tools/**"],
    // no-implied-eval finds these only as declared globals.
    languageOptions: {
      globals: { setTimeout: "readonly", setInterval: "readonly", setImmediate: "readonly" },
    },
    rules: {
      // These two replace the src/** options, so they repeat the fetch ban.
      "no-restricted-globals": [
        ...noGlobalFetchRules["no-restricted-globals"],
        { name: "process", message: noProcess },
      ],
      "no-restricted-properties": [
        ...noGlobalFetchRules["no-restricted-properties"],
        { object: "globalThis", property: "process", message: noProcess },
        { object: "global", property: "process", message: noProcess },
      ],
      "no-eval": "error",
      "no-new-func": "error",
      "no-implied-eval": "error",
    },
  },
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

// RFC 2026-11-25-write-safety-core (T-067): src/core/resources.ts sends writes
// on the full client, so only src/core/** imports it. Refused in the rest of
// src/** and in scripts/**, every spelling that ends in a `core` segment then
// `resources` (an extension, `./`, `//` or `..` between them, any case), as an
// import, a type import, a re-export or a literal dynamic import(). In
// src/tools/** the allow-list blocks below replace this rule and refuse it as
// off-list; src/tools/context.ts, exempt from them, gets this one. Placed
// before them for that reason. Not claimed: an import whose source is not a
// literal, or a symlink.
const coreResources = String.raw`(^|/)core/(.*/)?resources(\.[cm]?[jt]s)?/*$`;
const noCoreResources =
  "Only src/core/** may import src/core/resources (RFC 2026-11-25-write-safety-core): it sends writes on the full client.";
const coreResourcesBlock = {
  files: ["src/**", "scripts/**"],
  ignores: ["src/core/**"],
  rules: {
    "@typescript-eslint/no-restricted-imports": [
      "error",
      { patterns: [{ regex: coreResources, caseSensitive: false, message: noCoreResources }] },
    ],
    "no-restricted-syntax": [
      "error",
      {
        // esquery ends a regex at its first `/`, escaped or not: `\x2F` is one.
        selector: `ImportExpression > Literal.source[value=/${coreResources.replaceAll("/", String.raw`\x2F`)}/i]`,
        message: noCoreResources,
      },
    ],
  },
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
      "no-restricted-imports": testImportBan(networkModules),
    },
  },
  {
    // The one file under test/ that may start a process: Node itself, on the
    // built cli (T-019), and `npm pack --dry-run` offline (T-038; RFC
    // 2026-11-23, notes of 2026-11-24). Exempt from the child_process ban,
    // and from nothing else.
    files: ["test/support/cli-process.ts"],
    rules: {
      "no-restricted-imports": testImportBan(
        networkModules.filter((name) => !name.endsWith("child_process")),
      ),
    },
  },
  coreResourcesBlock,
  ...toolImportBlocks,
);
