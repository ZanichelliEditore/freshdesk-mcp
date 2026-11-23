// Vitest setup file (RFC 2026-11-23, rule 4): runs before every test file.
//
// "No real credentials": no test can read the real Freshdesk domain or API
// key from the developer's or CI's environment.
//
// "Runtime backstop": a `fetch` or undici call that names no dispatcher
// fails instead of reaching the network. This agent only blocks; tests
// intercept on the one from test/support/mock-dispatcher.ts.
import { MockAgent, setGlobalDispatcher } from "undici";
import { scrubFreshdeskEnv } from "./support/env.js";

scrubFreshdeskEnv(process.env);

const backstop = new MockAgent();
backstop.disableNetConnect();
setGlobalDispatcher(backstop);
