// Configuration (SPEC §10): personal settings from the command line and the
// environment, team settings from an optional JSON file.
//
// Personal (command line, parsed by parseCliArgs from what cli.ts passes):
//   --export-dir <dir>, --export-dir=<dir>  export_tickets' directory, optional;
//                                           wins over FRESHDESK_EXPORT_DIR
//   --version                               print the version and exit
// Anything else on the command line is refused (RFC 2026-11-25, export-dir
// flag), naming only an option this server knows, never the token.
//
// Personal (env):
//   FRESHDESK_DOMAIN, FRESHDESK_API_KEY   required
//   FRESHDESK_MCP_CONFIG                  path of the team file, optional
//   FRESHDESK_HOST_OVERRIDE               one exact hostname, optional
//   FRESHDESK_EXPORT_DIR                  export_tickets' directory, optional;
//                                         the fallback when --export-dir is absent
// The override is personal on purpose: a shared team file must not be able
// to point everyone's API key at another host, so the team schema has no
// such key and refuses unknown ones. The export directory is personal too
// (owner, 2026-11-23): a shared file does not choose a local path, and a team
// file that still carries `export_dir` is refused as an unknown key. Whether
// the directory is usable (absolute, existing, not a symlink) is checked by
// `export_tickets` when it runs, not here: unset, only that tool is refused.
//
// This module checks presence and types, plus the override's shape (one
// lower-case dotted hostname, see isHostname). Whether the domain or the
// override is an acceptable host to send the key to is the HTTP client's
// rule (SPEC §7.1), checked there at construction and per request.
//
// A ConfigError's message names the variable, or the file's path and the
// key path inside it. It quotes no value from the environment or the file
// (which may not be the file the user meant), with two exceptions it needs
// to be useful: the FRESHDESK_MCP_CONFIG path and the file's key names.
// Wherever the API key's text would appear in either, it is replaced.

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { z } from "zod";

export class ConfigError extends Error {
  override name = "ConfigError";
}

const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const HOSTNAME = new RegExp(`^(?:${LABEL}\\.)+${LABEL}$`);

/**
 * A lower-case, dotted DNS name: no scheme, port, path, wildcard or IP.
 * The last label starts with a letter, so no spelling of an IPv4 address
 * that a URL parser accepts (`1.2.3.4`, `1.2.3.0x4`) passes.
 */
function isHostname(value: string): boolean {
  return value.length <= 253 && HOSTNAME.test(value) && /\.[a-z][a-z0-9-]*$/.test(value);
}

const required = (name: string) =>
  z.string({ error: `${name} is required` }).min(1, `${name} is required`);

const envSchema = z.object({
  FRESHDESK_DOMAIN: required("FRESHDESK_DOMAIN"),
  FRESHDESK_API_KEY: required("FRESHDESK_API_KEY"),
  FRESHDESK_MCP_CONFIG: z.string().optional(),
  FRESHDESK_HOST_OVERRIDE: z
    .string()
    .refine(isHostname, {
      error:
        "FRESHDESK_HOST_OVERRIDE must be one lower-case hostname (like support.example.com): no scheme, port, path or wildcard",
    })
    .optional(),
  FRESHDESK_EXPORT_DIR: z.string().optional(),
});

const percent = z.number().min(0).max(100);

const teamSchema = z.strictObject({
  /** Enabled toolsets (SPEC §8.1). */
  toolsets: z
    .array(z.enum(["core", "write", "send"]))
    .min(1)
    .default(["core"]),
  /** Per ticket field, keyed by label or API name (SPEC §7.3). */
  fields: z
    .record(
      z.string().min(1),
      z.strictObject({
        /** Text telling the model what the field means. */
        meaning: z.string().min(1).optional(),
        /**
         * Left out of a ticket's detail output (personal data). Not an access
         * control: not applied to the schema tool, to queries or to input, and
         * not guaranteed in rows, counts or exports (SPEC §7.3).
         */
        hidden: z.boolean().default(false),
      }),
    )
    .default({}),
  /** A ticket is uncategorised when these are empty. Absent: the default rule of SPEC §10. */
  uncategorised_fields: z.array(z.string().min(1)).min(1).optional(),
  /** Who `forward_ticket` may write to: `@domain` or a full address. */
  forward_allow_list: z
    .array(z.string().regex(/^[^@\s]*@[^@\s]+$/, 'expected "@domain" or a full address'))
    .default([]),
  limits: z
    .strictObject({
      /** Below this share of the rate-limit window, expensive operations are refused. */
      reserve_pct: percent.default(20),
      /** Below this share, everything waits or fails fast. */
      floor_pct: percent.default(5),
      /** Pacing of expensive operations, requests per second. */
      pacing_rps: z.number().positive().default(2),
      /** Most tickets one bulk call may change. */
      bulk_cap: z.int().positive().default(50),
      /** How long the ticket-field schema is cached, seconds. */
      schema_ttl_s: z.int().positive().default(3600),
      /** Most API calls one tool call may estimate before it needs `confirm: true` (SPEC §7.2). */
      call_budget: z.int().positive().default(250),
    })
    .refine((limits) => limits.floor_pct <= limits.reserve_pct, {
      path: ["floor_pct"],
      error: "must not be above reserve_pct",
    })
    .prefault({}),
});

export type TeamConfig = z.infer<typeof teamSchema>;

export interface Config {
  domain: string;
  apiKey: string;
  /** Exact hostname allowed besides `*.freshdesk.com`; off when absent. */
  hostOverride?: string;
  /** `export_tickets`' directory, as set; checked by the tool. Absent when unset. */
  exportDir?: string;
  team: TeamConfig;
}

