// The `core` smoke (`make smoke-core`, T-039; SPEC §13 M1): every tool of the
// `core` toolset called through the MCP server, in process, against the real
// account, by the owner's hand. Never run by a test or CI against Freshdesk.
//
//   - GET only: the context's client is the smoke's `SmokeClient`
//     (smoke.ts), built by `smoke` from the same configuration as the server;
//     the context is put together here as `createContext` does, with that
//     client and `toolsets: ["core"]`.
//   - The tools called are the ones the server lists, so a tool added to the
//     registry without a call here is a `fail no_smoke_call`.
//   - One line per tool call and one per use case. A tool's outcome is
//     `pass` (not `isError`, and the result matches the tool's output shape),
//     `pass (empty)` (an empty list or a zero count), `not exercised` (no id
//     to take from an earlier result), `refused (budget)` (the per-call
//     budget's refusal, printed with its estimate: not a fail), or `fail`
//     with the error code only (`isError`, a shape mismatch, an exception).
//     Each line ends with the requests the call sent, counted at the
//     dispatcher, retries and the schema's load included.
//   - Never printed: ticket text, a label, a name, an id, the domain or the
//     key. Ids and the search term are taken from the run (the first ticket
//     of `list_tickets`; the first article of `list_solution_tree` and its
//     title's first word, or, when the tree has no article, the first
//     article of `list_solution_tree` called again with `category`, the
//     first category that has a folder (line `list_solution_tree category`,
//     T-058; no line when the tree has an article), or, when that has none
//     either, the first word of the first folder's name and the first
//     article `search_solutions` finds with it; the first canned response of
//     `list_canned_responses`) and only sent, never printed.
//   - The period of `count_tickets` and `export_tickets` is the last `days`
//     UTC days, today included (7 by default; `--days` narrows it).
//   - `export_tickets` writes into a fresh temporary directory of mode 0700,
//     removed when the run ends, on a failure too. Only the row count is
//     printed, never the path or the file.
//
// Exit code: 1 when any tool line is `fail`, 0 otherwise. M1 needs every use
// case `pass`; a use case left `not exercised` or `refused (budget)` does not
// count (SPEC §13; docs/tasks/T-039-m1-smoke.md).

import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  InMemoryTransport,
  type JSONRPCMessage,
  LATEST_PROTOCOL_VERSION,
  type McpServer,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import type { HttpClient } from "../../src/client/http.js";
import type { Config, TeamConfig } from "../../src/config.js";
import { deepFreeze, SchemaService } from "../../src/schema/index.js";
import { ticketOutput } from "../../src/schema/output.js";
import { createServer } from "../../src/server.js";
import type { AppContext } from "../../src/tools/context.js";
import { TOOLSETS, type Toolsets } from "../../src/tools/toolsets/index.js";

type Out = (line: string) => void;

export interface CallResult {
  isError?: boolean;
  content: { type: string; text: string }[];
}

export interface CoreOptions {
  /** `--days` as given; undefined for the default, 7. */
  days?: string;
  /** The clock the period is computed from (tests). */
  now?: number;
  /** Where the export directory is made; the system's temporary directory by default. */
  tmpRoot?: string;
  /** The toolsets the server is built from; the registry's by default. */
  toolsets?: Toolsets;
  /** Each result as the server sent it (tests: never printed). */
  seen?: (tool: string, result: CallResult) => void;
}

export const DEFAULT_DAYS = 7;
const MAX_DAYS = 366;
const DAY_MS = 86_400_000;

/** `--days` as a whole number from 1 to 366, the default when absent, `undefined` when invalid. */
export function parseDays(days: string | undefined): number | undefined {
  if (days === undefined) return DEFAULT_DAYS;
  if (!/^[1-9][0-9]{0,2}$/.test(days)) return undefined;
  const value = Number(days);
  return value <= MAX_DAYS ? value : undefined;
}

type Outcome =
  | { kind: "pass"; empty: boolean; counts: string }
  | { kind: "not exercised"; why: string }
  | { kind: "refused (budget)"; estimate: string; budget: string }
  | { kind: "fail"; code: string };

interface Line {
  label: string;
  tool: string;
  outcome: Outcome;
  calls: number;
}

const count = z.number().int().nonnegative();
const id = z.number().int().positive();
const envelope = z.object({
  items: z.array(z.unknown()),
  has_more: z.boolean(),
  api_calls_used: count,
});
const viewed = z.object({ id, text: z.string().nullable(), api_calls_used: count });

interface Check {
  shape: z.ZodType;
  read(value: never): { empty: boolean; counts: string };
}

function items(value: { items: unknown[] }) {
  return { empty: value.items.length === 0, counts: `items ${value.items.length}` };
}

function text(value: { text: string | null }) {
  return { empty: false, counts: `text ${value.text === null ? "no" : "yes"}` };
}

