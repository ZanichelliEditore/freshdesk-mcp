// Vitest setup file (RFC 2026-11-23, rule 4, "No real credentials"): runs
// before every test file, so no test can read the real Freshdesk domain or
// API key from the developer's or CI's environment.
import { scrubFreshdeskEnv } from "./support/env.js";

scrubFreshdeskEnv(process.env);
