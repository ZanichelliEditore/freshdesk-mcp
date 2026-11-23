// Vitest setup file (RFC 2026-11-23, rule 4, "No real credentials"): runs
// before every test file, so no test can read the real Freshdesk domain or
// API key from the developer's or CI's environment.

export const DUMMY_FRESHDESK_VALUE = "dummy-from-test-setup";

/** Overwrite every `FRESHDESK_*` variable in `env` with a dummy value. */
export function scrubFreshdeskEnv(env: NodeJS.ProcessEnv): void {
  for (const name of Object.keys(env)) {
    if (name.startsWith("FRESHDESK_")) env[name] = DUMMY_FRESHDESK_VALUE;
  }
}

scrubFreshdeskEnv(process.env);
