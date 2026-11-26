// Flat config. The toolchain is pinned in package.json (npm ci installs it).
// test/lint-rules.test.ts proves the two RFC blocks, the core fence blocks and the src/tools/** blocks below fire.
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

// RFC 2026-11-25-write-safety-core: the core is the one holder of a client
// that can write and the one source of an allow set. Each fence below is
// import patterns (@typescript-eslint/no-restricted-imports) and syntax
// selectors (no-restricted-syntax) for src/** and scripts/** outside
// src/core/**; a file a fence exempts gets the other fences only. ESLint takes
// a rule's options from the last block that sets it, so every block here sets
// the whole of both rules. In src/tools/** the allow-list blocks (after
// these in the config) replace the import patterns and refuse these modules
// as off-list; their syntax rule carries the client and createWritePath
// selectors.
// src/tools/context.ts, exempt from the allow-list, gets the fences.
//
// - coreResources (T-067): src/core/resources.ts sends writes on the full
//   client. Refused: every spelling that ends in a `core` segment then
//   `resources` (an extension, `./`, `//` or `..` between them, any case), as
//   an import, a type import, a re-export or a literal dynamic import(). Broad
//   on purpose: a future src/tools/toolsets/core/resources.ts is refused too.
// - client (T-077, invariant 1): a value import of HttpClient, RateLimiter or
//   SmokeClient (a subclass of HttpClient), named, aliased, re-exported, or
//   the whole module by `import *`, `export *` or a literal dynamic import(),
//   and `new HttpClient(` or `new RateLimiter(` (also as `ns.HttpClient`).
//   Type imports pass. Exempt: the defining modules and scripts/smoke/smoke.ts
//   (SmokeClient, GET-only by override; docs/improvements.md 4b2a159).
// - ticketInput (T-077, invariant 2): any import of it, or of its module by
//   `import *`, `export *` or a literal dynamic import(). Exempt:
//   src/schema/input.ts, its own module.
// - writePath (T-077, invariant 3): createWritePath builds the write side
//   from the toolsets it is given, so only src/tools/context.ts may import or
//   call it (also as `ns.createWritePath(`, or its module by a literal dynamic
//   import()); that it passes the team file's toolsets holds by inspection.
//   Type imports of the module's other names pass.
//
// An exempt module passes nothing on through a list: the defining modules,
// smoke.ts and context.ts have no re-export and no value export list
// (`export { c }`, `export { x as y }`, `export *`). An exported declaration
// holding the value (`export const c = createWritePath`, `export default`)
// is not claimed, below.
//
// The client, ticketInput and writePath patterns match a module by its last
// segment (`http`, `rate-limit`, `input`, `write-path`, with or without an
// extension or trailing `/`, any case), wherever it lives: a namespace import
// of another module of that name is refused too, which errs closed.
//
// In src/core/** a re-export (`export … from`, `export *`, an `export { … }`
// list, type lists included) is refused, so no core module passes the client,
// src/core/resources or ticketInput on past the fences.
//
// Not claimed: an import whose source is not a literal; a symlink; an exported
// declaration holding the value (`export const c = client`, `export default`);
// `export import x = require(…)`; `.constructor` on a client; a computed
// member (`ns["HttpClient"]`); Reflect.construct.
const lastSegment = (name) => String.raw`(^|/)${name}(\.[cm]?[jt]s)?/*$`;
// esquery ends a regex at its first `/`, escaped or not: `\x2F` is one.
const esqueryRegex = (regex) => `/${regex.replaceAll("/", String.raw`\x2F`)}/i`;
const noCoreResources =
  "Only src/core/** may import src/core/resources (RFC 2026-11-25-write-safety-core): it sends writes on the full client.";
const noClient =
  "Only src/core/** may build an HttpClient or a RateLimiter (RFC 2026-11-25-write-safety-core, invariant 1): import them as types only.";
const noTicketInput =
  "Only src/core/** and its own module may import ticketInput (RFC 2026-11-25-write-safety-core, invariant 2): the core's table is the one source of an allow set.";
const noWritePath =
  "Outside src/core/**, only src/tools/context.ts may import or call createWritePath (RFC 2026-11-25-write-safety-core, invariant 3): it builds the write side from the team file.";
const noCoreReexport =
  "No re-export in src/core/** (RFC 2026-11-25-write-safety-core): a core module must not pass the client, src/core/resources or ticketInput on past the lint fence.";
const noExemptExport =
  "No re-export or export list in a module a core fence exempts (RFC 2026-11-25-write-safety-core): it must not pass what it holds on under another name.";
