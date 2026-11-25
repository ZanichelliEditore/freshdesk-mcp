# Changelog

All notable changes to `@zanichelli/freshdesk-mcp`. Versions follow semver
and stay 0.x until milestone M4, then 1.0.0.

## 0.1.0 (2026-11-25)

- First release: the read-only `core` toolset (fifteen tools), served over
  stdio with your own Freshdesk API key, runnable with `npx`.
- `export_tickets` pages a period: `max_tickets` and a cursor, one file per
  call.
- `list_solution_tree` takes an optional `category`, so a large knowledge
  base still shows articles.
- Checked against a real account (GET only) before release.
- Published from CI on a version tag, with provenance.
