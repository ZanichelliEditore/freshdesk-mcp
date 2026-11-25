# Changelog

All notable changes to `@zanichelli/freshdesk-mcp`. Versions follow semver
and stay 0.x until milestone M4, then 1.0.0.

## 0.2.0 (unreleased)

- The export directory is set with a command-line argument in the MCP
  client's `args`: `--export-dir <dir>` or `--export-dir=<dir>`.
  `FRESHDESK_EXPORT_DIR` still works as the fallback; the argument wins when
  both are set.
- **Changed:** an argument the server does not know (an unknown option, a
  positional argument, `--export-dir` with no value, an empty one, or given
  twice) now stops the server at start with a message on stderr and exit
  code 1; 0.1.0 ignored it. The message never quotes the argument.
- `--version` is read anywhere in the argument list.

## 0.1.0 (2026-11-25)

- First release: the read-only `core` toolset (fifteen tools), served over
  stdio with your own Freshdesk API key, runnable with `npx`.
- `export_tickets` pages a period: `max_tickets` and a cursor, one file per
  call.
- `list_solution_tree` takes an optional `category`, so a large knowledge
  base still shows articles.
- Checked against a real account (GET only) before release.
- Published from CI on a version tag, with provenance.
