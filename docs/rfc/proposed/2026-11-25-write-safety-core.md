# A small safety core for writes, and a per-tool allow set of writable fields

- **Status:** Proposed
- **Date:** 2026-11-25
- **Author:** freshdesk-mcp team
- [ ] Implemented

## Context

AGENTS.md hard rule 1 says the safety core is `none`, and that before the
first caller of a genuinely dangerous capability an RFC decides whether
the project needs one. SPEC §9 says the same of the first `write` or
`send` tool. No tool writes to Freshdesk yet: M1 (`core`) is read-only,
and `export_tickets`' local file write was ruled not a rule-1 capability
(OD-5). M2 brings the `write` toolset (SPEC §8.2): `update_ticket`,
`categorize_tickets`, `add_note`, `hand_off_draft`. This RFC answers the
two owner decisions PLAN.md leaves to it:

- **OD-3:** does the first write tool need a safety core?
- **OD-2:** a per-tool allow set of writable fields (SPEC §8.2)?

What makes a write dangerous here:

- **The account is the team's production account.** A write changes a
  real ticket, its `updated_at`, its SLA and its owner. It may fire any of
  the dozens of automation rules, which the owner cannot edit (owner,
  2026-11-25), and an automation can email a customer.
- **The model chooses tool inputs, and ticket text is untrusted** (SPEC
  §7.4). SPEC §4's anti-goal: "a ticket's text causing a reply, forward
  or bulk change the user did not approve".
- **`ticketInput` sets any field the schema has** (`src/schema/input.ts:251`;
  T-011 security review, `docs/improvements.md` `73099a8`): requester,
  company, source, description, subject. SPEC §9 sends a reply "only to
  the ticket's requester". A write that changes the requester would move
  where a later `reply_to_ticket` goes: a `write` tool would steer a
  `send` tool.
- **`notify_emails` on `add_note` and `hand_off_draft` sends mail.** SPEC
  §8.2 means agents. Nothing in the code limits it yet.

What already exists and costs nothing more:

- The toolset gate: `write` and `send` are enabled only by the team file
  (OD-6), and today enabling either fails at start (`src/server.ts`).
- The client's tool-approval prompt, with `destructiveHint`, is the real
  human gate (SPEC §9).
- A tool reaches Freshdesk only through `context.http`: the context is
  frozen, and the lint allow-list `eslint.tool-imports.json` keeps the
  client, config and `process` out of `src/tools/**` (T-050, T-051). The
  threat model is a tool's mistake or a cast, not hostile code in the
  process.
- The smoke client (`scripts/smoke/smoke.ts:84`, T-016) is an
  `HttpClient` that refuses POST, PUT and DELETE before anything is sent:
  a read-only-by-construction client is a solved problem here.
- A write is never retried except on 429, and never started with under
  10 s left (T-014).

SPEC §4 also names an anti-goal on the other side: "heavy process or
security scaffolding that slows the project". SPEC §9 deliberately did not
adopt customer-square's guard/pin checks and governed write-gate file.

### The owner's evidence (2026-11-25)

From a manual test on a test ticket tagged `mcp-test`, group `MCP Test`,
on the real account (T-040 task file, "Owner's evidence (2026-11-25)"):

1. Freshdesk's own spam filter marked the ticket as spam at creation, with
   no automation rule involved; the owner restored it by hand.
2. Creation, a private note, adding the tag and status changes
   Open → Pending → Open: the activity log shows no automation rule fired.
3. The Default SLA Policy applied; Pending pauses its timer.
4. Time triggers: not yet verified; the owner checks the activity log on
   2026-11-26.
5. The owner cannot edit the automation rules, so M2's "automations
   confirmed to skip the tag first" (SPEC §13) cannot mean rules edited
   to skip `mcp-test`.

## Decision

### OD-3: yes, a small safety core, the write path

