// Flat config. The toolchain is pinned in package.json (npm ci installs it).
// test/lint-rules.test.ts proves the two RFC blocks below fire.
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
);
