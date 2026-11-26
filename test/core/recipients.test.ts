import { describe, expect, it } from "vitest";
import { checkRecipients, onAllowList, RECIPIENT_CAP } from "../../src/core/recipients.js";

// T-081, RFC 2026-11-26-send-safety-core OD-22 and OD-23: the recipient
// allow-list matcher. Every address below is synthetic.

const DOMAIN = ["@example.com"];

const REFUSED: [string, string][] = [
  ["a subdomain", "a@sub.example.com"],
  ["a suffix after the domain", "a@example.com.evil"],
  ["a prefix glued to the domain", "a@evilexample.com"],
  ["a trailing dot", "a@example.com."],
  ["a display name", "Name <a@example.com>"],
  ["angle brackets alone", "<a@example.com>"],
  ["a comma list", "a@example.com,b@example.com"],
  ["a semicolon list", "a@example.com;b@example.com"],
  ["a quoted local part", '"a"@example.com'],
  ["two `@`", "a@b@example.com"],
  ["no `@`", "example.com"],
  ["an empty local part", "@example.com"],
  ["an empty domain", "a@"],
  ["a space inside", "a @example.com"],
  ["a leading space", " a@example.com"],
  ["a trailing space", "a@example.com "],
  ["a tab", "a@example.com\t"],
  ["a line feed", "a@example.com\n"],
  ["a NUL", "a\u0000@example.com"],
  ["a DEL", "a\u007f@example.com"],
  ["a C1 control", "a\u0085@example.com"],
  ["a zero-width space", `a${String.fromCodePoint(0x200b)}@example.com`],
  ["a bidirectional override", `a@${String.fromCodePoint(0x202e)}example.com`],
  ["a non-ASCII letter", "à@example.com"],
  ["a Cyrillic look-alike in the domain", `a@ex${String.fromCodePoint(0x430)}mple.com`],
  ["a full-width `@`", `a${String.fromCodePoint(0xff20)}example.com`],
  [
    "the Kelvin sign, which lower-cases to ASCII `k`",
    `a@${String.fromCodePoint(0x212a)}example.com`,
  ],
  ["the empty string", ""],
];

describe("onAllowList: an `@domain` entry (OD-23)", () => {
  it.each(["a@example.com", "A@EXAMPLE.COM", "a+x@example.com", "first.last@Example.Com"])(
    "matches %s",
    (address) => {
      expect(onAllowList(DOMAIN, address)).toBe(true);
    },
  );

  it.each(REFUSED)("refuses %s", (_label, address) => {
    expect(onAllowList(DOMAIN, address)).toBe(false);
  });

  it.each(REFUSED)("checkRecipients gives %s the right reason", (_label, address) => {
    const offList = ["a@sub.example.com", "a@example.com.evil", "a@evilexample.com"];
    const reason = offList.includes(address) ? "not_allowed" : "malformed";
    expect(checkRecipients(DOMAIN, { to: [address] })).toMatchObject({ ok: false, reason });
  });

  it("refuses the Kelvin sign against the ASCII domain it lower-cases to", () => {
    const kelvin = `a@${String.fromCodePoint(0x212a)}example.com`;
    expect(kelvin.toLowerCase()).toBe("a@kexample.com");
    expect(onAllowList(["@kexample.com"], kelvin)).toBe(false);
  });

  it("matches nothing but that domain when the entry is upper-case", () => {
    expect(onAllowList(["@EXAMPLE.COM"], "a@example.com")).toBe(true);
    expect(onAllowList(["@EXAMPLE.COM"], "a@sub.example.com")).toBe(false);
  });

  it("refuses an address that is not a string", () => {
    for (const address of [undefined, null, 1, {}, ["a@example.com"]]) {
      expect(onAllowList(DOMAIN, address as unknown as string)).toBe(false);
    }
  });
});

