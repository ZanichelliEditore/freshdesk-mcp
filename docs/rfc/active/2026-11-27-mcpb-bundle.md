# `.mcpb` bundle: tool, manifest mapping, signing, the internal bundle

- **Status:** Active (owner, 2026-11-27)
- **Date:** 2026-11-27
- **Author:** freshdesk-mcp team
- [ ] Implemented

Extends RFC `2026-11-25-release-on-npm` (Active): adds a second release
artifact, the `.mcpb` attached to the GitHub release, and the internal
bundle that is never released. Fills the gap RFC
`2026-11-23-adopt-runtime-stack` left open ("`@anthropic-ai/mcpb` and
release tooling (M4, their own RFC)", line 126). Does not touch the
safety core (RFCs `2026-11-25-write-safety-core`,
`2026-11-26-send-safety-core`): the bundle packages the same server.

## Context

M4's acceptance (SPEC §13): an operator installs on a clean machine
without a terminal. Claude Desktop installs a `.mcpb` (a zip with a
`manifest.json`) by double-click and asks the values the manifest's
`user_config` declares. SPEC §10 and §11 already say: personal settings
by `user_config` with the key `sensitive`; GitHub releases carry the
`.mcpb` built by `@anthropic-ai/mcpb pack` in CI; an internal build may
bake the Zanichelli team config in "so operators type only domain and
key"; the team config stays out of the repo (SPEC §12, AGENTS.md rule 2).

What makes this an RFC: `@anthropic-ai/mcpb` is a new dependency
(AGENTS.md rule 3), and the internal bundle is a way the private team
config could leave the maintainer's hands. Decompose step 4 (PLAN, M4)
names distribution, not Freshdesk writes, as M4's danger: a bundle with
`send` enabled, or with the internal config, reaching the wrong people.

Facts this RFC rests on:

- **T-091** (owner, 2026-11-27, Claude Desktop `7.37095.0`, macOS
  `27.2.1`, throwaway bundle, dummy values; task file "Done"):
  - Desktop runs a `server.type: "node"` bundle on its own Electron Node,
    `v24.22.3`, not the machine's Node. That meets `engines >=22.19`.
  - An **unset optional** `string`, `file` or `directory` field arrives
    as the literal text `${user_config.<name>}`, not absent and not empty.
  - `file` and `directory` fields arrive as existing paths of their kind.
  - The `sensitive` dummy was not found by an ASCII `grep` of Desktop's
    support and log folders (manifests excluded). Where Desktop stores it
    was not checked; the one unfiltered hit was not counted (T-091 "Open
    doubts").
  - `compatibility.runtimes.node` was not tested.
  - The probe had no dependencies: the real server (undici 8, the MCP
    SDK) has not run on Desktop's Node.
- **The config code at `73677cd` (2026-11-27):** `loadConfig` treats only an empty string as
  unset (`src/config.ts:236-243`). An unset team-file field arriving as
  the placeholder stops the start (`readFileSync` ENOENT,
  `src/config.ts:206`); an unset export field arriving as the placeholder
  is refused by `export_tickets` (`!isAbsolute`,
  `src/tools/toolsets/core/export-tickets.ts:247`). Fail-closed, but an
  install with an optional field left empty does not start. An empty
  `--export-dir` in `args` stops the start (`src/config.ts:180`).
- **The package** (`npm view`, 2026-11-27): `@anthropic-ai/mcpb` 2.1.2,
  MIT, bin `mcpb`, nine runtime dependencies (`zod` 3, `fflate`,
  `ignore`, `galactus`, `commander`, `node-forge`, `pretty-bytes`,
  `@inquirer/prompts`, `zod-to-json-schema`). A devDependency only: none
  of it enters the bundle, which holds `dist/` and this project's
  production `node_modules`.
- **OD-34** (accepted 2026-11-26): "the procedure, plus no npm release
  that accepts `send` until T-087 is `done`". PLAN M4 widens it for this
  milestone: "no tag, release or distributed bundle before T-087 is
  `done`" (PLAN, M4 order paragraph). This RFC follows the wider rule:
  it covers the public and the internal bundle, whatever toolsets they
  enable. **The gate is met:** T-087 is `done (2026-11-26)` (PLAN, T-087
  row).
- **DPO** (owner, 2026-11-27): the DPO validation SPEC §12 lists as open
  was obtained on 2026-11-23 and covers all three toolsets (`core`,
  `write`, `send`).

## Decision

Each open decision (PLAN M4, OD-35 to OD-42) with the owner's answer
(2026-11-27), given one question at a time on this draft.

### 1. The `user_config` mapping (no OD; T-090's scope)

| Field | Type | Required | Reaches the server as |
|---|---|---|---|
| domain | `string` | yes | env `FRESHDESK_DOMAIN` |
| API key | `string`, `sensitive: true` | yes | env `FRESHDESK_API_KEY` |
| team file (public bundle only) | `file` | no | env `FRESHDESK_MCP_CONFIG` |
| export directory | `directory` | no | env `FRESHDESK_EXPORT_DIR` |

- Everything goes by **env, never `args`**. An empty `--export-dir`
  stops the start (`src/config.ts:180`); a placeholder one is accepted
  as a path and refused only later by `export_tickets`; and a flag wins
  over env, so making a placeholder flag mean unset would need a second
  fix in `parseCliArgs`. Env needs one fix in one place (T-093). `args`
  stays empty in the manifest.
- `FRESHDESK_HOST_OVERRIDE` is **not** in the manifest: it is a test
  hook, not an operator setting.
- The two optional fields need T-093 first: the server must take the
  literal `${user_config.<name>}` of **those two variables only** as
  unset, never as a value, and never skip a check because of it. The
  match is exact: the whole value equal to `${user_config.<that
  variable's own field name>}`. Any other value, any other `${…}`
  included (an unexpanded `${__dirname}/team-config.json`, decision 6),
  stays a path and fails closed (ENOENT, `src/config.ts:206`); a broader
  match would start the server on the defaults, where `fields` is `{}`
  and fields the team config hides reappear in ticket detail output.
  T-093 tests a literal `${__dirname}/…` value. A placeholder in
  `FRESHDESK_DOMAIN` or `FRESHDESK_API_KEY` stays an error. A manifest `default` of `""` might avoid the placeholder; it was
  not tested, so T-093 checks it before choosing between the two.

### 2. OD-35, the tool: `@anthropic-ai/mcpb` as a pinned devDependency (a)

Pinned to an exact version (`2.1.2` or the then-current one) in
`package.json`, locked in `package-lock.json`. Local `make mcpb` and CI
run the same locked binary; `npm audit` and Dependabot see it. The bundle
is packed from a staging directory holding `manifest.json`, `dist/` and
an `npm ci --omit=dev` tree, so no devDependency enters it.

Rejected: (b) `npx @anthropic-ai/mcpb@<exact>` in CI only: no lock entry,
so its transitive tree is resolved fresh each run and `npm audit` never
sees it, and a local build may differ from CI's. (c) A script that writes
the zip: T-091 showed plain `zip` works, and it avoids nine dependencies;
manifest validation could be a test instead. It loses on one point:
SPEC §11 already names `mcpb pack` (owner's spec), and the tool tracks
the manifest format as Desktop changes it, which a script would have to
follow by hand. The nine dependencies are confined (decision 5: they run
with read-only rights). Close call; reversible.

### 3. OD-42, Node: keep `engines >=22.19` (a)

T-091 measured Desktop's Node at `v24.22.3`, with no
`compatibility.runtimes.node` in the manifest. The manifest **omits**
that field: whether it changes which Node Desktop runs is untested
(T-091 "Open doubts"), and adding it would make the measured setup a
different one. Because Desktop updates its own Node, the floor is a
check made per release, not a one-off: T-092's acceptance includes the
**real** bundle starting on Desktop, answering one `core` read (the
probe had no dependencies), and logging `process.versions.electron` as
T-091 did, so a start on the machine's own Node (Homebrew `v22.23.5` on
the owner's) cannot pass unnoticed.

Rejected: (b) a system Node: a terminal step, against M4's acceptance.
(c) Lowering the floor: no finding asks for it, and it would amend the
runtime RFC's undici reason.

### 4. OD-36, signing: unsigned for 1.0.0 (a)

The release notes carry the bundle's SHA-256; the operator guide says to
install only from the release page or the internal place, and shows
whatever Desktop displays for an unsigned bundle. Unverified: T-091
installed an unsigned bundle and recorded no warning, so whether one
appears, and its text, is captured by T-097 from a real install. An
organisation certificate (c) is revisited with IT after 1.0.0.

Rejected: (b) `mcpb sign` self-signed: a self-signed signature names no
one the operator can check, so it adds a key to guard for little trust
(how Desktop shows a self-signed bundle is unverified). (c) now: it needs
IT's certificate and a CI secret before 1.0.0, for a first user group of
named colleagues.

### 5. Where the public bundle is built and released

In `release.yml`, on the same `v*` tag that publishes to npm, split as
the npm path already is (`build` read-only, `publish` the only job with
more rights):

- **Pack, read-only:** `make mcpb` runs with `contents: read` (in the
  `build` job or one like it) and uploads the bundle and its SHA-256 as
  a workflow artifact. Read-only rights limit the token, not what the
  code can do to the run's artifacts: once `@anthropic-ai/mcpb` is a
  devDependency, every `npm ci` in the file (`quality`, `gitleaks`,
  `build`) installs its tree, and the repo has no `.npmrc`, so its
  install scripts run. A compromised package there could alter the npm
  tarball or the bundle before upload. T-094 makes each consuming job
  recompute the SHA-256 of what it downloads and refuse a mismatch with
  the hash the producing job gave as a job output (`build` to `publish`,
  pack to attach). That proves **transit integrity only**: the hash is
  taken in the producing job after its dependencies ran, so it cannot
  catch tampering there. `npm ci --ignore-scripts` would not close it in
  the pack job either, where the mcpb tool's tree runs as code. How to
  guard the build itself (scripts off in `quality`, `gitleaks` and
  `build`; the pack job starting from `build`'s tarball; attach comparing
  the bundle's server files with the tarball) is open for T-094, decided
  by the owner (T-090 "Open doubts").
- **Attach, `contents: write`:** `needs: [quality, gitleaks, build]` and
  the pack job; the same `if:` as `publish` (`github.event_name ==
  'push' && startsWith(github.ref, 'refs/tags/v')`), so a
  `workflow_dispatch` run, which publishes nothing, never reaches it,
  and T-094's `test_release_workflow.py` asserts that `if:`; runs the
  same tag checks as `publish`
  (`tools/checks/release_version.py "$GITHUB_REF_NAME"`, the tagged
  commit an ancestor of `origin/main`); downloads the artifact and runs
  only `gh release create "$GITHUB_REF_NAME" --verify-tag` with the
  bundle and the SHA-256 in the notes. No `npm`, no `npx`, no checkout
  credentials kept. `release.yml` at `73677cd` creates no GitHub
  release; this job does.

Every `uses:` pinned by SHA, as the rest of the file. The public
bundle's team-file field is optional, so with no file it runs on the
defaults (`toolsets` `["core"]`, `src/config.ts:77-80`). OD-34 as read
above: no tag before T-087 is `done` (met).

Rejected: building on a maintainer's machine and uploading by hand: no
provenance, and the published file may not match the tag. One job doing
both pack and attach: the mcpb tool's dependency tree would run with
`contents: write`.

### 6. OD-37, the internal bundle: a maintainer derives it from the released public bundle (a, refined)

`make mcpb-internal TAG=v<x.y.z> TEAM_CONFIG=<path>`, run by a
maintainer, starts from the **CI-built public bundle of that tag**, not
from the local tree, so the code is the release's and only the config
is added by hand:

- downloads the tag's public bundle from the GitHub release and checks
  it against the SHA-256 in the release notes; refuses on mismatch.
  This proves the file matches the release page, not that CI built it:
  whoever can edit the release can change both (stronger check parked,
  `docs/improvements.md`);
- resolves `TEAM_CONFIG`'s real path (symlinks followed) and refuses it
  if it is inside any git working tree; only git's "not a git
  repository" answer counts as outside: any other git error (git
  missing, `safe.directory`, a `GIT_DIR` or `GIT_WORK_TREE` set) refuses;
- validates the file with the server's own schema, and refuses any
  `toolsets` outside a tracked list that states OD-40's answer (on
  2026-11-27, all three, decision 8): changing it is a reviewed commit, not a build
  option;
- unpacks, adds the file as `team-config.json`, sets
  `FRESHDESK_MCP_CONFIG` to `${__dirname}/team-config.json` in the
  manifest and removes the team-file field, so the form asks domain and
  key only; repacks with the locked `mcpb`;
- unpacks and writes the bundle only outside any git working tree,
  with the same refusal: the bundle holds the team config inside a zip
  that gitleaks and the `account-patterns` hook cannot see into.

`${__dirname}` expansion is checked in T-095. If Desktop does not expand
it, the fallback is the server resolving a relative
`FRESHDESK_MCP_CONFIG` against its own entry point's directory: a change
to `src/config.ts`, with its test, in T-093 or T-095.

How the maintainer hands the bundle and its SHA-256 to operators
(direct delivery or an internal drive) is the owner's, outside this RFC
(owner, 2026-11-27). It is never attached to a GitHub release and never built by a public CI run.
Since bundles are unsigned (decision 4), repacking loses no signature.
OD-34 as read above: no internal bundle is distributed before T-087 is
`done`, whatever its toolsets (met).

Rejected: (a) as first proposed, packing from the maintainer's working
tree: the code in the bundle would be whatever is checked out and built
locally, the stale-`dist/` risk the release RFC closed for npm. (b) a
private repository's CI: a second pipeline and its secrets to keep in
step with this one, for a build run a few times a year. (c) No internal
bundle, the operator picks the team file: a step operators get wrong,
and the file must still reach them somehow.

### 7. OD-39, where the Zanichelli team config lives: only on the maintainer's machine (c)

Owner, 2026-11-27. The file stays on the maintainer's machine, **outside
any git working tree** (not `docs/private/` inside this repo): decision
6 refuses a path inside any git working tree, and a file outside one
cannot be committed by a stray `git add -f`. Named by slug only in tracked files.

Rejected: (a) an internal drive: no history of who changed the
allow-list. (b) a private git repository (the earlier proposal): history
and review, but one more repository to set up and grant for a file one
person edits.

### 8. OD-40, operators' toolsets: all three (c)

Owner, 2026-11-27: `core`, `write` and `send`. The conditions the
proposal put on `send` are met: T-087 is `done` (OD-34) and the DPO's
validation covers all three (2026-11-23). Decision 6's tracked list
holds the three; narrowing it is a reviewed commit. The guide's rule
holds: never "consenti sempre" for a `send` tool (SPEC §11).

Rejected: (a) `core` at first (the earlier proposal) and (b) `core` and
`write`: a staged start, not needed once the DPO and T-087 have cleared
`send`.

### 9. OD-38, the Italian guide: generic in the repo, specifics internal (a)

`docs/guida-operatore.md` in the repo names no domain, allow-list, field
meaning or internal place; an internal page adds where the bundle is and
the domain to type.

Rejected: (b) all internal: the public bundle's users get no guide.
(c) in the repo naming Zanichelli: breaks the publishable repo (SPEC §1,
§12).

### 10. OD-41, the DPO: already obtained

Owner, 2026-11-27: the DPO validated on 2026-11-23, covering `core`,
`write` and `send`. OD-41's question (before T-099, or only beyond a
pilot) no longer gates anything; SPEC §12's open DPO line becomes a
dated decision at acceptance.

### 11. The `sensitive` key, until rechecked

SPEC §10 says Desktop stores the key in the OS keychain; T-091 showed
only that an ASCII search of two folders, every `manifest.json`
excluded, did not find it. The installed extension's own `manifest.json`
copy was not checked. Until the recheck T-091 names (dummy only in the
form, no exclusion, a count), SPEC §10 says "not found in Desktop's
support or log folders outside every `manifest.json`, which is
unchecked", not "in the keychain".

The recheck runs in T-092 and **gates T-097 and T-099**: the guide does
not tell operators where the key is kept, and no operator installs,
until it has run. If the key is found in clear, M4 stops there: the
owner decides between accepting it with a dedicated, least-privilege
Freshdesk agent key per operator stated in the guide, or raising it
with Anthropic and waiting.

## Consequences

- An operator installs by double-click and types domain and key; nothing
  else, with the internal bundle.
- One new devDependency with nine runtime dependencies of its own,
  `node-forge` among them; none ships in the bundle. They are installed
  by every `npm ci` in CI, all jobs with read-only rights, and on the
  maintainer's machine for the internal repack. Decision 5's hash checks
  give transit integrity only; guarding the build itself is open for
  T-094. Dependabot and `npm audit` cover them.
- The bundle runs on Node the project does not control: a Desktop update
  could change it. Checked per release (decision 3), not prevented.
- Unsigned: operators may see a warning (T-097 captures it) and must be
  told it is expected,
  which also teaches them to click through warnings. The SHA-256 and the
  "only from these two places" rule are the mitigation, not a fix.
- The internal bundle's code matches the release asset (SHA-256 against
  the release page, which its editors could change); its config is the maintainer's word and the SHA-256 on the
  internal page. It holds the team config in clear inside a zip: anyone
  with the file has the allow-list and field meanings (not the key,
  which each operator types). An internal bundle needs a public release
  of the same tag first.
