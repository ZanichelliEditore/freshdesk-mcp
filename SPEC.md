# freshdesk-mcp — design

- **Status:** draft for owner review, 2026-11-20
- **Owner:** Andrea (Zanichelli)
- **Supersedes:** nothing. `customer-square` (suspended 2026-11-20) is the
  predecessor; its Phase 0 findings are carried over in §5, its use cases
  and process scaffolding are not.

## 1. Intent

An MCP server that lets Zanichelli colleagues work on Freshdesk through
Claude: triage and categorise incoming tickets, find urgent ones, draft
replies from similar past cases, hand tickets to colleagues, reply, and
analyse the ticket base.

Why build one:

- The official Freshworks MCP is metered per account (Pro: 6,000
  actions/year, 50/min; extra packs $15/1,000) and answers this account
  with `403 mcp_access_denied`. The account is on **Pro Omnichannel**;
  Freshworks lists MCP support only for Freshdesk Standalone 2021 and
  Unified Omni 2026, the likely reason.
- The community servers were reviewed on 2026-11-20 (8 repos, source read,
  none run). None is adoptable: none maps custom-field labels, exports
  tickets, budgets the shared account limit, ships a `.mcpb`, or guards the
  customer-facing reply. The best ideas are borrowed (§8, §9).

Public release under MIT is a **possibility, not a goal**: the code is kept
publishable (no Zanichelli specifics in code, synthetic test data, MIT from
day one), but breadth for unknown users is not optimised.

## 2. Users and rollout

| When | Who | Client | Install |
|---|---|---|---|
| First | Technical colleagues (support and development teams) | Claude Code | `npx <package>` + env vars |
| Within ~6 months, daily | Support operators, non-technical | Claude Desktop | `.mcpb` double-click, key typed in the install form |
| Later, maybe | `customer-square` or another project that keeps ticket history | MCP client or CLI | — |

Operators are the target that decides trade-offs: small active tool list,
clear descriptions, Italian-facing docs, zero terminal steps.

Each user uses **their own Freshdesk API key**; the server inherits that
agent's permissions.

## 3. Use cases

Owner's list, 2026-11-20. "Who does it" says what the MCP provides and
what Claude (the model) does with it.

| # | Use case | MCP provides | Claude does |
|---|---|---|---|
| C1 | List recent **uncategorised** tickets; categorise them automatically with a quick approval | `list_tickets(uncategorized)`, `get_ticket_schema`, `categorize_tickets` (preview → confirm) | proposes product/sub-product/issue type per ticket; shows the table; applies on approval |
| C2 | Find the **most urgent** tickets | `triage_queue`: open tickets with urgency signals (priority, `due_by`/`fr_due_by`, overdue, age, customer replies waiting) | ranks and explains |
| C3 | For a ticket, find **similar past cases** and prepare a **draft reply** to validate | `get_ticket`, `find_similar_tickets` (best effort, §7.3), KB and canned search | writes the draft in chat, or saves it via C6 |
| C4 | **Ask feedback** from colleagues | inside Freshdesk: `add_note` (private, `notify_emails`), `update_ticket` (reassign); outside Freshdesk (internal teams): `forward_ticket` (confirm + allow-list) | picks the route, writes the request |
| C5 | **Update** and **reply** to a ticket | `update_ticket`, `reply_to_ticket` (confirm, off by default) | — |
| C6 | Prepare a **draft another agent takes over** | `hand_off_draft`: private note marked as draft + assign to agent/group + notify | — |
| C7 | **Statistics** on tickets | `count_tickets` (aggregates in code, server-side) and `export_tickets` (JSONL/CSV file) | interprets; deeper analysis on the export |
| C8 | Finer **categorisation** by area/product and problem type | as C1. Re-categorising **old/closed** tickets in bulk is a proposal only, not committed (owner, 2026-11-20): it changes `updated_at`, may fire automations, and at thousands of tickets needs a paced background command, not 50-ticket previews | — |
| C9 | Suggest **knowledge-base updates** | read KB (categories, folders, articles, search) + recent tickets by category | spots gaps, outdated articles |
| C10 | Suggest **new canned responses** | read canned responses + recent tickets/replies by category | spots repeated answers |

The Freshdesk public API cannot create the UI's reply draft; C6's "draft"
is a private note (§8.4).

## 4. Goals, non-goals, anti-goals