const coreResources = String.raw`(^|/)core/(.*/)?resources(\.[cm]?[jt]s)?/*$`;
/** A literal dynamic import() of the module named `name` (its last segment). */
const importOf = (name, message) => ({
  selector: `ImportExpression > Literal.source[value=${esqueryRegex(lastSegment(name))}]`,
  message,
});
/** `new X(` and `new ns.X(` for each name. */
const newOf = (names, message) => [
  { selector: `NewExpression[callee.name=/^(${names.join("|")})$/]`, message },
  {
    selector: `NewExpression > MemberExpression.callee[property.name=/^(${names.join("|")})$/]`,
    message,
  },
];
const coreFences = {
  coreResources: {
    patterns: [{ regex: coreResources, caseSensitive: false, message: noCoreResources }],
    syntax: [
      {
        selector: `ImportExpression > Literal.source[value=${esqueryRegex(coreResources)}]`,
        message: noCoreResources,
      },
    ],
  },
  client: {
    patterns: [
      ["http", "HttpClient"],
      ["rate-limit", "RateLimiter"],
      ["smoke", "SmokeClient"],
    ].map(([module, name]) => ({
      regex: lastSegment(module),
      caseSensitive: false,
      importNames: [name],
      allowTypeImports: true,
      message: noClient,
    })),
    syntax: [
      ...newOf(["HttpClient", "RateLimiter"], noClient),
      ...["http", "rate-limit", "smoke"].map((name) => importOf(name, noClient)),
    ],
  },
  ticketInput: {
    patterns: [
      {
        regex: lastSegment("input"),
        caseSensitive: false,
        importNames: ["ticketInput"],
        message: noTicketInput,
      },
    ],
    syntax: [importOf("input", noTicketInput)],
  },
  writePath: {
    patterns: [
      {
        regex: lastSegment("write-path"),
        caseSensitive: false,
        importNames: ["createWritePath"],
        allowTypeImports: true,
        message: noWritePath,
      },
    ],
    syntax: [
      importOf("write-path", noWritePath),
      { selector: 'CallExpression[callee.name="createWritePath"]', message: noWritePath },
      {
        selector: 'CallExpression > MemberExpression.callee[property.name="createWritePath"]',
        message: noWritePath,
      },
    ],
  },
};
// A module a fence exempts (the one defining what the fence guards, the
// recorded exception smoke.ts, and src/tools/context.ts, exempt from
// writePath) has no re-export and no value export list; a type export list
// is harmless. Matching the export list, not a name, covers a name changed
// at the import (`import { createWritePath as c }; export { c }`).
const exemptExports = [
  {
    selector: 'ExportNamedDeclaration[declaration=null][exportKind="value"]',
    message: noExemptExport,
  },
  { selector: "ExportAllDeclaration", message: noExemptExport },
];
/** The fence block for `files`: every fence but those in `except`, then `extra` selectors. */
function fenceBlock(files, { except = [], ignores = [], extra = [] } = {}) {
  const fences = Object.entries(coreFences)
    .filter(([name]) => !except.includes(name))
    .map(([, fence]) => fence);
  fences.push({ patterns: [], syntax: extra });
  return {
    files,
    ignores,
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        { patterns: fences.flatMap((fence) => fence.patterns) },
      ],
      "no-restricted-syntax": ["error", ...fences.flatMap((fence) => fence.syntax)],
    },
  };
}
const coreFenceBlocks = [
  fenceBlock(["src/**", "scripts/**"], { ignores: ["src/core/**"] }),
  fenceBlock(["src/client/http.ts", "src/client/rate-limit.ts", "scripts/smoke/smoke.ts"], {
    except: ["client"],
    extra: exemptExports,
  }),
  fenceBlock(["src/schema/input.ts"], { except: ["ticketInput"], extra: exemptExports }),
  fenceBlock(["src/tools/context.ts"], { except: ["writePath"], extra: exemptExports }),
  {
    files: ["src/core/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        // `export { … }`, with or without `from`: a declaration export has a declaration.
        { selector: "ExportNamedDeclaration[declaration=null]", message: noCoreReexport },
        { selector: "ExportAllDeclaration", message: noCoreReexport },
      ],
    },
  },
];

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
        ...coreFences.client.syntax,
        ...coreFences.writePath.syntax,
      ],
    },
  },
  ...Object.values(toolImports.places).map((place) => ({
    files: place.files,
    ignores: ["src/tools/context.ts"],
    rules: allowList(place),
  })),
];

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
  ...coreFenceBlocks,
  ...toolImportBlocks,
);
