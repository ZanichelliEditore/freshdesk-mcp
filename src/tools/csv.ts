// CSV for `export_tickets` (T-037): fields as RFC 4180 writes them, records
// ended by CRLF, and the spreadsheet formula guard, for customer text that
// is opened in a spreadsheet.
//
//   - `csvCell`: `null` and `undefined` are empty; a string is itself; a
//     number or a boolean is `String(value)`; anything else is its JSON.
//     A string (not a number: `-5` is a value, not a formula) starting with
//     `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading `'`, so a
//     spreadsheet shows it as text instead of running it. Then a cell holding
//     a quote, a comma, a newline or a carriage return is put in quotes, each
//     quote doubled.
//   - `csvRecord`: the cells through `csvCell`, joined by commas, then CRLF.
//     Header cells go through it too: a field's label is admin text.

/** What a spreadsheet may read as the start of a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;
/** What makes a cell need quotes. */
const NEEDS_QUOTES = /[",\r\n]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text: string;
  if (typeof value === "string") {
    text = FORMULA_START.test(value) ? `'${value}` : value;
  } else if (typeof value === "number" || typeof value === "boolean") {
    text = String(value);
  } else {
    text = JSON.stringify(value);
  }
  return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function csvRecord(cells: readonly unknown[]): string {
  return `${cells.map(csvCell).join(",")}\r\n`;
}
