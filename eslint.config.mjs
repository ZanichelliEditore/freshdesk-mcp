// Flat config. The toolchain is pinned in package.json (npm ci installs it).
// test/lint-rules.test.ts proves the two RFC blocks and the src/tools/** block below fire.
import tseslint from "typescript-eslint";

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

const noToolInternals =
  "A tool takes the context (src/tools/context.ts): it may import the config, the client and the schema modules as types only.";

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
  {
    // A tool takes the context (src/tools/context.ts), never the config, the
    // client, the schema service or ticketOutput on its own: types only.
    files: ["src/tools/**"],
    ignores: ["src/tools/context.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // `config` anchored with ../ so a tool-local ./config.js passes.
              group: [
                "../config",
                "../../config",
                "../../../config",
                "**/src/config",
                "**/client/http",
                "**/schema/output",
                "**/schema/index",
              ].flatMap((name) => [name, `${name}.js`, `${name}.ts`]),
              allowTypeImports: true,
              message: noToolInternals,
            },
            {
              // A specifier not in its shortest form, which the globs above
              // let through: `./../x`, `a/./x`, `name/../x`; and any `//`,
              // `\`, `%`, `?` or `#`, which the globs do not see through.
              // Refuses the forms test/lint-rules.test.ts lists, no more: a
              // segment starting with a dot followed by `..`
              // (`../.x/../config.js`) still reaches `config` (PLAN, the
              // proposed allow-list row of 2026-11-23). `.constructor` on the
              // client or the schema service is not refused by lint.
              regex: "^\\./\\.\\.(/|$)|/\\./|(^|/)[^/.][^/]*/\\.\\.(/|$)|//|\\\\|%|\\?|#",
              message:
                "Write the import path in its shortest form: no `.` or `name/..` segment, no `//`, `\\`, `%`, `?` or `#`.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression",
          message: `No dynamic import() in a tool. ${noToolInternals}`,
        },
      ],
    },
  },
);