const treeShape = z.object({
  categories: z.array(
    z.object({
      id,
      folders: z
        .array(
          z.object({
            name: z.string(),
            articles: z.array(z.object({ id, title: z.string() })).nullable(),
          }),
        )
        .nullable(),
    }),
  ),
  truncated: z.boolean(),
  api_calls_used: count,
});
const cannedShape = envelope.extend({
  items: z.array(z.object({ responses: z.array(z.object({ id })) })),
});
/** A list envelope whose items carry an id: tickets, search hits. */
const idRows = envelope.extend({ items: z.array(z.object({ id })) });

/** The first word of 3 or more letters: a search term taken from the run, never printed. */
function firstWord(text: string | undefined): string | undefined {
  return text === undefined ? undefined : /\p{L}{3,}/u.exec(text)?.[0];
}

/** Each core tool's output shape (SPEC §8.4), what counts as empty, and the counts printed. */
const CHECKS: Record<string, Check> = {
  get_ticket_schema: {
    shape: z.object({ fields: z.array(z.unknown()) }),
    read: (value: { fields: unknown[] }) => ({
      empty: value.fields.length === 0,
      counts: `fields ${value.fields.length}`,
    }),
  },
  list_agents: { shape: envelope, read: items },
  list_groups: { shape: envelope, read: items },
  list_tickets: { shape: idRows, read: items },
  search_tickets: { shape: envelope, read: items },
  triage_queue: { shape: envelope, read: items },
  find_similar_tickets: { shape: envelope, read: items },
  search_solutions: { shape: idRows, read: items },
  get_ticket: {
    shape: envelope,
    read: (value: { items: unknown[] }) => ({
      empty: false,
      counts: `conversations ${value.items.length}`,
    }),
  },
  list_solution_tree: {
    shape: treeShape,
    read: (value: z.output<typeof treeShape>) => {
      const folders = value.categories.flatMap((category) => category.folders ?? []);
      const articles = folders.flatMap((folder) => folder.articles ?? []);
      return {
        empty: value.categories.length === 0,
        counts: `categories ${value.categories.length}, folders ${folders.length}, articles ${articles.length}`,
      };
    },
  },
  get_solution_article: { shape: viewed, read: text },
  list_canned_responses: {
    shape: cannedShape,
    read: (value: z.output<typeof cannedShape>) => ({
      empty: value.items.length === 0,
      counts: `folders ${value.items.length}, responses ${value.items.flatMap((folder) => folder.responses).length}`,
    }),
  },
  get_canned_response: { shape: viewed, read: text },
  count_tickets: {
    shape: z.object({ groups: z.array(z.unknown()), total: count, api_calls_used: count }),
    read: (value: { groups: unknown[]; total: number }) => ({
      empty: value.total === 0,
      counts: `total ${value.total}, groups ${value.groups.length}`,
    }),
  },
  export_tickets: {
    shape: z.object({ path: z.string(), rows: count, api_calls_used: count }),
    read: (value: { rows: number }) => ({ empty: value.rows === 0, counts: `rows ${value.rows}` }),
  },
};

/** The use cases of SPEC §13's M1, each with the tool lines it is made of. */
const USE_CASES: readonly (readonly [string, readonly string[]])[] = [
  ["C1 listing", ["get_ticket_schema", "list_tickets uncategorized"]],
  ["C2", ["triage_queue"]],
  [
    "C3 read",
    [
      "list_tickets",
      "get_ticket",
      "find_similar_tickets",
      "search_solutions",
      "list_canned_responses",
      "get_canned_response",
    ],
  ],
  ["C7", ["count_tickets", "export_tickets"]],
  ["C9", ["list_solution_tree", "get_solution_article", "search_solutions", "search_tickets"]],
  ["C10", ["list_canned_responses", "get_canned_response", "search_tickets"]],
];

const BUDGET = /needs an estimated (\d+) API calls, over the per-call budget of (\d+)/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** An error code as it is when spelled like one; anything else `other`. */
function codeName(code: unknown): string {
  return typeof code === "string" && /^[a-z_]{1,40}$/.test(code) ? code : "other";
}

/** The outcome of one result, and its parsed value when it passed. */
function outcomeOf(tool: string, result: CallResult): { outcome: Outcome; value?: unknown } {
  let body: unknown;
  try {
    body = JSON.parse(result.content?.[0]?.text ?? "");
  } catch {
    return { outcome: { kind: "fail", code: "not_json" } };
  }
  if (result.isError === true) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : {};
    const budget =
      error.code === "validation" && typeof error.message === "string"
        ? BUDGET.exec(error.message)
        : null;
    if (budget) {
      return { outcome: { kind: "refused (budget)", estimate: budget[1]!, budget: budget[2]! } };
    }
    return { outcome: { kind: "fail", code: codeName(error.code) } };
  }
  const check = CHECKS[tool];
  if (check === undefined) return { outcome: { kind: "fail", code: "no_shape" } };
  const parsed = check.shape.safeParse(body);
  if (!parsed.success) return { outcome: { kind: "fail", code: "shape" } };
  const { empty, counts } = check.read(parsed.data as never);
  const truncated = isRecord(body) && body.truncated === true ? ", truncated" : "";
  return { outcome: { kind: "pass", empty, counts: counts + truncated }, value: parsed.data };
}

