import { describe, expect, it } from "vitest";
import { allowSet, type WriteEntry } from "../../src/core/allow-sets.js";

// The RFC 2026-11-25-write-safety-core's OD-2 table, written out by hand: the
// test fails if the core's table drifts from it.
const OD2: Record<WriteEntry, { defaults: string[]; custom: boolean; tags: boolean }> = {
  update_ticket: {
    defaults: ["status", "priority", "ticket_type", "group", "agent"],
    custom: true,
    tags: true,
  },
  categorize_tickets: { defaults: ["ticket_type"], custom: true, tags: false },
  hand_off_draft: { defaults: ["group", "agent"], custom: false, tags: false },
  add_note: { defaults: [], custom: false, tags: false },
};

describe("allowSet: the RFC's OD-2 table", () => {
  it.each(Object.keys(OD2) as WriteEntry[])("%s equals the table's row", (entry) => {
    const set = allowSet(entry);
    expect({ ...set, defaults: [...set.defaults].sort() }).toEqual({
      ...OD2[entry],
      defaults: [...OD2[entry].defaults].sort(),
    });
    expect(Object.keys(set).sort()).toEqual(["custom", "defaults", "tags"]);
  });

  it("holds no field the RFC keeps out of every set", () => {
    const never = [
      "requester",
      "email",
      "phone",
      "name",
      "company",
      "source",
      "subject",
      "description",
      "product",
      "due_by",
      "fr_due_by",
    ];
    for (const entry of Object.keys(OD2) as WriteEntry[]) {
      for (const name of never) expect(allowSet(entry).defaults).not.toContain(name);
    }
  });

  it("gives the same frozen set every time: a caller cannot widen it", () => {
    const set = allowSet("hand_off_draft");
    expect(allowSet("hand_off_draft")).toBe(set);
    expect(Object.isFrozen(set)).toBe(true);
    expect(Object.isFrozen(set.defaults)).toBe(true);
    expect(() => (set.defaults as string[]).push("subject")).toThrow(TypeError);
    expect(() => {
      (set as { custom: boolean }).custom = true;
    }).toThrow(TypeError);
    expect(allowSet("hand_off_draft")).toEqual({
      defaults: ["group", "agent"],
      custom: false,
      tags: false,
    });
  });

  it.each([
    "send_reply",
    "forward_ticket",
    "UPDATE_TICKET",
    "",
    "toString",
    "__proto__",
    "constructor",
    "hasOwnProperty",
  ])("throws TypeError for an entry point not in the table: %j", (entry) => {
    expect(() => allowSet(entry as WriteEntry)).toThrow(TypeError);
  });

  it.each([undefined, null, 1, {}])("throws TypeError for a non-string entry: %j", (entry) => {
    expect(() => allowSet(entry as unknown as WriteEntry)).toThrow(TypeError);
  });
});
