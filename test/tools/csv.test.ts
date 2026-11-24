import { describe, expect, it } from "vitest";
import { csvCell, csvRecord } from "../../src/tools/csv.js";

describe("csvCell", () => {
  it("a plain value is written as it is", () => {
    expect(csvCell("Open")).toBe("Open");
    expect(csvCell("")).toBe("");
    expect(csvCell("a 'quoted' word")).toBe("a 'quoted' word");
  });

  it.each([
    ["=", "=1+1", "'=1+1"],
    ["+", "+1", "'+1"],
    ["-", "-1", "'-1"],
    ["@", "@SUM(A1)", "'@SUM(A1)"],
    ["a tab", "\tx", "'\tx"],
    ["a carriage return", "\rx", '"\'\rx"'],
  ])(
    "a text starting with %s gets a leading ' so a spreadsheet does not run it",
    (_what, value, written) => {
      expect(csvCell(value)).toBe(written);
    },
  );

  it("only the first character counts", () => {
    expect(csvCell("a=1")).toBe("a=1");
    expect(csvCell(" =1")).toBe(" =1");
  });

  it("a quote, a comma, a newline or a carriage return puts the cell in quotes, quotes doubled", () => {
    expect(csvCell('He said "hi"\nbye')).toBe('"He said ""hi""\nbye"');
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("a\r\nb")).toBe('"a\r\nb"');
    expect(csvCell('"')).toBe('""""');
  });

  it("a formula start and a quote together: the ' first, then the quoting", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
  });

  it("null and undefined are empty; a number and a boolean as written, a negative number unguarded", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(4301)).toBe("4301");
    expect(csvCell(false)).toBe("false");
  });

  it("an object or an array is its JSON, quoted as any text", () => {
    expect(csvCell([{ a: 1 }])).toBe('"[{""a"":1}]"');
    expect(csvCell({ text: "=1" })).toBe('"{""text"":""=1""}"');
  });
});

describe("csvRecord", () => {
  it("joins the cells with commas and ends with CRLF, header cells guarded like any cell", () => {
    expect(csvRecord(["id", "=Eq", "+Plus", "-Minus", "@At", "\tTab", "\rCr", 'Say "x"'])).toBe(
      'id,\'=Eq,\'+Plus,\'-Minus,\'@At,\'\tTab,"\'\rCr","Say ""x"""\r\n',
    );
  });

  it("no cell is an empty line", () => {
    expect(csvRecord([])).toBe("\r\n");
  });
});