function outcomeText(outcome: Outcome): string {
  switch (outcome.kind) {
    case "pass":
      return `${outcome.empty ? "pass (empty)" : "pass"}, ${outcome.counts}`;
    case "not exercised":
      return `not exercised (${outcome.why})`;
    case "refused (budget)":
      return `refused (budget), estimate ${outcome.estimate} calls over the budget of ${outcome.budget}`;
    case "fail":
      return `fail ${outcome.code}`;
  }
}

function shortName(outcome: Outcome): string {
  return outcome.kind === "pass" && outcome.empty ? "pass (empty)" : outcome.kind;
}

/** A use case's outcome from its tool lines, with the lines the owner must accept by name. */
function useCase(lines: Line[]): string {
  const kinds = lines.map((line) => line.outcome.kind);
  if (kinds.includes("fail")) return "fail";
  if (kinds.includes("refused (budget)")) return "refused (budget)";
  if (kinds.every((kind) => kind === "not exercised")) return "not exercised";
  const accept = lines
    .filter((line) => shortName(line.outcome) !== "pass")
    .map((line) => `${line.label} ${shortName(line.outcome)}`);
  return accept.length === 0 ? "pass" : `pass; owner to accept: ${accept.join(", ")}`;
}

/** A bare JSON-RPC client over the SDK's in-memory transport: initialize, then requests. */
async function open(server: McpServer) {
  const [client, transport] = InMemoryTransport.createLinkedPair();
  const waiting = new Map<number, (message: Record<string, unknown>) => void>();
  client.onmessage = (message: JSONRPCMessage) => {
    const reply = message as Record<string, unknown>;
    if (typeof reply.id === "number") waiting.get(reply.id)?.(reply);
  };
  await server.connect(transport);
  await client.start();
  let next = 0;
  const request = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const id = ++next;
      waiting.set(id, (reply) => {
        waiting.delete(id);
        if (reply.error !== undefined) reject(new Error("JSON-RPC error"));
        else resolve(reply.result as Record<string, unknown>);
      });
      void client.send({ jsonrpc: "2.0", id, method, params });
    });
  await request("initialize", {
    protocolVersion: LATEST_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "freshdesk-mcp-smoke", version: "0" },
  });
  await client.send({ jsonrpc: "2.0", method: "notifications/initialized" });
  return request;
}

function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const skip = (why: string): Outcome => ({ kind: "not exercised", why });

/**
 * The core smoke over a GET-only client. `requests` reads the dispatcher's
 * request count. Returns the exit code.
 */