describe("onAllowList: a full-address entry (OD-23)", () => {
  const FULL = ["builder@example.com"];

  it.each(["builder@example.com", "BUILDER@EXAMPLE.COM", "Builder@Example.com"])(
    "matches %s, case-insensitively",
    (address) => {
      expect(onAllowList(FULL, address)).toBe(true);
    },
  );

  it.each([
    "other@example.com",
    "builder+x@example.com",
    "builder@sub.example.com",
    "xbuilder@example.com",
    "builder@example.com.",
    "Builder <builder@example.com>",
  ])("refuses %s", (address) => {
    expect(onAllowList(FULL, address)).toBe(false);
  });

  it("an entry with a trailing dot does not match the same address", () => {
    expect(onAllowList(["builder@example.com."], "builder@example.com.")).toBe(false);
    expect(onAllowList(["@example.com."], "a@example.com.")).toBe(false);
  });

  it("matches an upper-case entry case-insensitively", () => {
    expect(onAllowList(["Builder@EXAMPLE.com"], "builder@example.com")).toBe(true);
  });
});

describe("onAllowList: the list itself (OD-23, fail closed)", () => {
  it("an empty list refuses everything", () => {
    for (const address of ["a@example.com", "builder@example.com", "x@y.z"]) {
      expect(onAllowList([], address)).toBe(false);
    }
  });

  it.each([
    ["a trailing comma", "@example.com,"],
    ["a trailing dot", "@example.com."],
    ["a leading space", " @example.com"],
    ["a display name", "Name <a@example.com>"],
    ["two `@`", "@@example.com"],
    ["a bare `@`", "@"],
    ["a non-ASCII domain", "@exámple.com"],
    ["the Kelvin sign", `@${String.fromCodePoint(0x212a)}example.com`],
    ["no `@`", "example.com"],
    ["the empty string", ""],
  ])("an entry with %s matches nothing", (_label, entry) => {
    for (const address of ["a@example.com", "a@kexample.com", "a@exámple.com", entry]) {
      expect(onAllowList([entry], address)).toBe(false);
    }
  });

  it("a bad entry does not stop a good one later in the list", () => {
    expect(onAllowList(["@example.com,", "@example.com"], "a@example.com")).toBe(true);
  });

  it("an entry that is not a string matches nothing", () => {
    expect(onAllowList([null as unknown as string], "a@example.com")).toBe(false);
  });
});

