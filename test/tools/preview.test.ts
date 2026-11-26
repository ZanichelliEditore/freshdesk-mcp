// T-070: the stateless preview id (SPEC §9; PLAN OD-13, OD-15).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FreshdeskError } from "../../src/client/errors.js";
import {
  checkPreviewId,
  mintPreviewId,
  PREVIEW_CAP,
  PREVIEW_ID_MAX_LENGTH,
  PREVIEW_TTL_MS,
  type PreviewItem,
} from "../../src/tools/preview.js";

const TOOL = "categorize_tickets";
const ITEMS: PreviewItem[] = [
  { ticket_id: 101, fields: { Category: "Billing", "Sub-category": "Refund" } },
  { ticket_id: 7, fields: { Category: "Access", Product: ["web", "app"] } },
  { ticket_id: 4242, fields: { Category: null, Urgent: true, Score: 3 } },
];
/** The mint time: milliseconds on the process's monotonic clock. */
const T0 = 5_000_000;
/** Sets the monotonic clock (`performance.now()`) the module reads. */
function setClock(ms: number): void {
  vi.spyOn(performance, "now").mockReturnValue(ms);
}

beforeEach(() => {
  setClock(T0);
});
afterEach(() => {
  vi.restoreAllMocks();
});

function minted(items: readonly PreviewItem[] = ITEMS, tool = TOOL): string {
  const result = mintPreviewId(tool, items);
  if (!result.ok) throw new Error(`mint refused: ${result.error.message}`);
  return result.preview_id;
}

function refusal(result: { ok: true } | { ok: false; error: FreshdeskError }): FreshdeskError {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("unreachable");
  expect(result.error.code).toBe("validation");
  expect(result.error.http_status).toBeNull();
  expect(result.error.retryable).toBe(false);
  return result.error;
}

/** A refusal whose whole error never quotes the id or any piece of it. */
function refusedWithoutQuoting(
  previewId: unknown,
  items: readonly PreviewItem[],
  tool = TOOL,
): FreshdeskError {
  const error = refusal(checkPreviewId(tool, previewId, items));
  if (typeof previewId === "string" && previewId.length > 0) {
    const text = JSON.stringify(error);
    expect(text).not.toContain(previewId);
    for (const piece of previewId.split(".").filter((p) => p.length >= 8)) {
      expect(text).not.toContain(piece);
    }
  }
  return error;
}

function ticket(id: number, fields: Record<string, unknown> = { Category: "Other" }): PreviewItem {
  return { ticket_id: id, fields };
}

describe("mintPreviewId / checkPreviewId: what checks", () => {
  it("a minted id checks against the same items, in the same order", () => {
    expect(checkPreviewId(TOOL, minted(), ITEMS)).toEqual({ ok: true });
  });

  it("a minted id checks against the same items in any order", () => {
    const id = minted();
    expect(checkPreviewId(TOOL, id, [...ITEMS].reverse())).toEqual({ ok: true });
    expect(checkPreviewId(TOOL, id, [ITEMS[1]!, ITEMS[2]!, ITEMS[0]!])).toEqual({ ok: true });
  });

  it("the order of a ticket's field keys does not matter", () => {
    const id = minted();
    const reordered = { ticket_id: 101, fields: { "Sub-category": "Refund", Category: "Billing" } };
    expect(checkPreviewId(TOOL, id, [ITEMS[2]!, reordered, ITEMS[1]!])).toEqual({ ok: true });
  });

  it("any subset of the previewed items, fields unchanged, checks", () => {
    const id = minted();
    const subsets = [[0], [1], [2], [0, 1], [0, 2], [1, 2], [2, 0]];
    for (const subset of subsets) {
      expect(
        checkPreviewId(
          TOOL,
          id,
          subset.map((i) => ITEMS[i]!),
        ),
      ).toEqual({ ok: true });
    }
  });

  it("no server state: a repeat within 15 minutes also checks", () => {
    const id = minted();
    expect(checkPreviewId(TOOL, id, ITEMS)).toEqual({ ok: true });
    setClock(T0 + 60_000);
    expect(checkPreviewId(TOOL, id, ITEMS)).toEqual({ ok: true });
    expect(checkPreviewId(TOOL, id, [ITEMS[0]!])).toEqual({ ok: true });
    expect(checkPreviewId(TOOL, id, [ITEMS[0]!])).toEqual({ ok: true });
  });

  it("two previews of the same items give different ids, each of which checks", () => {
    const a = minted();
    const b = minted();
    expect(a).not.toBe(b);
    expect(checkPreviewId(TOOL, a, ITEMS)).toEqual({ ok: true });
    expect(checkPreviewId(TOOL, b, ITEMS)).toEqual({ ok: true });
  });

  it("an id is at most PREVIEW_ID_MAX_LENGTH characters at the cap, and checks", () => {
    const full = Array.from({ length: PREVIEW_CAP }, (_, i) => ticket(i + 1));
    const id = minted(full);
    expect(id.length).toBeLessThanOrEqual(PREVIEW_ID_MAX_LENGTH);
    expect(checkPreviewId(TOOL, id, full)).toEqual({ ok: true });
  });
});

