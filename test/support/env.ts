// No side effects: test/setup.ts calls scrubFreshdeskEnv; tests import this
// module, never the setup file, so the canary in test/setup.test.ts goes red
// if the setup file is unwired from vitest.config.ts.

export const DUMMY_FRESHDESK_VALUE = "dummy-from-test-setup";

/** Overwrite every `FRESHDESK_*` variable in `env` with a dummy value. */
export function scrubFreshdeskEnv(env: NodeJS.ProcessEnv): void {
  for (const name of Object.keys(env)) {
    if (name.startsWith("FRESHDESK_")) env[name] = DUMMY_FRESHDESK_VALUE;
  }
}