The project gets a safety core: **the one path every request other than
GET takes to Freshdesk**. AGENTS.md rule 1 then reads "the safety core:
the write path" and its rules apply to it: no second path, no bypass flag,
no environment override, and a change to the core goes through `/rfc`.

The core is small. It holds these invariants and nothing else:

1. **Tools get a GET-only view.** There stays one `HttpClient`, on one
   limiter, so the shared budget is not doubled (SPEC §4 goal 4). The core
   holds it; `context.http` becomes a view on it that refuses any method
   but GET with nothing sent, in the type and at runtime, as the smoke
   client does (`scripts/smoke/smoke.ts:80-84`). The schema service is
   built on that GET-only view too, so no module outside the core holds a
   client that can write.
2. **One entry point per write tool, and a ticket body is built by
   `ticketInput` with that entry's allow set** (OD-2 below). A field
   outside it is refused, nothing sent. The allow sets live in the core,
   one table, keyed by entry point, not by a name the tool passes: a tool
   cannot claim another tool's set. Registration hands each write tool
   its own entry point only.
3. **The writing side exists only when the team file enables it.** The
   core's write entry points are built only when `write` is in
   `team.toolsets` (later `send`, for its own), so a disabled toolset has
   nothing to call, by construction rather than by a check.
4. **Notify recipients are agents, named by agent id.** `notify_emails`
   is not a tool input: a write tool takes agent ids (or names, resolved
   by the schema service's id → name map), and the core fetches each
   agent's work email at write time through the agents resource (OD-8),
   one GET per recipient, counted in `api_calls_used`. An id with no agent
   is refused, nothing sent. The schema service keeps dropping agent
   emails (`src/schema/index.ts:29-30`); the core keeps none. Mail to
   people outside Freshdesk is `forward_ticket`'s, in `send`, with its
   allow-list (SPEC §8.2, §9).
5. **Notes are private.** `add_note`'s note is private unless the caller
   passes `private: false`; the core sets `private: true` itself when the
   flag is absent (SPEC §9's `add_note` row, moved into the core).
   `hand_off_draft`'s note is always private: its entry point has no
   `private` input, so a "DRAFT REPLY" can never reach the requester.

Each refusal is a `validation` error, `http_status: null`, with a
per-field entry where a field is the cause, like `ticketInput`'s today.

Not in the core, kept where SPEC §9 puts them: the preview → `preview_id`
→ confirm of `categorize_tickets` and its cap of 50, which are one tool's
contract; the 10 s write start and the 429-only retry, which are already
in `http.ts` (T-014). `send`'s confirm-by-argument and recipient
allow-list (M3) will be a change to the core, so M3 brings its own RFC
amendment; this RFC does not design them.

Where the core lives and its function signatures are for `/decompose M2`.
Two `proposed` rows build it before any write resource (PLAN, M2):

- **The write path:** the core holding the one client, the GET-only
  `context.http` view, one entry point per write tool built only when
  `write` is enabled, invariants 4 and 5, and the lint entries that keep
  the core's client out of `src/tools/**`.
- **The allow sets:** the table, and `ticketInput` with the allow set
  required (no default, like `readCursor`'s `maxPosition`, T-053).

### OD-2: yes, a per-tool allow set of writable fields

Each write tool may set only the ticket fields of its allow set. A field
outside it is refused per field with a new code, `field_not_writable`,
whose message names the fields the tool can set; nothing is sent. The
sets follow SPEC §8.2:

| Tool | Default fields it may set | Custom fields |
|---|---|---|
| `update_ticket` | status, priority, type, group, agent; tags (add/remove) | all |
| `categorize_tickets` | type | all |
| `hand_off_draft` | group, agent | none |
| `add_note` | none (note body, `private`, agents to notify only) | none |

No set holds requester, email, phone, name, company, source, subject,
description, product, due dates or any other default field. A default
field Freshdesk adds later is in no set until a reviewed change puts it
there: the sets fail closed. `categorize_tickets` cannot change status,
priority, group or agent directly, so a bulk change recategorises but does
not itself reroute or close tickets; those go one ticket at a time through
`update_ticket`. It can still set any custom field, and an automation
whose condition is a custom field can then reroute: SPEC §8.2's
"category fields" is read here as every custom field (question 4).

Changing a set changes SPEC §8.2's contract and the core, so it goes
through `/rfc`.

Hidden fields on input stay out of scope: not handled for now (owner,
2026-11-23, OD-1). This RFC does not decide them.

### M2's "automations confirmed to skip the tag first"

Proposed wording for SPEC §13, M2, replacing that clause (the owner
accepts or rejects it with this RFC; SPEC §13 is changed only then):

> no automation rule acted on `mcp-test` tickets, confirmed by the
> activity log after each kind of write M2 performs, and no time trigger
> acted on them while they waited

What it proves and what it does not: it shows that M2's writes on test
tickets fire nothing, so testing M2 on the real account is safe. It does
not show that the same write on a production ticket fires nothing: a rule
whose conditions match a production ticket (its group, product or
requester) can fire, exactly as when an agent makes the same change by
hand. The write tools' descriptions say so in one sentence ("Freshdesk
automations may act on the change, as for an agent's edit").

**How this depends on the time-trigger check (owner, 2026-11-26).** OD-2
and OD-3 do not depend on it: a time trigger acts on the clock, not on a
write, and the core governs writes. Only the last clause of the wording
does. If the check shows no time trigger acted on the test ticket, the
wording stands as written. If one did, the clause fails as written and
the owner picks one of:

- (a) a test-ticket procedure that keeps the trigger's conditions unmet
  (for example, test tickets Pending when idle and closed after each run,
  if the trigger needs Open), with the clause kept; or
- (b) the clause narrowed to "no time trigger sent anything outside
  Freshdesk", the triggers seen named in `docs/private/account-facts.md`.

The RFC can be accepted before 2026-11-26; the wording goes into SPEC §13
only after the check, in the form the check allows.

### Spam marking of created tickets (C8)

Freshdesk's spam filter can mark a newly created ticket as spam, with no
rule involved (evidence 1). No M2 tool creates tickets: `create` is in the
`tickets_admin` catalogue (SPEC §8.3, M5+). So for M2 this binds the test
procedure, not the code: before a C1 or C8 run on a new `mcp-test`
ticket, check that it is not spam and restore it if it is, since a spam
ticket may be left out of the default listing (Freshdesk's documented
behaviour, not yet seen on this account) and C1's "uncategorised" list
would then miss it. When a create tool is designed, its result reports the
ticket's `spam` flag; that is that tool's RFC, not this one.

### Questions for the owner

1. Accept OD-3 (the write path as safety core) and OD-2 (the table above).
2. `add_note` with `private: false` (SPEC §8.2, §9) is in `write`, the
   non-customer toolset, yet a public note can reach the requester
   (Freshdesk's requester notification for an agent's comment, if enabled
   on the account). Keep it in `write`, move it to `send`, or drop it?
3. M2's "C8 (new tickets)": this RFC reads it as categorising newly
   arrived tickets, with no create tool in M2. Is that the intent?
4. The default `product` field is in no set; C1's product is read here as
   the custom nested field. And `categorize_tickets` may set every custom
   field, not a named list of category fields. Are both right?
5. After the 2026-11-26 check: the wording as written, or (a) or (b).

## Consequences

- **Easier:** one place to read to know what any write can do; a review
  of a write tool checks its use of the core, not its payload by hand. The
  requester cannot be changed by any `write` tool, so SPEC §9's "reply
  goes only to the requester" holds for M3 without a further check, while
  no enabled toolset writes contacts or merges tickets (`contacts`,
  `tickets_admin`, M5+).
- **Harder:** adding a field to a tool, a new write tool, or M3's send
  rules is a change to the core and needs an RFC amendment. That is
  deliberate friction on a rare change. Adding a read tool is unaffected.
- **Cost:** two build rows before M2's first write resource. The context
  no longer builds and holds the client: the core does, and the context
  holds a GET-only view on it, so `src/tools/context.ts`'s header and
  `docs/architecture/overview.md` change; `core` tools that pass `http`
  on are re-typed, with no behaviour change (no `src/` code sends
  anything but GET). A notify costs one GET per recipient.
- **Docs:** AGENTS.md rule 1 and SPEC §9 change from `none` to "the write
  path" when the owner accepts this RFC (T-040 task file, "Files expected
  to change"); SPEC §9's "deliberately not adopted" line keeps guard/pin
  checks out and is reworded to say what is adopted instead.
- **Given up:** a team cannot widen a tool's fields in its team file.
  `categorize_tickets` cannot close or reroute in bulk.
- **Not covered:** hostile code in the process (as T-050); a production
  automation fired by a correct write (as for an agent), including one
  that reroutes on a custom field a bulk categorisation set; hidden fields
  on input (OD-1).

## Alternatives considered

- **OD-3, keep `none`, with the same checks per tool.** Each write tool
  would build its own body and check its own fields. Rejected: four tools
  in M2 and two in M3 repeat the checks, and nothing in the code stops the
  fifth from skipping them.
- **OD-3, the same code (GET-only view, entry points, allow sets) without
  the rule-1 label.** The closest rival: every mechanism of this RFC,
  safety core still `none`. Rejected: the code makes the path the only
  one today; the label is what keeps it so, since rule 1 forbids a later
  bypass flag, an environment override or a second path, and puts any
  change through `/rfc`. Those are the changes a future "just let this
  tool write X" would make. The process cost is an RFC amendment on a
  rare change, against writes to the team's production account.
- **OD-3, a heavy core (customer-square's guard/pin checks, a governed
  write-gate file, signed previews).** Rejected by SPEC §4's anti-goal and
  §9's earlier choice; the client's approval prompt is the human gate, and
  the core only keeps a tool's mistake or an injected input from reaching
  a field or an address it should not.
- **OD-3, the core also owning previews, caps and confirm.** Rejected for
  M2: they are one tool's contract each (SPEC §9); moving them in makes
  every tuning of a cap an RFC.
- **OD-2, no allow set (`ticketInput` sets any field).** Rejected: a
  `write` tool could change the requester and so where a reply goes; out
  of SPEC §8.2's lists.
- **OD-2, a deny list (requester, email, ...).** Rejected: it fails open
  on any field Freshdesk adds later.
- **OD-2, allow sets in the team file.** Rejected: configurability no one
  asked for, and a team file could widen a set past SPEC §8.2.
- **OD-2, allow sets declared by each tool.** Rejected: a tool could
  declare "all"; one table in the core is one reviewed place.
- **Notify by a cached list of agent emails.** Rejected: it undoes the
  schema service's choice to drop agents' personal data; one GET per
  recipient at write time costs little on a rare call.
- **M2 wording, keep "automations confirmed to skip the tag first".**
  Rejected: it needs rules edited, which the owner cannot do.

## Review

`rfc-reviewer`, 2026-11-25. Full round: eight findings, all resolved in
this draft (notify by agent id fetched at write time; one client held by
the core; the "same code without the label" alternative; `hand_off_draft`
always private; one entry point per write tool, built only when `write`
is enabled; the M3 claim qualified; custom-field rerouting under "Not
covered"; any method but GET). Scoped round: the `add_note` row still
named `notify_emails`, and the schema service's client was unnamed; both
fixed (the schema service is built on the GET-only view). Two items
parked in `docs/improvements.md` for `/decompose M2`: an ambiguous or
unlisted agent name, and a deactivated agent's id. No third round.