describe("checkPreviewId: what is refused (validation, http_status null, id not quoted)", () => {
  it("a ticket added", () => {
    refusedWithoutQuoting(minted(), [...ITEMS, ticket(9)]);
  });

  it("a ticket added within a subset", () => {
    refusedWithoutQuoting(minted(), [ITEMS[0]!, ticket(9)]);
  });

  it("a previewed ticket id paired with another previewed ticket's fields", () => {
    refusedWithoutQuoting(minted(), [{ ticket_id: 7, fields: ITEMS[0]!.fields }]);
  });

  it("a field value changed", () => {
    const changed = [
      ITEMS[0]!,
      ITEMS[1]!,
      { ticket_id: 4242, fields: { ...ITEMS[2]!.fields, Score: 4 } },
    ];
    refusedWithoutQuoting(minted(), changed);
  });

  it("a field value changed within a subset", () => {
    refusedWithoutQuoting(minted(), [
      { ticket_id: 101, fields: { Category: "Billing", "Sub-category": "Other" } },
    ]);
  });

  it.each<[string, Record<string, unknown>]>([
    ["a field dropped", { Category: "Billing" }],
    ["a field added", { Category: "Billing", "Sub-category": "Refund", Extra: "x" }],
    ["a value's type changed", { Category: "Billing", "Sub-category": ["Refund"] }],
    ["null for a value", { Category: "Billing", "Sub-category": null }],
  ])("%s", (_label, fields) => {
    refusedWithoutQuoting(minted(), [{ ticket_id: 101, fields }]);
  });

  it("another tool name", () => {
    refusedWithoutQuoting(minted(ITEMS, "categorize_tickets"), ITEMS, "update_ticket");
  });

  it("an edited id: every single-character edit is refused, in form or not", () => {
    const id = minted();
    for (let i = 0; i < id.length; i++) {
      const char = id[i]!;
      // An edit that keeps the form (a digit for a digit) and one that breaks it.
      const inForm = /[0-9]/.test(char) ? (char === "1" ? "2" : "1") : char === "A" ? "B" : "A";
      for (const replacement of [inForm, char === "." ? "A" : "."]) {
        refusedWithoutQuoting(id.slice(0, i) + replacement + id.slice(i + 1), ITEMS);
      }
    }
  });

  it("an edited mint time, later or earlier, still within 15 minutes of now", () => {
    const id = minted();
    const [time, ...rest] = id.split(".");
    setClock(T0 + 60_000);
    for (const delta of [1, 1000, 60_000, -1, -1000]) {
      refusedWithoutQuoting([String(Number(time) + delta), ...rest].join("."), ITEMS);
    }
  });

  it("an edited id: truncated, extended, or with a tag dropped and the full set named", () => {
    const id = minted();
    refusedWithoutQuoting(id.slice(0, -1), ITEMS);
    refusedWithoutQuoting(`${id}A`, ITEMS);
    refusedWithoutQuoting(id.slice(0, -16), ITEMS);
  });

  it("two previews' ids spliced together", () => {
    const a = minted([ITEMS[0]!]);
    const b = minted([ITEMS[1]!]);
    const spliced = `${a}${b.slice(b.lastIndexOf(".") + 1)}`;
    refusedWithoutQuoting(spliced, [ITEMS[0]!, ITEMS[1]!]);
  });

  it.each<[string, unknown]>([
    ["undefined", undefined],
    ["null", null],
    ["a number", 42],
    ["an object", { preview_id: "x" }],
    ["an empty string", ""],
    ["a string in no form this server gives", "not-a-preview-id"],
    ["a string over the maximum length", "A".repeat(PREVIEW_ID_MAX_LENGTH + 1)],
  ])("an id that is %s", (_label, previewId) => {
    refusedWithoutQuoting(previewId, ITEMS);
  });

  it("an id minted under another process's key", async () => {
    const id = minted();
    vi.resetModules();
    const other = await import("../../src/tools/preview.js");
    expect(other.checkPreviewId).not.toBe(checkPreviewId);
    refusal(other.checkPreviewId(TOOL, id, ITEMS));
    expect(JSON.stringify(refusal(other.checkPreviewId(TOOL, id, ITEMS)))).not.toContain(id);
    // The id still checks in the process that minted it.
    expect(checkPreviewId(TOOL, id, ITEMS)).toEqual({ ok: true });
  });

  it("an id older than 15 minutes; one exactly 15 minutes old still checks", () => {
    const id = minted();
    setClock(T0 + PREVIEW_TTL_MS);
    expect(checkPreviewId(TOOL, id, ITEMS)).toEqual({ ok: true });
    setClock(T0 + PREVIEW_TTL_MS + 1);
    const error = refusedWithoutQuoting(id, ITEMS);
    expect(error.message).toContain("15 minutes");
    refusedWithoutQuoting(id, [ITEMS[0]!]);
  });

  it("the mint time is the monotonic clock's whole millisecond; the wall clock does not count", () => {
    setClock(T0 + 0.9);
    const id = minted();
    expect(id.split(".")[0]).toBe(String(T0));
    // A wall clock set back (or forward) changes nothing.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2020-01-01T00:00:00.000Z"));
    setClock(T0 + PREVIEW_TTL_MS);
    expect(checkPreviewId(TOOL, id, ITEMS)).toEqual({ ok: true });
    vi.setSystemTime(new Date("2040-01-01T00:00:00.000Z"));
    expect(checkPreviewId(TOOL, id, ITEMS)).toEqual({ ok: true });
    setClock(T0 + PREVIEW_TTL_MS + 0.5);
    refusedWithoutQuoting(id, ITEMS);
    vi.useRealTimers();
  });

  it("PREVIEW_TTL_MS is 15 minutes", () => {
    expect(PREVIEW_TTL_MS).toBe(15 * 60 * 1000);
  });

  it("an id whose mint time is ahead of the clock is refused", () => {
    const id = minted();
    setClock(T0 - 1);
    refusedWithoutQuoting(id, ITEMS);
  });

  it("no items, or the same ticket twice", () => {
    const id = minted();
    refusedWithoutQuoting(id, []);
    refusedWithoutQuoting(id, [ITEMS[0]!, ITEMS[0]!]);
  });

  it.each<[string, unknown]>([
    ["not an array", { 0: ITEMS[0] }],
    ["an item that is null", [null]],
    ["a ticket id of 0", [{ ticket_id: 0, fields: {} }]],
    ["a fractional ticket id", [{ ticket_id: 1.5, fields: {} }]],
    ["a ticket id as a string", [{ ticket_id: "101", fields: ITEMS[0]!.fields }]],
    ["an unsafe ticket id", [{ ticket_id: 2 ** 53, fields: {} }]],
    ["fields that are an array", [{ ticket_id: 101, fields: ["Billing"] }]],
    ["fields that are null", [{ ticket_id: 101, fields: null }]],
    ["fields that are not JSON", [{ ticket_id: 101, fields: { Category: new Date(0) } }]],
    ["a value that is NaN", [{ ticket_id: 101, fields: { Score: Number.NaN } }]],
    [
      "an item whose getter throws",
      [
        Object.defineProperty({ fields: {} }, "ticket_id", {
          enumerable: true,
          get() {
            throw new Error("boom");
          },
        }),
      ],
    ],
    [
      "a Proxy list that throws",
      new Proxy([ITEMS[0]], {
        get() {
          throw new Error("boom");
        },
      }),
    ],
    [
      "fields with a throwing getter",
      [
        {
          ticket_id: 101,
          fields: Object.defineProperty({}, "Category", {
            enumerable: true,
            get() {
              throw new Error("boom");
            },
          }),
        },
      ],
    ],
  ])("items given by a cast: %s", (_label, items) => {
    refusedWithoutQuoting(minted(), items as PreviewItem[]);
  });
});