/** What the command line says. */
export interface CliArgs {
  version: boolean;
  /** `--export-dir`'s value, as given (checked by the tool). Absent when not given. */
  exportDir?: string;
}

/**
 * Parse the server's command line (`process.argv.slice(2)`). Throws
 * `ConfigError` on an unknown option, a positional argument, an option given
 * twice, `--export-dir` with no or an empty value, or `--version` with a value.
 * The message never quotes a token: `parseArgs`' own messages do, so the list
 * is parsed leniently into tokens and each token is checked here.
 */
export function parseCliArgs(args: readonly string[]): CliArgs {
  const { tokens } = parseArgs({
    args: [...args],
    options: { "export-dir": { type: "string" }, version: { type: "boolean" } },
    strict: false,
    allowPositionals: true,
    tokens: true,
  });
  const refuse = (why: string) =>
    new ConfigError(`Invalid command line: ${why}. The server takes --export-dir <dir> only.`);
  const result: CliArgs = { version: false };
  let exportDirSeen = false;
  for (const token of tokens) {
    if (token.kind === "positional") throw refuse("a positional argument is not accepted");
    if (token.kind === "option-terminator") throw refuse("an unknown option was given");
    if (token.name === "version") {
      if (token.value !== undefined) throw refuse("--version takes no value");
      if (result.version) throw refuse("--version is given more than once");
      result.version = true;
    } else if (token.name === "export-dir") {
      if (exportDirSeen) throw refuse("--export-dir is given more than once");
      exportDirSeen = true;
      // As strict parsing does: a separate value starting with "-" is taken
      // for a missing value, so `--export-dir --version` is not a path.
      const value = token.value;
      if (value === undefined || value === "" || (!token.inlineValue && value.startsWith("-"))) {
        throw refuse("--export-dir needs a directory (--export-dir <dir> or --export-dir=<dir>)");
      }
      result.exportDir = value;
    } else {
      throw refuse("an unknown option was given");
    }
  }
  return result;
}

/** One line per problem: `"path.to.key": what is wrong`. Never the value. */
function describeIssues(issues: z.core.$ZodIssue[]): string[] {
  return issues.flatMap((issue) => {
    const at = (path: PropertyKey[]) => `"${path.map(String).join(".")}"`;
    if (issue.code === "unrecognized_keys") {
      return issue.keys.map((key) => `${at([...issue.path, key])}: unknown key`);
    }
    return [`${issue.path.length === 0 ? "the file" : at(issue.path)}: ${issue.message}`];
  });
}

function loadTeamConfig(path: string | undefined): TeamConfig {
  if (path === undefined) return teamSchema.parse({});

  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    // No `cause`, here and below: its text may quote the file. Only a
    // Node error code (ENOENT, EACCES, EISDIR) is passed on.
    const code = /^E[A-Z]+$/.exec(String((err as NodeJS.ErrnoException).code))?.[0];
    throw new ConfigError(
      `Cannot read the team config ${path} (FRESHDESK_MCP_CONFIG)${code ? `: ${code}` : ""}.`,
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ConfigError(`The team config ${path} is not valid JSON.`);
  }
  const parsed = teamSchema.safeParse(json);
  if (!parsed.success) {
    throw new ConfigError(
      [`Invalid team config ${path}:`, ...describeIssues(parsed.error.issues)].join("\n  "),
    );
  }
  return parsed.data;
}

/**
 * Load and validate the configuration. `args` is what `parseCliArgs` gave:
 * its `exportDir`, when present, wins over FRESHDESK_EXPORT_DIR. Throws
 * `ConfigError`.
 */
export function loadConfig(env: NodeJS.ProcessEnv, args: Pick<CliArgs, "exportDir"> = {}): Config {
  // An MCP client may pass an unset optional setting as an empty string.
  const parsed = envSchema.safeParse({
    FRESHDESK_DOMAIN: env.FRESHDESK_DOMAIN,
    FRESHDESK_API_KEY: env.FRESHDESK_API_KEY,
    FRESHDESK_MCP_CONFIG: env.FRESHDESK_MCP_CONFIG || undefined,
    FRESHDESK_HOST_OVERRIDE: env.FRESHDESK_HOST_OVERRIDE || undefined,
    FRESHDESK_EXPORT_DIR: env.FRESHDESK_EXPORT_DIR || undefined,
  });
  if (!parsed.success) {
    throw new ConfigError(
      ["Invalid environment:", ...parsed.error.issues.map((issue) => issue.message)].join("\n  "),
    );
  }
  const personal = parsed.data;
  const exportDir = args.exportDir ?? personal.FRESHDESK_EXPORT_DIR;
  let team: TeamConfig;
  try {
    team = loadTeamConfig(personal.FRESHDESK_MCP_CONFIG);
  } catch (err) {
    // The path and the file's key names are quoted: a key pasted into the
    // wrong setting, or a wrong file, must not put the API key in a message.
    if (!(err instanceof ConfigError)) throw err;
    throw new ConfigError(
      err.message.replaceAll(personal.FRESHDESK_API_KEY, "[FRESHDESK_API_KEY]"),
    );
  }
  return {
    domain: personal.FRESHDESK_DOMAIN,
    apiKey: personal.FRESHDESK_API_KEY,
    ...(personal.FRESHDESK_HOST_OVERRIDE === undefined
      ? {}
      : { hostOverride: personal.FRESHDESK_HOST_OVERRIDE }),
    ...(exportDir === undefined ? {} : { exportDir }),
    team,
  };
}
