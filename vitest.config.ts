import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // RFC 2026-11-23 rule 4: runs before every test file.
    setupFiles: ["test/setup.ts"],
    // Canary: the setup file must overwrite it (test/setup.test.ts).
    env: { FRESHDESK_CANARY: "must-be-scrubbed" },
  },
});