describe("the cap (SPEC §8.2): refused, not truncated", () => {
  const over = Array.from({ length: PREVIEW_CAP + 1 }, (_, i) => ticket(i + 1));

  it("PREVIEW_CAP is 50", () => {
    expect(PREVIEW_CAP).toBe(50);
  });

  it("minting over the cap is refused", () => {
    const error = refusal(mintPreviewId(TOOL, over));
    expect(error.message).toContain("50");
  });

  it("checking over the cap is refused", () => {
    const id = minted(over.slice(0, PREVIEW_CAP));
    const error = refusedWithoutQuoting(id, over);
    expect(error.message).toContain("50");
  });
});

describe("mintPreviewId: what is refused", () => {
  it("no items, or the same ticket twice", () => {
    refusal(mintPreviewId(TOOL, []));
    refusal(mintPreviewId(TOOL, [ticket(1), ticket(1, { Category: "Else" })]));
  });

  it.each<[string, unknown]>([
    ["not an array", "101"],
    ["a ticket id of -1", [{ ticket_id: -1, fields: {} }]],
    ["fields missing", [{ ticket_id: 101 }]],
    ["fields that are not JSON", [{ ticket_id: 101, fields: { At: new Map() } }]],
    ["a value that is Infinity", [{ ticket_id: 101, fields: { Score: Number.POSITIVE_INFINITY } }]],
    [
      "a Proxy list that throws",
      new Proxy([], {
        get() {
          throw new Error("boom");
        },
      }),
    ],
  ])("items given by a cast: %s", (_label, items) => {
    refusal(mintPreviewId(TOOL, items as PreviewItem[]));
  });
});
