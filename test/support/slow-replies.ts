// MockAgent reply callbacks for a test of a time limit that fakes `Date`
// alone, moving with real time:
//
//   vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
//
// Each callback runs when the request is sent and jumps the clock, so a
// call's elapsed time is the replies' jumps plus real milliseconds. A loop
// that advances faked timers 100 ms after every real turn instead charges
// the turns spent on real work (file I/O, the MCP session, the mock's
// dispatch) as fake time, which a slow runner turns into seconds: CI failed
// that way twice on 2026-11-25 (docs/journal.md, T-057).

import { vi } from "vitest";

const JSON_TYPE = { "content-type": "application/json" };

/** Freshdesk answers 200 with `body` after `ms`: the clock jumps `ms` when the request is sent. */
export function answersAfter(ms: number, body: unknown, headers: Record<string, string> = {}) {
  return () => {
    vi.setSystemTime(Date.now() + ms);
    return {
      statusCode: 200,
      data: body as object,
      responseOptions: { headers: { ...JSON_TYPE, ...headers } },
    };
  };
}

/**
 * Freshdesk is still silent after `ms`: the clock jumps `ms` when the request
 * is sent and its connection then fails (`network`), as an attempt the
 * call's deadline cuts does once the clock is at or past it. A request sent
 * after the call started, with `ms` of 30 s or the time left, lands there.
 * The client's own abort at the deadline is tested in
 * test/client/http-retry.test.ts.
 */
export function silentFor(ms: number) {
  return () => {
    vi.setSystemTime(Date.now() + ms);
    throw new Error("no answer before the call's deadline");
  };
}
