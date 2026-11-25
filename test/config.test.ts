import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ConfigError, loadConfig, parseCliArgs } from "../src/config.js";

// Tests never read process.env: each passes its own env object, and a team
// config comes from a temp file or the shipped example only.
const API_KEY = "test-test-test-test";
const baseEnv = { FRESHDESK_DOMAIN: "acme.freshdesk.com", FRESHDESK_API_KEY: API_KEY };

const dir = mkdtempSync(join(tmpdir(), "freshdesk-mcp-config-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let fileCount = 0;
function teamFile(content: unknown): string {
  const path = join(dir, `team-${fileCount++}.json`);
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
  return path;
}

function loadTeam(content: unknown) {
  return loadConfig({ ...baseEnv, FRESHDESK_MCP_CONFIG: teamFile(content) });
}

function errorOf(run: () => unknown): ConfigError {
  try {
    run();
  } catch (err) {
    expect(err).toBeInstanceOf(ConfigError);
    return err as ConfigError;
  }
  throw new Error("expected a ConfigError, none thrown");
}

describe("personal settings (env)", () => {
  it("loads domain and key; no override and no team file by default", () => {
    const config = loadConfig(baseEnv);
    expect(config.domain).toBe("acme.freshdesk.com");
    expect(config.apiKey).toBe(API_KEY);
    expect(config.hostOverride).toBeUndefined();
  });

  it.each([
    ["FRESHDESK_DOMAIN", undefined],
    ["FRESHDESK_DOMAIN", ""],
    ["FRESHDESK_API_KEY", undefined],
    ["FRESHDESK_API_KEY", ""],
  ])("rejects %s = %j, naming the variable", (name, value) => {
    const err = errorOf(() => loadConfig({ ...baseEnv, [name]: value }));
    expect(err.message).toContain(name);
  });

  it("reports both missing variables at once", () => {
    const err = errorOf(() => loadConfig({}));
    expect(err.message).toContain("FRESHDESK_DOMAIN");
    expect(err.message).toContain("FRESHDESK_API_KEY");
  });

  it("FRESHDESK_EXPORT_DIR is kept as set, unchecked; empty or absent is unset", () => {
    expect(loadConfig({ ...baseEnv, FRESHDESK_EXPORT_DIR: "/srv/exports" }).exportDir).toBe(
      "/srv/exports",
    );
    expect(loadConfig({ ...baseEnv, FRESHDESK_EXPORT_DIR: "exports" }).exportDir).toBe("exports");
    expect(loadConfig({ ...baseEnv, FRESHDESK_EXPORT_DIR: "" })).not.toHaveProperty("exportDir");
    expect(loadConfig(baseEnv)).not.toHaveProperty("exportDir");
  });

  it("an empty FRESHDESK_MCP_CONFIG or FRESHDESK_HOST_OVERRIDE counts as unset", () => {
    const config = loadConfig({
      ...baseEnv,
      FRESHDESK_MCP_CONFIG: "",
      FRESHDESK_HOST_OVERRIDE: "",
    });
    expect(config.hostOverride).toBeUndefined();
    expect(config.team.toolsets).toEqual(["core"]);
  });
});

describe("custom-domain override: one exact hostname", () => {
  it.each(["support.example.com", "help.support.example.co.uk", "xn--bcher-kva.example"])(
    "accepts %s",
    (host) => {
      expect(loadConfig({ ...baseEnv, FRESHDESK_HOST_OVERRIDE: host }).hostOverride).toBe(host);
    },
  );

  it.each([
    ["a boolean", "true"],
    ["a boolean", "false"],
    ["a boolean", "1"],
    ["a single label", "localhost"],
    ["a URL", "https://support.example.com"],
    ["a port", "support.example.com:8443"],
    ["a path", "support.example.com/api"],
    ["a wildcard", "*.example.com"],
    ["a leading dot", ".example.com"],
    ["a trailing dot", "support.example.com."],
    ["two hostnames", "a.example.com,b.example.com"],
    ["two hostnames", "a.example.com b.example.com"],
    ["userinfo", "x@evil.example"],
    ["an IPv4 address", "203.0.113.7"],
    ["an IPv4 address with a hex part", "203.0.113.0x7"],
    ["a numeric last label", "support.example.123"],
    ["a trailing newline", "support.example.com\n"],
    ["a name of 254 characters", `${"a.".repeat(123)}${"b".repeat(8)}`],
    ["upper case", "Support.Example.com"],
    ["surrounding space", " support.example.com"],
    ["a label starting with a hyphen", "-a.example.com"],
    ["a label over 63 characters", `${"a".repeat(64)}.example.com`],
    ["a name over 253 characters", `${"a.".repeat(126)}example.com`],
  ])("rejects %s (%j), naming the variable", (_what, value) => {
    const err = errorOf(() => loadConfig({ ...baseEnv, FRESHDESK_HOST_OVERRIDE: value }));
    expect(err.message).toContain("FRESHDESK_HOST_OVERRIDE");
  });

  it("accepts a 63-character label and a 253-character name", () => {
    for (const host of [`${"a".repeat(63)}.example.com`, `${"a.".repeat(123)}${"b".repeat(7)}`]) {
      expect(host.length).toBeLessThanOrEqual(253);
      expect(loadConfig({ ...baseEnv, FRESHDESK_HOST_OVERRIDE: host }).hostOverride).toBe(host);
    }
  });

  it("is personal: a team file cannot set it", () => {
    for (const key of ["host_override", "hostOverride", "domain", "api_key"]) {
      const err = errorOf(() => loadTeam({ [key]: "evil.example" }));
      expect(err.message).toContain(key);
    }
  });
});

describe("team config: defaults", () => {
  const defaults = {
    toolsets: ["core"],
    fields: {},
    forward_allow_list: [],
    limits: {
      reserve_pct: 20,
      floor_pct: 5,
      pacing_rps: 2,
      bulk_cap: 50,
      schema_ttl_s: 3600,
      call_budget: 250,
    },
  };

  it("applies every default with no team file", () => {
    expect(loadConfig(baseEnv).team).toEqual(defaults);
  });

  it("applies every default to an empty team file", () => {
    expect(loadTeam({}).team).toEqual(defaults);
  });

  it("keeps the other limits' defaults when one is set", () => {
    expect(loadTeam({ limits: { bulk_cap: 10 } }).team.limits).toEqual({
      ...defaults.limits,
      bulk_cap: 10,
    });
  });

  it("returns what the file sets", () => {
    const team = {
      toolsets: ["core", "write", "send"],
      fields: {
        Prodotto: { meaning: "Which product the ticket is about." },
        cf_tax_code: { hidden: true },
      },
      uncategorised_fields: ["cf_area", "cf_topic"],
      forward_allow_list: ["@example.com", "legal@example.org"],
      limits: {
        reserve_pct: 30,
        floor_pct: 10,
        pacing_rps: 0.5,
        bulk_cap: 25,
        schema_ttl_s: 60,
        call_budget: 1000,
      },
    };
    expect(loadTeam(team).team).toEqual({
      ...team,
      fields: {
        Prodotto: { meaning: "Which product the ticket is about.", hidden: false },
        cf_tax_code: { hidden: true },
      },
    });
  });
});

describe("team config: errors name the file and the path", () => {
  it("bad JSON names the file and quotes none of it", () => {
    const path = teamFile(`{ "toolsets": ["core"], "note": "${API_KEY}" `);
    const err = errorOf(() => loadConfig({ ...baseEnv, FRESHDESK_MCP_CONFIG: path }));
    expect(err.message).toContain(path);
    expect(err.message).toContain("not valid JSON");
    expect(err.message).not.toContain(API_KEY);
    expect(err.message).not.toContain("toolsets");
  });

  it("a missing file names the file", () => {
    const path = join(dir, "absent.json");
    const err = errorOf(() => loadConfig({ ...baseEnv, FRESHDESK_MCP_CONFIG: path }));
    expect(err.message).toContain(path);
    expect(err.message).toContain("ENOENT");
  });

  it("a directory names the path and the error code", () => {
    const err = errorOf(() => loadConfig({ ...baseEnv, FRESHDESK_MCP_CONFIG: dir }));
    expect(err.message).toContain(dir);
    expect(err.message).toContain("EISDIR");
  });

  it.each([
    ["a top-level unknown key", { toolset: ["core"] }, "toolset"],
    ["a nested unknown key", { limits: { bulk_limit: 5 } }, "limits.bulk_limit"],
    [
      "an unknown key inside a field",
      { fields: { Prodotto: { hide: true } } },
      "fields.Prodotto.hide",
    ],
    ["a wrong type", { limits: { bulk_cap: "50" } }, "limits.bulk_cap"],
    ["an unknown toolset", { toolsets: ["core", "admin"] }, "toolsets.1"],
    ["no toolset at all", { toolsets: [] }, "toolsets"],
    ["a bulk cap of zero", { limits: { bulk_cap: 0 } }, "limits.bulk_cap"],
    ["a fractional bulk cap", { limits: { bulk_cap: 2.5 } }, "limits.bulk_cap"],
    ["a call budget of zero", { limits: { call_budget: 0 } }, "limits.call_budget"],
    ["a fractional call budget", { limits: { call_budget: 2.5 } }, "limits.call_budget"],
    ["a reserve over 100 %", { limits: { reserve_pct: 101 } }, "limits.reserve_pct"],
    ["a negative floor", { limits: { floor_pct: -1 } }, "limits.floor_pct"],
    ["zero pacing", { limits: { pacing_rps: 0 } }, "limits.pacing_rps"],
    [
      "a floor above the reserve",
      { limits: { reserve_pct: 20, floor_pct: 21 } },
      "limits.floor_pct",
    ],
    ["a floor above the default reserve", { limits: { floor_pct: 21 } }, "limits.floor_pct"],
    [
      "an allow-list entry with no @",
      { forward_allow_list: ["example.com"] },
      "forward_allow_list.0",
    ],
    ["an empty uncategorised list", { uncategorised_fields: [] }, "uncategorised_fields"],
    ["a boolean meaning", { fields: { Prodotto: { meaning: true } } }, "fields.Prodotto.meaning"],
  ])("%s", (_what, content, where) => {
    const path = teamFile(content);
    const err = errorOf(() => loadConfig({ ...baseEnv, FRESHDESK_MCP_CONFIG: path }));
    expect(err.message).toContain(path);
    expect(err.message).toContain(`"${where}"`);
  });

  it("a team file with export_dir is refused, naming the key: the directory is personal env", () => {
    const path = teamFile({ toolsets: ["core"], export_dir: "/var/tmp/exports" });
    const err = errorOf(() => loadConfig({ ...baseEnv, FRESHDESK_MCP_CONFIG: path }));
    expect(err.message).toContain(path);
    expect(err.message).toContain('"export_dir": unknown key');
  });

  it.each([
    ["an array", []],
    ["a string", '"core"'],
    ["null", null],
  ])("a file holding %s is valid JSON but refused by the schema", (_what, content) => {
    const path = teamFile(content);
    const err = errorOf(() => loadConfig({ ...baseEnv, FRESHDESK_MCP_CONFIG: path }));
    expect(err.message).toContain(path);
    expect(err.message).toContain("the file: ");
    expect(err.message).not.toContain("not valid JSON");
  });

  it("reports every problem in the file, not only the first", () => {
    const err = errorOf(() => loadTeam({ toolset: ["core"], limits: { bulk_cap: "50" } }));
    expect(err.message).toContain('"toolset"');
    expect(err.message).toContain('"limits.bulk_cap"');
  });
});

describe("no error message contains the API key", () => {
  it.each([
    ["missing domain", { FRESHDESK_API_KEY: API_KEY }],
    ["bad override", { ...baseEnv, FRESHDESK_HOST_OVERRIDE: API_KEY }],
    ["missing team file", { ...baseEnv, FRESHDESK_MCP_CONFIG: join(dir, "nope.json") }],
    ["bad JSON", { ...baseEnv, FRESHDESK_MCP_CONFIG: teamFile(`{"k": "${API_KEY}"`) }],
    ["key as a wrong value", { ...baseEnv, FRESHDESK_MCP_CONFIG: teamFile({ limits: API_KEY }) }],
    ["key as a toolset", { ...baseEnv, FRESHDESK_MCP_CONFIG: teamFile({ toolsets: [API_KEY] }) }],
    [
      "key as an allow-list entry",
      { ...baseEnv, FRESHDESK_MCP_CONFIG: teamFile({ forward_allow_list: [API_KEY] }) },
    ],
    ["key as the config path", { ...baseEnv, FRESHDESK_MCP_CONFIG: API_KEY }],
    ["key inside the config path", { ...baseEnv, FRESHDESK_MCP_CONFIG: join(dir, API_KEY) }],
    ["key as an unknown key", { ...baseEnv, FRESHDESK_MCP_CONFIG: teamFile({ [API_KEY]: 1 }) }],
    [
      "key as a field name",
      { ...baseEnv, FRESHDESK_MCP_CONFIG: teamFile({ fields: { [API_KEY]: { hide: true } } }) },
    ],
    [
      "key as a field name with a wrong value",
      { ...baseEnv, FRESHDESK_MCP_CONFIG: teamFile({ fields: { [API_KEY]: { hidden: 1 } } }) },
    ],
  ])("%s", (_what, env) => {
    const err = errorOf(() => loadConfig(env));
    expect(err.message).not.toContain(API_KEY);
    expect(JSON.stringify(err)).not.toContain(API_KEY);
    expect(String(err.stack)).not.toContain(API_KEY);
    expect(err.cause).toBeUndefined();
  });
});

describe("examples/team-config.example.json", () => {
  const example = join(import.meta.dirname, "..", "examples", "team-config.example.json");

  it("parses, and sets every team key", () => {
    const { team } = loadConfig({ ...baseEnv, FRESHDESK_MCP_CONFIG: example });
    expect(Object.keys(team).sort()).toEqual([
      "fields",
      "forward_allow_list",
      "limits",
      "toolsets",
      "uncategorised_fields",
    ]);
    expect(team.forward_allow_list.every((entry) => entry.endsWith("example.com"))).toBe(true);
    expect(team.limits.call_budget).toBe(250);
  });
});

describe("command-line arguments (T-060, RFC 2026-11-25 export-dir flag)", () => {
  const load = (args: string[], env: NodeJS.ProcessEnv = baseEnv) =>
    loadConfig(env, parseCliArgs(args));

  it("an empty list gives no export directory and no --version", () => {
    expect(parseCliArgs([])).toEqual({ version: false });
    expect(load([])).not.toHaveProperty("exportDir");
  });

  it.each([
    ["--export-dir /a", ["--export-dir", "/a"]],
    ["--export-dir=/a", ["--export-dir=/a"]],
  ])("%s gives exportDir /a", (_what, args) => {
    expect(load(args).exportDir).toBe("/a");
  });

  it("the flag wins over FRESHDESK_EXPORT_DIR; without it the variable is used", () => {
    const env = { ...baseEnv, FRESHDESK_EXPORT_DIR: "/b" };
    expect(load(["--export-dir", "/a"], env).exportDir).toBe("/a");
    expect(load(["--export-dir=/a"], env).exportDir).toBe("/a");
    expect(load([], env).exportDir).toBe("/b");
  });

  it("keeps the value as given, unchecked: the tool checks it", () => {
    expect(load(["--export-dir", "exports"]).exportDir).toBe("exports");
    expect(load(["--export-dir=-x"]).exportDir).toBe("-x");
  });

  it("--version is read anywhere in the list, beside valid options", () => {
    expect(parseCliArgs(["--version"])).toEqual({ version: true });
    expect(parseCliArgs(["--export-dir", "/a", "--version"])).toEqual({
      version: true,
      exportDir: "/a",
    });
    expect(parseCliArgs(["--version", "--export-dir=/a"]).version).toBe(true);
  });

  it.each([
    ["an unknown flag", ["--export_dir", "/a"], "an unknown option"],
    ["an unknown short flag", ["-v"], "an unknown option"],
    ["an unknown flag after a valid one", ["--export-dir", "/a", "--verbose"], "an unknown option"],
    ["the option terminator", ["--"], "an unknown option"],
    ["a positional argument", ["/a"], "a positional argument"],
    ["a positional after the terminator", ["--", "/a"], "an unknown option"],
    ["--version with a value", ["--version=1"], "--version takes no value"],
    ["--version given twice", ["--version", "--version"], "--version is given more than once"],
  ])("%s is refused without quoting it", (_what, args, says) => {
    const err = errorOf(() => parseCliArgs(args));
    expect(err.message).toContain(says);
    expect(err.message).not.toContain("/a");
    expect(err.message).not.toContain("--export-dir needs");
  });

  it.each([
    ["--export-dir with no value", ["--export-dir"], "--export-dir needs a directory"],
    [
      "--export-dir followed by an option",
      ["--export-dir", "--version"],
      "--export-dir needs a directory",
    ],
    [
      "--export-dir followed by a dash value",
      ["--export-dir", "-x"],
      "--export-dir needs a directory",
    ],
    ["--export-dir=", ["--export-dir="], "--export-dir needs a directory"],
    ["--export-dir with an empty value", ["--export-dir", ""], "--export-dir needs a directory"],
    [
      "--export-dir given twice",
      ["--export-dir", "/a", "--export-dir=/b"],
      "--export-dir is given more than once",
    ],
    [
      "--export-dir given twice, same value",
      ["--export-dir=/a", "--export-dir=/a"],
      "--export-dir is given more than once",
    ],
  ])("%s is refused naming --export-dir as the cause", (_what, args, cause) => {
    const err = errorOf(() => parseCliArgs(args));
    expect(err.message).toContain(cause);
    expect(err.message).not.toContain("an unknown option");
    expect(err.message).not.toContain("/a");
    expect(err.message).not.toContain("/b");
  });

  it("a refusal wins over --version", () => {
    errorOf(() => parseCliArgs(["--version", "--nope"]));
    errorOf(() => parseCliArgs(["--version", "--export-dir"]));
  });

  it.each([
    ["the API key's value as a flag", [`--${API_KEY}`], API_KEY],
    ["the API key's value as an inline flag value", [`--key=${API_KEY}`], API_KEY],
    ["the API key's value as a positional", [API_KEY], API_KEY],
    ["an arbitrary token", ["--zq9-unlikely-token"], "zq9-unlikely-token"],
    ["an arbitrary short token", ["-Zq9"], "Zq9"],
  ])("an unknown token holding %s is not in the message", (_what, args, secret) => {
    const err = errorOf(() => parseCliArgs(args));
    expect(err.message).not.toContain(secret);
    expect(JSON.stringify(err)).not.toContain(secret);
    expect(String(err.stack)).not.toContain(secret);
    expect(err.cause).toBeUndefined();
  });
});
