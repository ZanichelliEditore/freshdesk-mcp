// Flat config. The toolchain is pinned in package.json (npm ci installs it).
import tseslint from "typescript-eslint";

// RFC 2026-11-23, rule 4: tests reach HTTP only through the mock helper.
const networkModules = [
  "undici",
  "node:http",
  "node:https",
  "node:net",
  "node:tls",
  "http",
  "https",
  "net",
  "tls",
];
const noNetworkInTests =
  "Tests must not open real connections (RFC 2026-11-23 rule 4): use test/support/mock-dispatcher.ts.";

export default tseslint.config(
  ...tseslint.configs.recommended,
  { ignores: ["dist/", "node_modules/", "**/*.gen.*"] },
  {
    // RFC 2026-11-23, rule 3: src/ sends only through undici's fetch with an injected dispatcher.
    files: ["src/**"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message: "Use undici's fetch with the injected dispatcher (RFC 2026-11-23 rule 3).",
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "globalThis",
          property: "fetch",
          message: "Use undici's fetch (RFC 2026-11-23 rule 3).",
        },
        {
          object: "global",
          property: "fetch",
          message: "Use undici's fetch (RFC 2026-11-23 rule 3).",
        },
      ],
    },
  },
  {
    files: ["test/**"],
    ignores: ["test/support/mock-dispatcher.ts", "test/setup.ts"],
    rules: {
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