- Operators get `send` from their first install: they can email
  customers and forward to allow-listed colleagues from day one, through
  the send core's confirm and allow-list (RFC
  `2026-11-26-send-safety-core`). The guide's "never consenti sempre for
  a `send` tool" is the operator-side guard; nothing in the bundle can
  enforce it.
- The team config lives on one machine: lost disk, lost allow-list and
  field meanings, and no history of who changed them. The maintainer
  keeps a backup; the built internal bundles hold a copy each.
- **Reversibility.** The tool, the mapping, signing and the release job
  are cheap to change in a later release. Two things are one-way: a
  downloaded bundle cannot be recalled (a fix ships as a new version
  operators must install), and an internal bundle that leaks exposes the
  allow-list and field meanings for good.
- Optional fields need T-093 before T-092: until then, an install with
  either left empty does not start (team file) or cannot export.
- SPEC changes at acceptance: §10's key line (decision 11), §10's
  internal-bundle line (decision 6), §11's release line (decisions 2 and
  5), §12's "internal location chosen at M4" (decision 7) and the open
  DPO line, now a dated decision (decision 10).
- PLAN at acceptance: OD-35 to OD-42 answered. T-092 to T-099
  re-checked for a `/decompose M4` amendment, which alone may change
  them:
  - T-092: depends on T-093; gains the real-bundle start on Desktop
    (with `process.versions.electron`), one `core` read and the
    `sensitive` recheck; no `compatibility.runtimes.node`.
  - T-093: confirmed, no longer conditional (T-091 found the
    placeholder); the exact match and the `${__dirname}` test of
    decision 1.
  - T-094: a read-only pack job and an attach job (`contents: write`,
    `publish`'s `if:`, tag checks, `gh release create` only); hashes
    recomputed by consuming jobs (transit only); the build guard as
    the owner decides (decision 5).
  - T-095: `TAG=` and starts from the released bundle; real path
    refused inside any git working tree, for the config, staging and
    output; the tracked toolsets list.
  - T-096: the place is the maintainer's machine, outside any git
    working tree (OD-39); `toolsets` all three (OD-40).
  - T-097: gated on the `sensitive` recheck; captures what Desktop shows
    for an unsigned bundle; covers `send` tools from the first install.
  - T-098: its `OD-41` dependency drops (decision 10).
  - T-099: gated on the `sensitive` recheck; its DPO precondition is
    met (2026-11-23).

## Alternatives considered

Per decision above. Across all of them: **a single public bundle with no
internal variant** (OD-37 (c)) is the simplest; it is rejected because it
gives the operator a file to pick and the team file still has to reach
them. **Not shipping a bundle** (operators on `npx` via Claude Code)
fails M4's "without a terminal".
