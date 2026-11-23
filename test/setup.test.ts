import { describe, expect, it } from "vitest";
import { DUMMY_FRESHDESK_VALUE, scrubFreshdeskEnv } from "./setup.js";

describe("scrubFreshdeskEnv", () => {
  it("overwrites every FRESHDESK_* variable and leaves the others", () => {
    const env: NodeJS.ProcessEnv = {
      FRESHDESK_API_KEY: "real-key",
      FRESHDESK_DOMAIN: "real.freshdesk.com",
      FRESHDESK_ANYTHING_NEW: "x",
      HOME: "/home/someone",
      freshdesk_lower: "untouched",
    };
    scrubFreshdeskEnv(env);
    expect(env).toEqual({
      FRESHDESK_API_KEY: DUMMY_FRESHDESK_VALUE,
      FRESHDESK_DOMAIN: DUMMY_FRESHDESK_VALUE,
      FRESHDESK_ANYTHING_NEW: DUMMY_FRESHDESK_VALUE,
      HOME: "/home/someone",
      freshdesk_lower: "untouched",
    });
  });

  it("has already run on process.env before this test", () => {
    expect(process.env.FRESHDESK_CANARY).toBe(DUMMY_FRESHDESK_VALUE);
    for (const [name, value] of Object.entries(process.env)) {
      if (name.startsWith("FRESHDESK_")) expect(value).toBe(DUMMY_FRESHDESK_VALUE);
    }
  });
});