describe("checkRecipients: per field, by position (OD-22)", () => {
  const LIST = ["@example.com", "builder@example.org"];

  it("accepts every address on the list", () => {
    expect(
      checkRecipients(LIST, {
        to: ["a@example.com"],
        cc: ["builder@example.org", "B@EXAMPLE.COM"],
      }),
    ).toEqual({
      ok: true,
      recipients: { to: ["a@example.com"], cc: ["builder@example.org", "B@EXAMPLE.COM"] },
    });
  });

  it("returns frozen copies, so a later change to the caller's lists cannot reach the send", () => {
    const to = ["a@example.com"];
    const result = checkRecipients(LIST, { to });
    to[0] = "x@off.test";
    to.push("y@off.test");
    expect(result).toEqual({ ok: true, recipients: { to: ["a@example.com"] } });
    if (result.ok) {
      expect(result.recipients.to).not.toBe(to);
      expect(Object.isFrozen(result.recipients)).toBe(true);
      expect(Object.isFrozen(result.recipients.to)).toBe(true);
    }
  });

  it("reads each list once: a list whose length changes between reads is counted and checked as first read", () => {
    let reads = 0;
    const shifty = new Proxy(["a@example.com"], {
      get(target, key, receiver) {
        if (key === "length") return reads++ === 0 ? 1 : 50;
        return Reflect.get(target, key, receiver);
      },
    });
    const result = checkRecipients(LIST, { to: shifty });
    expect(result).toEqual({ ok: true, recipients: { to: ["a@example.com"] } });
  });

  it("accepts no recipients at all", () => {
    expect(checkRecipients(LIST, { to: [], cc: [] })).toEqual({
      ok: true,
      recipients: { to: [], cc: [] },
    });
  });

  it("refuses an off-list address by field and 1-based position, never the address", () => {
    const result = checkRecipients(LIST, {
      to: ["a@example.com"],
      cc: ["b@example.com", "secret.person@elsewhere.test"],
    });
    expect(result).toMatchObject({ ok: false, field: "cc", position: 2, reason: "not_allowed" });
    expect(JSON.stringify(result)).not.toMatch(/secret|elsewhere/);
  });

  it("refuses a malformed address apart from an off-list one, never quoting it", () => {
    const result = checkRecipients(LIST, { to: ["Secret Person <a@example.com>"] });
    expect(result).toMatchObject({ ok: false, field: "to", position: 1, reason: "malformed" });
    expect(JSON.stringify(result)).not.toMatch(/Secret|example\.com/);
  });

  it("names the first refused address, fields in the order given", () => {
    const result = checkRecipients(LIST, { to: ["x@off.test"], cc: ["y@off.test"] });
    expect(result).toMatchObject({ ok: false, field: "to", position: 1 });
  });

  it("refuses everything with an empty list", () => {
    expect(checkRecipients([], { to: ["a@example.com"] })).toMatchObject({
      ok: false,
      field: "to",
      position: 1,
      reason: "not_allowed",
    });
  });

  it("refuses an address that is not a string as malformed", () => {
    const result = checkRecipients(LIST, { cc: [42 as unknown as string] });
    expect(result).toMatchObject({ ok: false, field: "cc", position: 1, reason: "malformed" });
  });

  it("refuses fields that are not an object, without throwing", () => {
    for (const fields of [null, undefined, "to", ["a@example.com"]]) {
      expect(checkRecipients(LIST, fields as unknown as Record<string, string[]>)).toMatchObject({
        ok: false,
        field: null,
        position: null,
        reason: "malformed",
      });
    }
  });

  it("refuses everything with an allow-list that is not a list, without throwing", () => {
    for (const list of [null, undefined, "@example.com", { 0: "@example.com" }]) {
      const allowList = list as unknown as string[];
      expect(onAllowList(allowList, "a@example.com")).toBe(false);
      expect(checkRecipients(allowList, { to: ["a@example.com"] })).toMatchObject({
        ok: false,
        reason: "not_allowed",
      });
    }
  });

  it("refuses, without throwing, a list that throws when read", () => {
    const throwing = new Proxy([], {
      get() {
        throw new Error("boom");
      },
    });
    expect(checkRecipients(LIST, { to: throwing })).toMatchObject({
      ok: false,
      field: null,
      position: null,
      reason: "malformed",
    });
    expect(onAllowList(throwing, "a@example.com")).toBe(false);
  });

  it("refuses a field that is not a list, without throwing", () => {
    const result = checkRecipients(LIST, { cc: "a@example.com" as unknown as string[] });
    expect(result).toMatchObject({ ok: false, field: "cc", position: null, reason: "malformed" });
  });

  it("gives a message that names the field and position", () => {
    const result = checkRecipients(LIST, { cc: ["a@example.com", "z@off.test"] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("`cc`");
      expect(result.message).toContain("position 2");
      expect(result.message).not.toContain("off.test");
    }
  });
});

describe("checkRecipients: the cap, all fields together (OD-22)", () => {
  const LIST = ["@example.com"];
  const addresses = (n: number) => Array.from({ length: n }, (_, i) => `a${i}@example.com`);

  it("is 10", () => {
    expect(RECIPIENT_CAP).toBe(10);
  });

  it("accepts exactly the cap, split across fields", () => {
    expect(checkRecipients(LIST, { to: addresses(4), cc: addresses(6) })).toMatchObject({
      ok: true,
    });
  });

  it("refuses one over the cap in one field", () => {
    expect(checkRecipients(LIST, { cc: addresses(11) })).toMatchObject({
      ok: false,
      field: null,
      position: null,
      reason: "over_cap",
    });
  });

  it("refuses one over the cap across fields, never truncating", () => {
    const result = checkRecipients(LIST, { to: addresses(5), cc: addresses(6) });
    expect(result).toMatchObject({ ok: false, reason: "over_cap" });
    if (!result.ok) {
      expect(result.message).toContain("11");
      expect(result.message).toContain("10");
      expect(result.message).not.toContain("example.com");
    }
  });

  it("counts a repeated address each time it is given", () => {
    const same = Array.from({ length: 11 }, () => "a@example.com");
    expect(checkRecipients(LIST, { to: same })).toMatchObject({ ok: false, reason: "over_cap" });
  });
});
