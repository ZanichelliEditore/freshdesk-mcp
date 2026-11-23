// The one way a test reaches HTTP (RFC 2026-11-23, rule 4): a MockAgent that
// refuses every request no test has intercepted, with a record of the
// requests it saw. This file and test/setup.ts are the only ones under
// test/ that may import undici.
import { MockAgent } from "undici";

export type { MockAgent };

export function mockDispatcher(): MockAgent {
  const agent = new MockAgent({ enableCallHistory: true });
  agent.disableNetConnect();
  return agent;
}