**Goals**
1. C1–C10 work in Claude Code (first) and Claude Desktop (`.mcpb`).
2. A typed Freshdesk API v2 client whose **interfaces** (request/response
   types and method signatures) cover **every** resource, so new tools are
   a thin layer over it (owner, 2026-11-20: "prepare interfaces for all,
   focus on few"). Interfaces and implementations both land with the
   toolset that first uses them (M5+ for the catalogue toolsets); until
   then only the catalogue, `docs/tool-catalogue.md`, covers every
   resource (owner, 2026-11-23). An endpoint the plan lacks returns a clear
   `not_available_on_plan` error, not a bare 403.
3. Custom fields read and written by **label**, discovered from
   `ticket_fields`, never guessed by the model.
4. Never the reason the shared account limit runs out.
5. A non-technical operator installs it without a terminal.

**Non-goals**
- Keeping ticket history, embeddings or a local index. The MCP is
  stateless; a separate project can build history on its incremental
  read and export (owner, 2026-11-20).
- Semantic similarity search (belongs to that project).
- Remote/hosted deployment, OAuth, multi-tenant.
- Admin operations (agents, roles, fields, automations) as active tools.
- Replacing Freshdesk Analytics.

**Anti-goals** (fails even if it works)
- A wall of ~60–250 tools in the operator's context.
- A ticket's text (customer-written) causing a reply, forward or bulk
  change the user did not approve.
- Heavy process or security scaffolding that slows the project (owner:
  "not too much security scaffolding").

## 5. Constraints and known facts

From `customer-square` Phase 0 (2026-11-19/20) and research on 2026-11-20:

- **Auth:** HTTP Basic, API key as user, `X` as password. Domain
  `<sub>.freshdesk.com`; the server refuses any other host so the key is
  never sent elsewhere.
- **User-Agent:** Freshdesk's edge answers **403 HTML** to httpx's default
  UA. The client always sends `freshdesk-mcp/<version>`.
- **Rate limit:** this account reports `X-RateLimit-Total: 5000` per
  **hour**, one account-wide counter shared with every other integration
  (`X-RateLimit-Account-Window-*` headers). Other consumers are real.
  Per-minute or per-endpoint limits are not reported but not ruled out;
  failed calls count too.
- **Pagination:** `page`/`per_page` (max 100) with `Link` header. `GET
  /tickets` hides tickets older than 30 days unless `updated_since` is
  passed. `/search/tickets` returns 30 per page, max 10 pages (300
  results), field filters only — **no full-text search** of subject or
  body.
- **`include=conversations`** on a ticket returns only the first 10;
  full threads need `/tickets/{id}/conversations` paged.
- **Custom fields** (this account; the real list is in the gitignored
  `docs/private/account-facts.md`): names are mixed, some with the `cf_`
  prefix and some without; one is a **nested field** with three levels.
  Several carry personal data.
- **SDKs:** `@modelcontextprotocol/server` 2.4.0 (v2 stable, Node ≥ 20; project
  floor ≥ 22.19, §11);
  `.mcpb` Node bundles are mature, Python `uv` bundles experimental.
- **npm name** `freshdesk-mcp` is taken; use a scoped name (§12).
- **Personal data:** tickets hold customers' data, sent to Claude. The DPO
  approved only the 2-person Phase 0 trial (customer-square R-1). Rollout
  beyond the builders needs the DPO's validation — an organisational
  gate, not a build blocker.

## 6. Approaches

Chosen by the owner on 2026-11-20: **A**.

| | Approach | For | Against |
|---|---|---|---|
| **A** ✔ | TypeScript, clean start, MCP TS SDK v2, stdio; npm + `.mcpb` (Node) | one codebase, both channels; mature `.mcpb` path for operators | `customer-square` (Python) cannot import it as a library; it uses it as an MCP/CLI |
| B | Python, `mcp` 2.x, `uvx` + `.mcpb` (`uv`) | reuse Phase 0 experience; importable from Python | `.mcpb` `uv` type is experimental — on the path that matters most |
| C | Fork MSPbots (Python, Apache-2.0) | good client (retry, confirm, paging) | HTTP-only, multi-tenant, `mcp<2`, httpx UA, no labels: adapting ≈ rewriting |

Also rejected: progressive tool discovery (WYRE) — not reliable across
clients; toolsets by configuration instead (§8.1).

## 7. Architecture

```
src/
  client/          Freshdesk API v2, no MCP dependency (also exported as a library)
    http.ts        auth, UA, host check, retries, errors, pagination iterator
    rate-limit.ts  header-driven budget (§7.2)
    resources/     one module per resource family (§8.3), typed requests/responses
  schema/          ticket_fields cache, label <-> value mapping, nested fields
  tools/           MCP layer
    toolsets/      one module per toolset; each tool = zod input + handler
    format.ts      output shaping, truncation, untrusted-content wrapping
    confirm.ts     confirm-by-argument (§9)
  config.ts        env + optional team config file (§10)
  server.ts        builds the server from enabled toolsets; stdio
  cli.ts           entry: `serve` (default); maybe `export` later
manifest.json      .mcpb
```

Layers only call downward: tools → schema/client → http. The client
never imports MCP code, so it can be published or reused alone.

### 7.1 HTTP client

- One `fetch` (undici) agent, keep-alive; UA set; host validated
  against `^[a-z0-9-]+\.freshdesk\.com$` (configurable override for
  custom domains, off by default).
- Errors normalised to one shape: `{code, http_status, message,
  retryable, retry_after_s?}` with codes `auth`, `forbidden`,
  `not_found`, `validation` (Freshdesk's `errors[]` passed through),
  `rate_limited`, `server`, `network`.
- Retries: reads on 429/5xx/network with backoff (max 3); **writes only
  on 429** (request not processed), never on 5xx/timeouts, so a write is
  never applied twice.
- Deadline (owner, 2026-11-23): one call with its retries, limiter waits
  and backoff ends within 30 s. A limiter wait that would reach the
  deadline is refused as `rate_limited`; an attempt in flight at it is
  aborted as `network`. A write is not started with less than 10 s left:
  it is refused as `rate_limited`, `retryable: true`, not sent.
- Pagination: async iterator following `Link`; callers set a hard cap of
  pages/items.

### 7.2 Rate limiter

- Every request takes a token. State comes from the response headers
  (`X-RateLimit-Remaining`, `-Total`, window end), so each local instance
  sees the **account's** consumption, including colleagues' and
  integrations'.
- **Reserve:** when `Remaining` falls below a reserve (default 20 % of
  `Total`), the server refuses *expensive* operations (export, count,
  bulk, similar-search) with a `rate_limited` error explaining why, and
  allows only single-ticket reads/writes. Below 5 %, everything waits
  for the window or fails fast.
- **Pacing:** expensive operations are paced (default ≤ 2 req/s) so one
  export never drains the window in minutes.
- 429: honour `Retry-After`. No headers seen yet: conservative defaults.
- Operations that need many calls estimate their cost first and report
  it (e.g. export of 2,000 tickets with conversations ≈ 2,020 calls) and
  refuse beyond a per-call budget unless `confirm:true`. The budget is a
  team-file key, default 250 calls (owner, 2026-11-23).

### 7.3 Schema service (custom fields)

- Loads `GET /ticket_fields` once per process (TTL, default 1 h), plus
  agents and groups for id → name.
- Output: every ticket field shown as `{label: value_label}`; status,
  priority, source as names, `agent`/`group`/`requester` as names.
- Input: tools accept labels (`"Prodotto": "<product> > ..."`)
  or API names; the service validates against choices (nested levels
  included) and returns a validation error listing the valid choices.
  A field whose type or choices the service cannot check is refused with
  the per-field code `unsupported_field` (owner, 2026-11-23).
- A cold load (fields, agents, groups) has a total deadline of 30 s; on
  expiry the error is retryable and is not cached (owner, 2026-11-23).
- Optional team config adds per-field **meaning** text for the model and
  can hide fields (e.g. personal-data fields) from a ticket's detail
  output. `hidden` goes no further for now and is not an access control:
  it is not applied to the schema tool, to queries or to input, and it is
  not guaranteed in rows, counts or exports (owner, 2026-11-23).

### 7.4 Untrusted content

Customer-written text (subject, description, conversation bodies,
attachment names, requester and company names, a conversation's from, to
and cc, and custom-field values unless the field's type is a known closed
one: number, boolean, date, a validated choice) is returned inside
explicit delimiters
(`<ticket_content>…</ticket_content>`) and every tool description that
returns it says it is data, not instructions. HTML bodies are converted
to text (`body_text` where Freshdesk provides it). Long threads are
truncated with an explicit marker and a way to fetch the rest.

Owner, 2026-11-23: knowledge-base articles and canned responses are
wrapped the same way. Agent and group names, field labels, choice names
and titles (article, folder, canned response) are not wrapped: they are
stripped of HTML and length-capped. Exported files hold customer text
unwrapped.

## 8. Tool surface

### 8.1 Toolsets

Tools are grouped in toolsets enabled by the team config file's
`toolsets` key, and only there: there is no `FRESHDESK_TOOLSETS` env
variable (owner, 2026-11-23). Default for a fresh install:
**`core`** only (read). Every tool carries MCP annotations
(`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`)
so clients can ask before running writes. Names are English
`snake_case`; descriptions are English, concise, and say what the tool
costs in API calls when it is more than one.

### 8.2 Active toolsets (built first)

**`core`** — read (C1, C2, C3, C7, C9, C10)

| Tool | Purpose |
|---|---|
| `list_tickets` | filtered list: status, priority, group, agent, type, tag, `uncategorized`, `updated_since`, `created_between`; paged with cursor; compact rows with labels |
| `search_tickets` | Freshdesk query language wrapper (`"status:2 AND cf_<field>:'X'"`); documents the 300-result cap and lack of full text |
| `get_ticket` | ticket + **full** conversation thread (paged) + labels + requester (name, email, company) + optionally the requester's recent tickets |
| `triage_queue` | open/pending tickets with urgency signals: priority, `fr_due_by`/`due_by`, overdue flags, age, last customer message time, unanswered customer replies, escalation flags (C2) |
| `find_similar_tickets` | best effort, no full text: same category fields, same requester/company, resolved/closed in the last N days, subject-keyword overlap computed locally on the candidates; returns ids + subject + resolution excerpt (C3) |
| `get_ticket_schema` | ticket fields with labels, types, choices (nested tree), and team meanings (C1, C8) |
| `list_agents`, `list_groups` | lookup for assignment and notification |
| `search_solutions`, `get_solution_article`, `list_solution_tree` | knowledge base read (C3, C9) |
| `list_canned_responses`, `get_canned_response` | canned read (C3, C10) |
| `count_tickets` | counts grouped by up to 2 fields over a period and filter, aggregated in code (C7); a group-by field must be of a closed type (number, boolean, date, validated choice, status, priority, source, agent, group), any other is refused (orchestrator's choice, 2026-11-23, owner to confirm) |
| `export_tickets` | writes JSONL or CSV to the export dir: filter, period, optional conversations, labels resolved; returns path, row count, calls used (C7, and the feed for a history project) |

**`write`** — non-customer-facing writes (C1, C4, C5, C6, C8)

| Tool | Purpose |
|---|---|
| `update_ticket` | status, priority, type, group, agent, tags (add/remove), custom fields by label |
| `categorize_tickets` | bulk set of category fields on a list of `{ticket_id, fields}`. Without `confirm` returns a **preview** table (current → new) and a `preview_id`; with `confirm:true` + `preview_id` applies, one `PUT` per ticket, per-ticket result. Cap (default 50) refused, not truncated |
| `add_note` | private note by default; `notify_emails` (agents) for internal feedback (C4); `private:false` only if explicitly passed |
| `hand_off_draft` | C6 in one call: private note with a clear `DRAFT REPLY` header + assign to agent/group + notify them |

**`send`** — customer- or outside-facing, off by default

| Tool | Purpose |
|---|---|
| `reply_to_ticket` | public reply to the requester; `confirm:true` required (§9) |
| `forward_ticket` | forward to people outside Freshdesk (internal teams); `confirm:true` required; recipients must match the allow-list (e.g. `@example.com`), others refused |

### 8.3 Prepared, not active (catalogue)

Only the catalogue is written now (owner, 2026-11-23):
`docs/tool-catalogue.md`, one line per planned tool. The client's
interfaces and implementations for these resources, with their types and
tests, land with the toolset that first uses them (M5+).

| Toolset | Resources |
|---|---|
| `tickets_admin` | create, delete/restore, merge, bulk_update/bulk_delete jobs, archived tickets, watchers, time entries, satisfaction ratings, ticket summary |
| `contacts` | contacts (CRUD, merge, make agent, export jobs), contact fields |
| `companies` | companies (CRUD, export), company fields |
| `kb_write` | solution categories, folders, articles (create/update/translate) — would turn C9's suggestions into drafts |
| `canned_write` | canned response folders and responses — would turn C10's suggestions into drafts |
| `admin_read` | agents, groups, roles, skills, SLA policies, business hours, products, email configs, mailboxes, automations (read) |
| `admin_write` | the above, write — likely never enabled by default |
| `discussions`, `surveys`, `threads` | as Freshdesk exposes them |

### 8.4 Output shape

- Compact by default: lists return one row per ticket (id, subject
  ≤ 120 chars, status, priority, category labels, updated, agent, group);
  `detail` flag for more.
- Every list returns `{items, next_cursor?, has_more, truncated?,
  api_calls_used}`.
- Dates ISO 8601 with time zone; durations in human form for urgency.
- Personal-data fields hidden in a ticket's detail output when the team
  config says so (§7.3: no further, not an access control).

## 9. Safety model (light)

| Rule | Where |
|---|---|
| Writes need the `write` toolset enabled; customer/outside sends need `send` | config |
| `reply_to_ticket`, `forward_ticket`: **confirm-by-argument** — without `confirm:true` the tool does nothing and returns "Not sent. Show the user the exact text and recipients; call again with confirm:true only after they approve." | `confirm.ts` |
| Bulk changes: preview → `preview_id` → confirm; changed ticket set or fields invalidates the preview | `categorize_tickets` |
| Forward recipients on an allow-list; reply goes only to the ticket's requester (cc only from the allow-list) | config |
| Notes private unless `private:false` is passed explicitly | `add_note` |
| No secret or ticket content in logs; stderr logs method, path template, status, duration only | `http.ts` |

The **real** human gate is the client's tool-approval prompt (Claude
Code/Desktop ask before tools not pre-approved; `destructiveHint` makes
that visible). Confirm-by-argument is a second layer against a model
acting on injected ticket text. Docs tell users never to "always allow"
the `send` tools.

Deliberately not adopted from customer-square: guard/pin checks and a
single-module write gate as a governed file (safety core: `none`). Kept
from the faigo kit (owner, 2026-11-20): new dependencies go through
`/rfc`, the gitleaks hooks run on every commit, and before the first
caller of a `write` or `send` tool an RFC decides whether the project
needs a safety core (`AGENTS.md`, rule 1).

## 10. Configuration

Two levels:

| Level | What | How |
|---|---|---|
| Personal | `FRESHDESK_DOMAIN`, `FRESHDESK_API_KEY`, the export directory (`FRESHDESK_EXPORT_DIR`) | env vars (Claude Code) or `.mcpb` `user_config` (key marked `sensitive`, stored in the OS keychain by Claude Desktop) |
| Team | enabled toolsets, field meanings and hidden fields, "uncategorised" definition, forward allow-list, caps, call budget, reserve % | JSON file, path via `FRESHDESK_MCP_CONFIG` / `user_config`; validated with zod at start, clear error on bad config |

- **Uncategorised** default: a ticket where the configured category field
  (default: the last level of the first nested field) is empty. Overridable as a list of fields.
- The export directory is personal, not a team setting (owner,
  2026-11-23): a shared file does not choose a local path. With it unset,
  `export_tickets` is refused with a message saying how to set it. File
  export is not a rule-1 capability (no RFC); its task runs
  `/security-review`.
- Example team config ships in the repo with synthetic values; the
  Zanichelli one lives in an internal place (§12).
- An internal `.mcpb` build may bake the Zanichelli team config in, so
  operators type only domain and key.

## 11. Quality and distribution

- TypeScript strict, ESM, Node ≥ 22.19 (RFC 2026-11-23); zod for inputs and config;
  `vitest`; HTTP faked with undici `MockAgent` (no test calls real
  Freshdesk); eslint + prettier; GitHub Actions on every push.
- Tests: client (auth, UA, host check, pagination, 429/`Retry-After`,
  write-no-retry-on-5xx, error mapping), rate limiter (reserve, pacing),
  schema (labels both ways, nested choices, invalid choice), each tool
  (happy path + one refusal), confirm/preview flows, a test that no log
  line contains body text.
- Fixtures synthetic only; no test in CI calls real Freshdesk.
- **Real-account checks** (owner, 2026-11-20: option b, no sandbox):
  - reads: a manual `smoke` script, read-only, run by hand;
  - writes and sends: only on **test tickets** created for the purpose on
    the production account: tagged `mcp-test`, requester an internal
    mailbox, assigned to a test group. Automations, SLA notifications and
    surveys are set to skip the tag before M2 starts (admin task, owner).
    The smoke script refuses to write to a ticket without the tag;
    forwards go only to the builders' own addresses.
- Release: **public npm** (owner, 2026-11-20) as
  `@zanichelli/freshdesk-mcp`, repository public (owner, 2026-11-23),
  once it is shown that the organisation owns the `@zanichelli` scope on
  npm and the publisher is a member (evidence before the README names the
  package); how a publish is authorised is decided by an RFC;
  published from CI on a version tag, with provenance and every check run
  again; the first publish is 0.1.0, after M1's smoke and on the owner's
  explicit go; versions stay 0.x until M4, then 1.0.0. GitHub releases
  with the `.mcpb` built by `@anthropic-ai/mcpb pack` in CI; semver;
  CHANGELOG.
- Docs: README (English, for technical users and a possible public
  release); operator guide in Italian (install `.mcpb`, get the API key,
  what each tool does, never "always allow" sends).

## 12. Decisions taken and left open

**Owner, 2026-11-20:** approach A; MIT; GitHub repo; new start replacing
the suspended customer-square, keeping its learnings, not its use cases;
few active tools, a catalogue for all (interfaces with the toolset that
first uses them: owner, 2026-11-23); stateless MCP; technical users
first, operators daily within 6 months; forward to both agents and
non-Freshdesk colleagues; light safety; real-account write tests on
tagged test tickets in production (no sandbox); public npm; bulk
re-categorisation of old tickets left as a proposal.

**Builder's calls (marked, reversible):** toolset split and names (§8);
`core` default; reserve 20 %/5 % and pacing 2 req/s; bulk cap 50;
per-ticket `PUT` instead of the async `bulk_update` job (clear
per-ticket results); undici `MockAgent`; draft note header text; client
interfaces and implementations per toolset, as each is first used (§4,
§8.3); since the
package is public on npm, the source is public in practice, so the
GitHub repo can be public from M1, while the **Zanichelli team config
stays out of it** (domain, allow-list, field meanings) in an internal
location chosen at M4.

**Owner, 2026-11-23:** npm scope `@zanichelli`, repository public;
toolsets from the team file only; export directory in personal env; call
budget 250; hidden fields not handled beyond ticket detail output for
now; wrapping per §7.4; deadlines per §7.1 and §7.3; only the catalogue
for the §8.3 resources; the builder's choices parked up to T-013 accepted
as built.

**Open (owner):** DPO validation before rollout beyond the builders.

## 13. Milestones (phases with acceptance)

Each milestone is a phase; its "Done when" is the acceptance `/decompose`
splits into tasks.

| M | Content | Done when |
|---|---|---|
| M0 | repo, CI, client core (§7.1), rate limiter, schema service, config | tests green in CI |
| M1 | `core` toolset → technical users via `npx` | C1 listing, C2, C3 (read), C7, C9/C10 reads work against the real account by smoke test |
| M2 | `write` toolset | C1 apply, C4 internal, C5 update, C6, C8 (new tickets) work on `mcp-test` tickets; automations confirmed to skip the tag first |
| M3 | `send` toolset | C5 reply, C4 forward, with confirm and allow-list, on `mcp-test` tickets to internal addresses only |
| M4 | `.mcpb`, Italian operator guide, internal team config | an operator installs on a clean machine without a terminal |
| M5+ | catalogue toolsets on demand | per toolset |

## 14. Session discipline

The rules in `AGENTS.md` apply. Project-specific additions:

1. No session calls the real Freshdesk except through the manual `smoke`
   script (§11), run by hand; writes and sends only on `mcp-test` tickets.
2. Real account values (domain, API key, team config with field meanings
   and allow-list) never enter a tracked file: tests use synthetic
   fixtures, the Zanichelli team config lives outside the repo (§10, §12).
3. A task that would add the first caller of a `write` or `send` tool
   stops and raises the safety-core RFC first (§9).

### 14.1 Sizing a task to one session

- One task = one tool, one client resource family (types, implementation
  and tests), or one cross-cutting module (`http`, rate limiter, schema
  service, config, confirm/preview), with its tests.
- A mechanism and the first tool that uses it are two tasks: the
  mechanism first.
- If a task needs more than one new module, or changes a tool's public
  input and its callers, split it at planning.
