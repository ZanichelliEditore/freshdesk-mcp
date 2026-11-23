import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config.js";

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
    ["upper case", "Support.Example.com"],
    ["surrounding space", " support.example.com"],
    ["a label starting with a hyphen", "-a.example.com"],
    ["a label over 63 characters", `${"a".repeat(64)}.example.com`],
    ["a name over 253 characters", `${"a.".repeat(126)}example.com`],
  ])("rejects %s (%j), naming the variable", (_what, value) => {
    const err = errorOf(() => loadConfig({ ...baseEnv, FRESHDESK_HOST_OVERRIDE: value }));
    expect(err.message).toContain("FRESHDESK_HOST_OVERRIDE");
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
    limits: { reserve_pct: 20, floor_pct: 5, pacing_rps: 2, bulk_cap: 50, schema_ttl_s: 3600 },
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
      limits: { reserve_pct: 30, floor_pct: 10, pacing_rps: 0.5, bulk_cap: 25, schema_ttl_s: 60 },
      export_dir: "/var/tmp/exports",
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
    ["a reserve over 100 %", { limits: { reserve_pct: 101 } }, "limits.reserve_pct"],
    ["a negative floor", { limits: { floor_pct: -1 } }, "limits.floor_pct"],
    ["zero pacing", { limits: { pacing_rps: 0 } }, "limits.pacing_rps"],
    [
      "an allow-list entry with no @",
      { forward_allow_list: ["example.com"] },
      "forward_allow_list.0",
    ],
    ["an empty uncategorised list", { uncategorised_fields: [] }, "uncategorised_fields"],
    ["an empty export dir", { export_dir: "" }, "export_dir"],
    ["a boolean meaning", { fields: { Prodotto: { meaning: true } } }, "fields.Prodotto.meaning"],
  ])("%s", (_what, content, where) => {
    const path = teamFile(content);
    const err = errorOf(() => loadConfig({ ...baseEnv, FRESHDESK_MCP_CONFIG: path }));
    expect(err.message).toContain(path);
    expect(err.message).toContain(`"${where}"`);
  });

  it.each([
    ["an array", []],
    ["a string", "core"],
    ["null", null],
  ])("a file holding %s is refused", (_what, content) => {
    const path = teamFile(content);
    const err = errorOf(() => loadConfig({ ...baseEnv, FRESHDESK_MCP_CONFIG: path }));
    expect(err.message).toContain(path);
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
      "export_dir",
      "fields",
      "forward_allow_list",
      "limits",
      "toolsets",
      "uncategorised_fields",
    ]);
    expect(team.forward_allow_list.every((entry) => entry.endsWith("example.com"))).toBe(true);
  });
});