export async function runCore(
  config: Config,
  http: HttpClient,
  requests: () => number,
  out: Out,
  days: number,
  options: CoreOptions = {},
): Promise<number> {
  const now = options.now ?? Date.now();
  const to = utcDay(now);
  const from = utcDay(now - (days - 1) * DAY_MS);
  out(
    `smoke core: GET only; every core tool through the server in process; counts and calls only, no names, ids or text. Period ${from} to ${to} (the last ${days} days, UTC). Keep this output in docs/private/account-facts.md (gitignored); copy only counts into tracked files.`,
  );
  const dir = await mkdtemp(join(options.tmpRoot ?? tmpdir(), "freshdesk-mcp-smoke-"));
  let server: McpServer | undefined;
  try {
    await chmod(dir, 0o700);
    const team: TeamConfig = deepFreeze(structuredClone({ ...config.team, toolsets: ["core"] }));
    const context: AppContext = Object.freeze({
      http,
      schema: new SchemaService(http, team.limits.schema_ttl_s),
      team,
      exportDir: dir,
      ticketOutput: (
        schema: Parameters<AppContext["ticketOutput"]>[0],
        ticket: Record<string, unknown>,
      ) => ticketOutput(schema, ticket, team.fields),
    });
    server = createServer(context, options.toolsets ?? TOOLSETS);
    const request = await open(server);
    const listed = (await request("tools/list")).tools as { name: string }[];
    const registered = listed.map((tool) => tool.name);
    const lines: Line[] = [];

    /** One call of `tool`, or a line saying why it was not made. Returns the passed value. */
    const run = async (
      label: string,
      tool: string,
      args: Record<string, unknown> | Outcome,
    ): Promise<unknown> => {
      const before = requests();
      let result: { outcome: Outcome; value?: unknown };
      if ("kind" in args) result = { outcome: args as Outcome };
      else if (!registered.includes(tool)) {
        result = { outcome: { kind: "fail", code: "not_registered" } };
      } else {
        try {
          const sent = (await request("tools/call", {
            name: tool,
            arguments: args,
          })) as unknown as CallResult;
          options.seen?.(tool, sent);
          result = outcomeOf(tool, sent);
        } catch {
          result = { outcome: { kind: "fail", code: "exception" } };
        }
      }
      lines.push({ label, tool, outcome: result.outcome, calls: requests() - before });
      return result.value;
    };

    await run("get_ticket_schema", "get_ticket_schema", {});
    await run("list_agents", "list_agents", {});
    await run("list_groups", "list_groups", {});
    const tickets = (await run("list_tickets", "list_tickets", {})) as
      z.output<typeof idRows> | undefined;
    await run("list_tickets uncategorized", "list_tickets", { uncategorized: true });
    const ticketId = tickets?.items[0]?.id;
    const ticket = ticketId === undefined ? skip("no ticket") : { ticket_id: ticketId };
    await run("get_ticket", "get_ticket", ticket);
    await run("find_similar_tickets", "find_similar_tickets", ticket);
    await run("triage_queue", "triage_queue", {});
    await run("search_tickets", "search_tickets", { query: `created_at:>'${from}'` });
    const tree = (await run("list_solution_tree", "list_solution_tree", {})) as
      z.output<typeof treeShape> | undefined;
    // The tree's first article when it has one; else (a large knowledge base
    // can exhaust the tree's list cap on folders) the tree of the first
    // category with a folder; else the first folder's name for the term and
    // the first search hit for the article.
    const foldersOf = (outline: z.output<typeof treeShape> | undefined) =>
      outline?.categories.flatMap((category) => category.folders ?? []) ?? [];
    const firstArticle = (outline: z.output<typeof treeShape> | undefined) =>
      foldersOf(outline).flatMap((folder) => folder.articles ?? [])[0];
    const folders = foldersOf(tree);
    let article = firstArticle(tree);
    const category = tree?.categories.find((each) => (each.folders?.length ?? 0) > 0)?.id;
    if (article === undefined && category !== undefined) {
      const one = (await run("list_solution_tree category", "list_solution_tree", {
        category,
      })) as z.output<typeof treeShape> | undefined;
      article = firstArticle(one);
    }
    const term = firstWord(article?.title) ?? firstWord(folders[0]?.name);
    const hits = (await run(
      "search_solutions",
      "search_solutions",
      term === undefined ? skip("no article title or folder name to search for") : { term },
    )) as z.output<typeof idRows> | undefined;
    const articleId = article?.id ?? hits?.items[0]?.id;
    await run(
      "get_solution_article",
      "get_solution_article",
      articleId === undefined ? skip("no article") : { article_id: articleId },
    );
    const canned = (await run("list_canned_responses", "list_canned_responses", {})) as
      z.output<typeof cannedShape> | undefined;
    const responseId = canned?.items.flatMap((folder) => folder.responses)[0]?.id;
    await run(
      "get_canned_response",
      "get_canned_response",
      responseId === undefined ? skip("no canned response") : { canned_response_id: responseId },
    );
    const created_between = { from, to };
    await run("count_tickets", "count_tickets", { group_by: ["status"], created_between });
    await run("export_tickets", "export_tickets", { format: "jsonl", created_between });

    for (const name of registered) {
      if (!lines.some((line) => line.tool === name)) {
        lines.push({
          label: name,
          tool: name,
          outcome: { kind: "fail", code: "no_smoke_call" },
          calls: 0,
        });
      }
    }
    const order = (line: Line) => {
      const at = registered.indexOf(line.tool);
      return at === -1 ? registered.length : at;
    };
    for (const line of [...lines].sort((a, b) => order(a) - order(b))) {
      out(`tool ${line.label}: ${outcomeText(line.outcome)}, calls ${line.calls}`);
    }
    for (const [name, labels] of USE_CASES) {
      const own = labels.flatMap((label) => lines.filter((line) => line.label === label));
      out(`use case ${name} (${labels.join(", ")}): ${useCase(own)}`);
    }
    const tally = (name: string) => lines.filter((line) => shortName(line.outcome) === name).length;
    const failed = tally("fail") > 0;
    out(
      `smoke core: ${lines.length} tool lines, ${tally("pass")} pass, ${tally("pass (empty)")} pass (empty), ${tally("not exercised")} not exercised, ${tally("refused (budget)")} refused (budget), ${tally("fail")} fail; ${requests()} calls`,
    );
    out(failed ? "smoke core: fail" : "smoke core: ok");
    return failed ? 1 : 0;
  } finally {
    await server?.close().catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }
}
