// T-083: SPEC §9's "Not sent" result (RFC 2026-11-26-send-safety-core,
// OD-19, OD-21, OD-27, threat 1).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { notSent, type NotSentInput } from "../../src/tools/confirm.js";

const SPEC_SENTENCE =
  "Not sent. Show the user the exact text and recipients; call again with `confirm: true` and this `send_id` only after they approve.";
const CC_SENTENCE =
  "Freshdesk may also copy the ticket's existing CC addresses, which this tool does not check.";
const REQUESTER = "the ticket's requester";
const SEND_ID = "1795687200000.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBB";
const EXPIRES = "2026-11-26T10:15:00.000Z";
/** The body before escaping, as the entry returns it (OD-24). */
const BODY = "Dear customer,\nyour <order> & refund are on their way.";

const reply: NotSentInput = {
  tool: "reply_to_ticket",
  ticket_id: 4242,
  body: BODY,
  to: [],
  cc: ["ops@example.com"],
  send_id: SEND_ID,
  expires_at: EXPIRES,
};
const forward: NotSentInput = {
  tool: "forward_ticket",
  ticket_id: 77,
  body: BODY,
  to: ["a.dev@example.com", "b.lead@example.com"],
  cc: ["qa@example.com"],
  send_id: SEND_ID,
  expires_at: EXPIRES,
};
const note: NotSentInput = {
  tool: "add_public_note",
  ticket_id: 9,
  body: BODY,
  to: [],
  cc: [],
  send_id: SEND_ID,
  expires_at: EXPIRES,
};

describe("notSent", () => {
  it.each([reply, forward, note])("$tool: says nothing was sent, ticket id first", (input) => {
    const result = notSent(input);
    expect(result.sent).toBe(false);
    expect(Object.keys(result)[0]).toBe("ticket_id");
    expect(result.ticket_id).toBe(input.ticket_id);
    expect(result.note.startsWith(`Ticket ${input.ticket_id}: `)).toBe(true);
    expect(result.note).toContain(
      `check with the user that ticket ${input.ticket_id} is the ticket they mean`,
    );
    expect(result.note).toContain(SPEC_SENTENCE);
  });

  it.each([reply, forward, note])(
    "$tool: carries the send_id it is given and its expiry",
    (input) => {
      const result = notSent(input);
      expect(result.send_id).toBe(SEND_ID);
      expect(result.expires_at).toBe(EXPIRES);
    },
  );

  it.each([reply, forward, note])(
    "$tool: shows the body before escaping, as the entry returns it",
    (input) => {
      const result = notSent(input);
      expect(result.body).toBe(BODY);
      expect(JSON.stringify(result)).not.toMatch(/&lt;|&amp;|<br>/);
    },
  );

  it("reply: the ticket's requester, never an address, and the caller's cc", () => {
    const result = notSent(reply);
    expect(result.recipients).toEqual({ to: REQUESTER, cc: ["ops@example.com"] });
  });

  it("forward: the caller's to and cc, and no requester", () => {
    const result = notSent(forward);
    expect(result.recipients).toEqual({
      to: ["a.dev@example.com", "b.lead@example.com"],
      cc: ["qa@example.com"],
    });
    expect(JSON.stringify(result)).not.toContain(REQUESTER);
  });

  it("public note: the ticket's requester, no cc", () => {
    expect(notSent(note).recipients).toEqual({ to: REQUESTER, cc: [] });
  });

  it.each([reply, note])("$tool: carries OD-21's CC sentence", (input) => {
    expect(notSent(input).note).toContain(CC_SENTENCE);
  });

  it("forward: no CC sentence (a forward goes only to the addresses given)", () => {
    expect(notSent(forward).note).not.toContain(CC_SENTENCE);
  });

  it("names no address but the caller's (OD-27)", () => {
    for (const input of [reply, forward, note]) {
      const result = notSent(input);
      const given = new Set([...input.to, ...input.cc]);
      const addresses = JSON.stringify(result).match(/[^\s"[\],]+@[^\s"[\],]+/g) ?? [];
      for (const address of addresses) expect(given.has(address), address).toBe(true);
    }
  });

  it("gives copies of the caller's lists, not the lists themselves", () => {
    const to = ["a@example.com"];
    const result = notSent({ ...forward, to });
    to.push("b@example.com");
    expect(result.recipients.to).toEqual(["a@example.com"]);
  });
});

describe("src/tools/confirm.ts", () => {
  it("imports nothing from src/core/ (OD-19: it builds text, the core decides)", () => {
    const source = readFileSync(
      join(import.meta.dirname, "..", "..", "src", "tools", "confirm.ts"),
      "utf8",
    );
    // Comments name src/core/ in prose; the code must not.
    const code = source.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/\bcore\//);
    expect(code).not.toMatch(/\bimport\s*\(/);
    const sources = [...code.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((m) => m[1]);
    expect(sources).toEqual([]);
  });
});
