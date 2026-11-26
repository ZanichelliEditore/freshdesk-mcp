# `send` on the write path: confirm with a `send_id`, recipient allow-list, closed payload keys

- **Status:** Active (owner, 2026-11-26)
- **Date:** 2026-11-26
- **Author:** freshdesk-mcp team
- [ ] Implemented

Extends RFC `2026-11-25-write-safety-core` (Active, owner, 2026-11-25).
That RFC stays in force, except in three points this one changes, each
named where it is decided and listed in the old RFC's dated "Extended by"
line at acceptance:

1. its consequence "SPEC §9's 'reply goes only to the requester' holds
   for M3 without a further check" is corrected (threat 3, OD-21);
2. its owner decision 2 (2026-11-25) said the public note is designed
   "with M3's confirm and allow-list"; the public note has no recipient
   input, so it gets the confirm and no allow-list (OD-26);
3. it kept confirm and caps out of the core for M2 ("moving them in makes
   every tuning of a cap an RFC"); for `send`, the confirm, the `send_id`
   and the recipient cap of 10 move into the core (OD-19, OD-22, OD-32),
   so changing that cap now needs an RFC (Consequences).

Otherwise this RFC adds the `send` entry points to the core that RFC
defines, as it said M3 would ("`send`'s confirm-by-argument and recipient
allow-list (M3) will be a change to the core, so M3 brings its own RFC
amendment").

## Context

M3 brings the `send` toolset (SPEC §8.2, §13): `reply_to_ticket` (C5),
`forward_ticket` (C4) and, by the owner's decision of 2026-11-26 (OD-26),
a public note. Each puts text in front of a person: the ticket's
requester, who is usually a customer, or people outside Freshdesk. It is
the project's most dangerous capability:

- **A sent mail cannot be taken back.** A field write can be undone by
  another write; a reply in a customer's inbox cannot.
- **The model writes the body, and ticket text is untrusted** (SPEC
  §7.4). SPEC §4's anti-goal: "a ticket's text causing a reply, forward or
  bulk change the user did not approve".
- **The requester is untrusted too.** Whoever wrote the ticket receives
  the reply. A reply that quotes another customer's ticket, an internal
  note or an agent's address hands it to whoever wrote the ticket, who may
  be the person who planted the instruction.
- **The account is the team's production account**, with automation rules
  the owner cannot edit (RFC `2026-11-25-write-safety-core`, evidence 5).

What exists already (`src/core/write-path.ts`, T-064, T-068): one
`HttpClient` held by the core; tools get a GET-only view; one frozen entry
point per write tool, built only when `write` is in `team.toolsets`;
payloads built by the core from closed key sets; an entry never rejects
and refuses as `validation`, `http_status: null`, nothing sent; a write is
never retried except on 429 and never started with under 10 s left
(T-014). `src/tools/preview.ts` mints a stateless HMAC `preview_id`
(per-process key, TTL 15 minutes, `Date.now()`). `src/config.ts` already
parses `forward_allow_list` (`@domain` or a full address, default empty);
`src/server.ts` refuses `send` with a `ConfigError` today.

The decisions this RFC takes are PLAN's OD-17 to OD-34 (M3 section). The
owner answered three on 2026-11-26 (via the orchestrator): OD-20, OD-21,
OD-26. For the others the planner's proposal was the starting point; this
RFC answers each, and the owner accepted every answer as written on
2026-11-26 ("The owner's decisions (2026-11-26)").

### API assumptions, all unchecked

None of these has been checked against Freshdesk; they come from the
planner's and reviewers' knowledge of the v2 API, not from this repo or a
probe. T-087 records each as yes or no (values in `docs/private/`). Where
the design leans on one, the section says so.

- **A1.** A reply is `POST /api/v2/tickets/{id}/reply`, taking `body`,
  `cc_emails`, `bcc_emails`, `from_email`, `user_id`, `attachments`.
- **A2.** A forward is `POST /api/v2/tickets/{id}/forward`, taking `body`,
  `to_emails`, `cc_emails`, `bcc_emails`, `include_original_attachments`.
- **A3.** A public note is `POST /api/v2/tickets/{id}/notes` with
  `private: false`.
- **A4.** A reply may also reach the ticket's own CC addresses, against
  SPEC §9's "only to the requester".
- **A5.** A forward quotes the ticket's description and maybe its
  conversation (whether private notes are included is unknown); a reply
  may change the ticket's status, by account setting.
- **A6.** One `GET /api/v2/tickets/{id}?include=requester` gives the tags,
  the `spam` flag, the requester's email and the ticket's CC fields
  `cc_emails`, `fwd_emails`, `reply_cc_emails` and `ticket_cc_emails`
  (field names unverified). Only the smoke script (T-086) relies on it;
  no send entry reads it.

If A1, A2 or A3 is wrong, the resource rows (T-080, T-088) fail their
first real run in T-087, before any send on a production ticket. A4 is
checked by **one** T-087 run (owner, 2026-11-26, OD-21): a reply on an
`mcp-test` ticket whose only ticket-level CC is an allow-listed internal
mailbox, run with T-086's one opt-in flag; T-087 records whether
Freshdesk copied the CC. If A4 is wrong in the safe direction (a reply
never copies ticket CCs), OD-21's consequence is smaller than stated. If A5's private-note question
answers yes, OD-29's consequence is larger; T-087 records it.

### Threat model

What the design must stop, and what it cannot.

1. **Prompt injection from ticket text steering a send.** Ticket text, a
   KB article or a canned response tells the model to forward the ticket
   to an outside address, to add a CC, to reply with other customers'
   data, or to post a public note. The layers, in order:
   - the client's tool-approval prompt, with `destructiveHint`: the real
     human gate (SPEC §9), showing the confirm call's exact arguments;
   - the two-step confirm with a `send_id` (OD-19, OD-20, OD-32, OD-33):
     a send happens only on a second call that repeats exactly the tool,
     ticket, body and recipients a first call was shown, and each such
     pair sends at most once;
   - the recipient allow-list (OD-21 to OD-23), in the core: a forward's
     `to` and `cc`, and a reply's `cc`, reach only allow-listed addresses
     whatever the model was told;
   - closed payload keys (OD-24): no `bcc_emails`, `from_email`,
     `user_id` or attachments, so injected text cannot hide a recipient,
     change the sender or attach a file;
   - the body is plain text, escaped by the core (OD-24), so injected
     markup cannot hide text the user did not read.

   **What none of these stops:** the body's content, and the choice of
   ticket. The reply goes to the requester by design, and the code cannot
   tell a correct answer from one that leaks another customer's data the
   model read in the same session. Only the person reading the approval
   prompt can. And `ticket_id` is the model's input like any other:
   ticket text can steer it to another ticket, and so to another
   requester. The approval prompt shows a number, and the "Not sent" text
   says "the ticket's requester", not who that is (the server does not
   read the requester, OD-21, OD-27). So the "Not sent" text and each send
   tool's description put the ticket id first and tell the user to check
   that it is the ticket they mean (T-083, T-084, T-085, T-088). The
   `send_id` proves that what is sent is what a first call was shown; it
   does not prove a person read it. A model that mints and confirms in two
   calls is stopped only by the approval prompt.

2. **The "always allow" risk.** If a user answers the client's prompt with
   "always allow" for a `send` tool, the human gate is gone for that tool:
   a model steered by ticket text can mint a `send_id` and confirm it in
   two calls with no person looking. What is left is the allow-list, the
   closed keys, the escaping and single use: a reply still reaches only
   the requester (and, OD-21, the ticket's CCs), a forward only the list.
   The server cannot see or refuse a client's "always allow" (MCP gives it
   no such signal). The mitigation is words: each send tool's description
   and the README say never to "always allow" the `send` tools (OD-30),
   and M4's Italian operator guide repeats it (SPEC §11). This is stated
   as a residual risk, not solved.

3. **OD-21's CC consequence, stated plainly.** By the owner's answer, a
   reply does not read or check the ticket's existing CC addresses.
   **Freshdesk may copy every one of them on a reply (A4), and a public
   note may notify them too. Those addresses can be anyone: the requester
   or an agent may have added them, and they are not on the allow-list.
   The tool does not show them, and the "Not sent" text cannot name them.**
   SPEC §9's "reply goes only to the ticket's requester" therefore stops
   being true for M3: it becomes "a reply goes to the ticket's requester
   and whoever Freshdesk copies on it; the tool adds only allow-listed
   CCs". The previous RFC's consequence "SPEC §9's 'reply goes only to the
   requester' holds for M3 without a further check" is corrected here: it
   holds for the `to`, not for the ticket's CCs.

4. **A tool's mistake or a cast** (the previous RFC's threat model): an
   extra key, a wrong recipient field, a `confirm` that is truthy but not
   `true`, an id from another tool. The core refuses these, nothing sent.

Out of scope, as before: hostile code in the process; a production
automation fired by a correct send; the requester's address changed in
Freshdesk outside this server (no enabled toolset writes contacts).

## Decision

`send` goes through the write path, extended. The core gains three send
entry points, `reply_to_ticket`, `forward_ticket` and `add_public_note`,
built only when `send` is in `team.toolsets`, on the same one client and
limiter. Each holds the confirm check, the `send_id` mint and check, the
recipient allow-list check and its closed payload in the core. AGENTS.md
rule 1 is unchanged: still one path, now with more entries.

Each OD below says its status: **decided** (the owner answered before
the draft), or **accepted** (this RFC's answer, accepted as written by the
owner on 2026-11-26). The rejected alternatives follow each.

### OD-17: the RFC's form — accepted (owner, 2026-11-26)

A new RFC that extends `2026-11-25-write-safety-core`; the old one gets
one dated line, "Extended by `<this RFC>` (owner, <date>)", at acceptance.

Rejected: (a) amend the active RFC in place. It is implemented and
accepted; mixing M3's design into it would make it hard to read what was
in force for M2 and would put the whole old text back under review.
Precedent: T-066's RFC extended T-063's choice in a separate file.

### OD-18: one core or two — accepted (owner, 2026-11-26)

(a) Extend the write path: the send entries live in `src/core/`, beside
the write entries, on the one client.

Rejected: (b) a separate send core. AGENTS.md rule 1 forbids a second
path; a second client would double the budget (SPEC §4 goal 4) and need
T-077's lint fences twice. (c) The checks in the tools. The previous RFC
rejected this for OD-3: nothing stops the next tool from skipping them.

### OD-19: where confirm lives — accepted (owner, 2026-11-26)

(c) The core's send entry refuses anything but a literal `confirm ===
true` together with a valid `send_id` (OD-20). `src/tools/confirm.ts`
only builds SPEC §9's "Not sent" text from what the entry returns; it
decides nothing and imports nothing from `src/core/`. SPEC §9's "Where"
for the confirm row becomes "the write path (confirm, `send_id`);
`confirm.ts` (the "Not sent" text)".

Rejected: (a) the tool checks `confirm`. A tool's bug, or a fourth send
tool that forgets, would send. (b) `confirm.ts` checks it. It is in
`src/tools/`, so the check would be outside the core and skippable by the
same bug.

### OD-20: a plain flag or bound to the text shown — decided (owner, 2026-11-26)

**(b), an HMAC `send_id`.** An entry called without `confirm` sends
nothing and returns the "Not sent" result with a `send_id` bound to the
tool, the ticket, the body and the recipients. A send needs `confirm:
true` **and** a `send_id` that matches the same tool, ticket, body and
recipients; anything else is `validation`, nothing sent. The mechanism is
`preview.ts`'s: HMAC-SHA-256 under a per-process random key, TTL 15
minutes from the mint time (end included, as `preview.ts`), the wall
clock `Date.now()`, with `preview.ts`'s accepted limitation (a clock set
back stretches the TTL). Recipients are bound per field (`to` and `cc`
are separate), each lower-cased and sorted, so their order does not
matter but moving an address from `cc` to `to` does.

SPEC §9's "Not sent" sentence gains the `send_id`: "Not sent. Show the
user the exact text and recipients; call again with `confirm: true` and
this `send_id` only after they approve."

What the owner rejected: (a) a plain `confirm: true`. The planner's
reason for it stands as a fact, now a stated limitation: the `send_id`
adds a call, a key and a TTL, and it does not stop a model that calls
twice on its own (threat 1).

### OD-21: reply recipients — decided (owner, 2026-11-26)

- No `to` input: Freshdesk addresses the reply to the ticket's
  requester.
- `cc` only from the allow-list (OD-23's matching), the same
  `forward_allow_list` key, no new key.
- `bcc` refused (not an input, never in the payload).
- **The ticket's existing CCs are ignored**: not read, not checked, no
  extra GET. Freshdesk may copy them on the reply (threat 3, stated
  plainly there). M3's test tickets carry no ticket-level CC (owner
  action), and the smoke script refuses one that does (T-086, A6),
  except the one A4 run below.
- The reply tool's description and the "Not sent" text say "Freshdesk may
  also copy the ticket's existing CC addresses, which this tool does not
  check" (new line for T-083's and T-084's acceptance, below).
- **The A4 test (owner, 2026-11-26: yes).** One T-087 reply run on an
  `mcp-test` ticket whose only ticket-level CC is an allow-listed
  internal mailbox records whether Freshdesk copied the CC. T-086's
  `make smoke-send` refuses a ticket with any CC, with exactly one
  exception, for this run:
  - one explicit opt-in flag, `TICKET_CC=allow-listed`, accepted on the
    reply case only; on a forward or public-note case it refuses;
  - with it, the four CC fields (A6) taken together, lower-cased, hold
    exactly one distinct address, that address is on the team
    allow-list by OD-23's matching (T-081's matcher, not a second
    parser), and it is not the requester's email (lower-cased); the
    requester's email is on the list as always; the reply sends no `cc`
    of its own;
  - anything else with the flag refuses, 0 POSTs: no CC at all, two
    distinct CCs, an off-list CC, a CC equal to the requester's email, a
    field absent, null or not a list;
  - without the flag, any non-empty CC field refuses, as before.

  The run can reach no address outside the allow-list: the only address
  Freshdesk could copy is one the owner put on it. The reply's own `cc`
  input stays empty in this run and the CC is not the requester, so a
  copy in that mailbox can only come from the ticket's CC. Rejected: a
  flag that accepts any ticket CC (an unlisted address could receive the
  reply); a separate script for one run (a second smoke path); leaving A4
  unchecked (the first evidence would come from production use).

Rejected by the owner: (b) list the ticket's CCs in "Not sent", and (c)
refuse a reply when any ticket CC is off the list (one GET per reply,
the planner's proposal). The owner chose the simpler path and its stated
consequence; (c) remains the change to make if T-087 or use shows the
copies matter.

Rejected by this RFC: a separate `reply_cc_allow_list` key. Nobody asked
for it, and one list of internal addresses is one thing to review.

### OD-22: forward recipients — accepted (owner, 2026-11-26)

`to` and `cc` each checked address by address against the allow-list;
`to` needs at least one address; `bcc` refused; an empty allow-list
refuses every forward (and every reply `cc`); at most 10 recipients in
total per send, `to` and `cc` together (as OD-14's cap for notify), over
the cap refused, never truncated. The same cap applies to a reply's `cc`.
A refusal names the field and the position, never the address (T-081).

Rejected: no cap (a forward to the whole of an allowed `@domain` list in
one call is not C4's purpose); a cap per field (two numbers to tune for
no gain); truncating (the user approved a list, not a prefix of it).

### OD-23: address matching — accepted (owner, 2026-11-26)

The core parses each address and each allow-list entry itself;
`config.ts` is unchanged.

- Both sides lower-cased (ASCII only, see below).
- An entry `@example.com` matches any local part at exactly
  `example.com`: `a@example.com`, `a+x@example.com`. No subdomain
  (`a@sub.example.com` refused), no suffix trick (`a@example.com.evil`,
  `a@evilexample.com` refused).
- A full-address entry matches only that address.
- An address is refused, not matched, when it holds a display name
  (`Name <a@example.com>`), a list (comma or semicolon), quotes, more or
  fewer than one `@`, whitespace, a control character, any non-ASCII
  character (an internationalised domain is written in its ASCII `xn--`
  form), or a trailing dot in the domain; and when it is empty.
- An allow-list entry no valid address can equal (a typo such as
  `@example.com,`) matches nothing: a bad team file fails closed.

Rejected: subdomains matching their parent (an `@domain` entry would
grow with every subdomain anyone creates); stripping `+tag` (no gain;
`@domain` already takes any local part, and a full-address entry should
mean exactly that address); Unicode normalisation (look-alike domains are
the attack; refusing non-ASCII removes them); tightening `config.ts`'s
regex (the core must check anyway, and two parsers drift).

### OD-24: closed payload keys and the body — accepted (owner, 2026-11-26)

The core builds each payload from a closed key set; nothing else is sent:

| Entry | Payload |
|---|---|
| `reply_to_ticket` | `{ body, cc_emails? }` |
| `forward_ticket` | `{ body, to_emails, cc_emails?, include_original_attachments: false }` |
| `add_public_note` | `{ body, private: false }` |

Never `from_email`, `user_id`, `bcc_emails`, attachments, `incoming` or
`notify_emails`, even passed by a cast.

**Every check runs twice: at the mint and at the confirm.** The
allow-list, the cap, the closed keys and the body rule are applied when an
entry is called without `confirm`, so no `send_id` is ever minted for a
send that cannot happen, and again at the confirm, before the `send_id`
check, so nothing that changed in between is trusted.

**The body is plain text.** The core escapes it to HTML (`&`, `<`, `>`,
`"`, `'`, and each line break to `<br>`) by one fixed function, so what
Freshdesk renders is the text the user read, and the `send_id` binds the
text **before** that escape (the escape is deterministic, so binding
either is the same check). The "Not sent" result shows that same text,
never the escaped HTML, so the user reads what the customer will read,
not `&amp;lt;`. Refused: an empty or whitespace-only body; any
character of the Unicode classes `\p{Cc}` (controls) or `\p{Cf}`
(format: zero-width, bidirectional marks, overrides and isolates, tag
characters, invisible operators), except tab, line feed and carriage
return. Those characters can make the text the customer reads differ from
the text the user approved, or carry text no one sees. One rule over two
whole classes, as the core already uses for addresses
(`src/core/write-path.ts`, `EMAIL`), not a list of code points that
misses some. The rule covers control and format characters only: other
invisible characters, such as variation selectors (`\p{Mn}`) and Hangul
fillers (`\p{Lo}`), are not refused (Consequences, "Not covered"). This rule is this RFC's addition to the planner's proposal.

**Against `add_note`:** `add_note` and `hand_off_draft` pass their body
to Freshdesk unchanged (`src/core/write-path.ts`, `noteWrite`): a private
note is read by agents in Freshdesk, and markup there hurts no customer.
A send's body reaches a customer, so it is escaped. The two differ on
purpose; this RFC does not change `add_note`.

Rejected: passing the body's HTML through (injected markup, a hidden
`<span>`, a link whose text and target differ, would show the customer
something the approval prompt displayed as code the user did not read);
sanitising HTML to a safe subset (a new dependency or a parser of our
own, against SPEC §4's anti-goal, for formatting nobody asked for);
attachments (C4 and C5 do not need them; a file is content no prompt
shows).

### OD-25: does `send` need `write` — accepted (owner, 2026-11-26)

(a) Independent: `send` alone builds the send entries and no write
entries; `write` alone builds no send entries.

Rejected: (b) `send` without `write` a `ConfigError`. No send entry uses
a write entry; coupling them would grant field writes to a team that
asked only to reply.

### OD-26: the public note — decided (owner, 2026-11-26)

**(a), built in M3** (T-088): a third send entry, `add_public_note`, and
its own tool in `send`, with the same confirm and `send_id`. It takes a
ticket id and a body; its payload is exactly `{ body, private: false }`
(OD-24). It has no recipient input, so the allow-list has nothing to
check; its `send_id` binds an empty recipient list. Who it reaches is the
requester, by Freshdesk's notification if enabled on the account, and,
like a reply, possibly the ticket's CCs (threat 3). SPEC §8.2's sentence
"designed in M3 with confirm and allow-list" becomes "built in M3, with
confirm; it has no recipient input".

What the owner rejected: (b) designed only, T-088 left `proposed`.

### OD-27: what a send returns — accepted (owner, 2026-11-26)

- Sent: `{ sent: true, ticket_id, conversation_id }` and
  `api_calls_used`; no address, even when Freshdesk's answer echoes one
  (as `add_note`, `a57ef9b`).
- A 5xx, a timeout, a network error, a 2xx of another shape or a 3xx
  after the POST was dispatched: `may_have_been_sent`, `retryable:
  false`, "check the ticket's conversation before sending again". No
  retry except 429 (T-014: a 429 was not processed).
- "Not sent": names the caller's recipients and "the ticket's requester",
  never the requester's address (the server does not read it, OD-21);
  plus OD-21's CC sentence for a reply and a public note.
- Refusals' `errors[]` scrub any word holding an at sign, as `add_note`.

Rejected: echoing the addresses sent to (a 400's field message or the
answer may hold the requester's or a CC's address, which then reaches the
model and the logs of its client); a retry on 5xx (a mail sent twice).

### OD-28: smoke — accepted (owner, 2026-11-26)

(b) A separate `make smoke-send`, never cases in `make smoke-write`: a
send is never one flag away from a write run. Same tag and spam checks as
smoke-write; one GET per ticket (A6); a reply or public note only when
the requester's email is on the allow-list and the four CC fields are
empty, except OD-21's one A4 opt-in; a forward only to allow-listed
addresses from the private team file, and only on a ticket whose four CC
fields are empty, refused otherwise, since a forward too may copy them
(A2 and A5 unchecked); each
send in two steps (mint, then confirm). Details are T-086's.

Rejected: (a) cases in `smoke-write` (a typo in `CASE=` would mail).

### OD-29: what a forward takes out of Freshdesk — accepted (owner, 2026-11-26)

A forward sends the ticket's content to allow-listed internal addresses:
that is C4's purpose, accepted. `include_original_attachments: false` is
forced by the core. The tool's description says the ticket's content,
possibly its conversation, leaves Freshdesk (A5; whether private notes
are included is unchecked, recorded at T-087).

Rejected: forwarding attachments (files no prompt shows); a forward that
quotes nothing (Freshdesk's forward endpoint decides what it quotes,
A5; building our own mail would be a second send path).

### OD-30: where "never always allow" is written — accepted (owner, 2026-11-26)

One sentence in each send tool's description and a README section, with
T-084; the Italian operator guide stays M4 (SPEC §11).

Rejected: README only (the model and the approval prompt never show the
README); the server refusing to run when "always allow" is set (it cannot
see it, threat 2).

### OD-31: SPEC §13's M3 row — accepted (owner, 2026-11-26)

(b) Add M2's activity-log clause. Proposed wording for M3's "Done when":

> C5 reply, C4 forward and a public note, with confirm and allow-list,
> on `mcp-test` tickets to internal addresses only; mail reached only the
> expected internal mailboxes, and no automation rule acted on `mcp-test`
> tickets after a reply, a forward or a public note, confirmed by the
> activity log

The public note is added because OD-26 builds it. T-087 records both
lines either way. Rejected: (a) the row as it is (a reply may fire a rule
that emails, and M2 already found the activity log the way to see it).

### OD-32: where the `send_id`'s key lives and who mints — accepted (owner, 2026-11-26)

(b) `src/core/send-id.ts`: its own 32-byte key, made once per process in
the module, never read from the environment or config; minted and
checked only by the core's send entries, over the body the entry will
send. Lint keeps the module out of `src/tools/**`.

This is OD-20's mechanism in another module, not a new mechanism: the
core cannot import `src/tools/preview.ts` (the lint allow-list runs the
other way), and a check the core makes on a value a tool minted would put
the key where a tool can reach it. It is needed, not sufficient: a tool
can still call its entry twice in one call (mint, then confirm), which
each tool's test "one call with `confirm: true` and no `send_id` sends
nothing" guards.

Rejected: (a) `src/tools/confirm.ts` on `preview.ts`'s key with the tool
checking: the check would be outside the core (OD-19). Sharing
`preview.ts`'s key from the core: the key would have to move into
`src/core/`, a change to `categorize_tickets` that M3 does not need.

### OD-33: a `send_id` confirmed twice — accepted (owner, 2026-11-26)

(b) **Single use.** A `send_id` sends at most once. The core keeps an
in-process set of spent ids. A `send_id` has exactly one tag (unlike a
`preview_id`, which has one per ticket): it is parsed whole by an
anchored pattern, `time.nonce.tag`, and anything else is refused. The set
holds the id's nonce, not its text, so no rewriting of a spent id's text
that still checks can pass as unspent. At the check, with no `await` between the
check and the reservation, a valid id not in the set is added to it,
before any dispatch. A second confirm of that id is `validation`, "this
`send_id` was already used, and the earlier call may have sent; check the
ticket before sending again" (wording amended by the owner, 2026-11-26,
"Amendments"), nothing sent, whether the
first is still in flight, succeeded or `may_have_been_sent`. The id is
released (removed from the set) only when no request left the process,
that is when the result counts 0 attempts dispatched (`src/client/http.ts`
counts an attempt once it is handed to `fetch`): a refusal the core made
itself, the limiter refusing, or under 10 s left. `http_status: null` is
not that test: a timeout or a reset after the POST left is a `network`
error with `http_status: null` and may have been sent. Any result with an
attempt dispatched keeps the id spent, a network error and a Freshdesk
4xx included: `src/client/errors.ts` maps every 4xx but 401, 403, 404 and 429
to `validation`, and a 408 or 409 is not proof that nothing was sent. The
caller can always mint a new id.

The set is **never pruned** while the process lives. Pruning by the wall
clock would reopen OD-20's accepted limitation: with the clock set back
after an entry was pruned, the id would pass its TTL check again and not
be in the set. The set holds only ids that were confirmed, one per send,
so it stays small; a restart loses it, and the key with it, so every old
id then checks against nothing.

This is per-process server state, a departure from OD-15's no-server-
state choice for previews, stated: a bulk field write re-sent within 15
minutes writes identical values again, harmless; a mail sent twice is
not.

To send the same text again after `may_have_been_sent`, the caller checks
the conversation and starts over without `confirm`, which mints a new id.

Rejected: (a) accept and state that a second confirm sends again (as
`preview.ts`): a model retrying after a timeout would mail the customer
twice. Idempotency through Freshdesk (no idempotency key in A1 to A3).
Reading the conversation before each send to detect a duplicate (one GET
more per send, and a race all the same).

### OD-34: a team file enabling `send` before T-087 — accepted (owner, 2026-11-26)

(a) Procedure, as M2: no team file enables `send` against the real
account, and no `make smoke-send` runs, before T-087's dependencies are
met (T-076 `done`, T-086 `done`). Plus: **no npm release that accepts
`send` before T-087 is `done`**: T-084 is the row that stops `send`
being a `ConfigError`, and no release tag is cut from T-084's commit or
any later one until T-087 records its yes lines. The owner holds both.

Rejected: (b) the server keeps refusing `send` until T-087, with
`make smoke-send` building the core's entries directly. It means a later
row to lift the refusal, and it would let the smoke run take a path users
do not take, so T-087 would not test what ships.

### SPEC wording at acceptance

Only at the acceptance commit (T-079's second half), per the owner's
answers:

- §8.2 `send` table: `reply_to_ticket`: "public reply to the requester;
  `confirm: true` and the `send_id` from a first call required (§9);
  `cc` only from the allow-list, no `to` or `bcc`; Freshdesk may copy the
  ticket's existing CCs"; `forward_ticket`: "forward to allow-listed
  internal addresses; `confirm: true` and `send_id`; the ticket's content
  leaves Freshdesk"; a new row `add_public_note`. The public-note
  paragraph per OD-26.
- §9: the confirm row per OD-19 and OD-20; the recipients row per OD-21
  (threat 3), "Where": the write path, the list from the team file.
- §11 real-account line: "sends only to internal mailboxes on the
  allow-list, on `mcp-test` tickets with no ticket-level CC, except one
  reply run whose only ticket-level CC is an allow-listed internal
  mailbox (A4)".
- §13's M3 row only by the owner's word on OD-31.

### Rows this RFC governs

At acceptance (2026-11-26), T-080 to T-088's acceptance lines were
re-checked against the answers (decompose step 6). This RFC amended the
acceptance line of **T-082, T-083, T-084, T-085, T-086, T-087 and T-088**,
in `docs/tasks/PLAN.md` and in each task file; T-080 and T-081 were
re-checked and left unchanged. What changed:

- T-082: the body rule of OD-24 (`\p{Cc}` and `\p{Cf}` refused but tab,
  line feed and carriage return; line breaks to `<br>`); every check at
  the mint and again at the confirm (OD-24); `to` needs at least one
  address (OD-22); the reply `cc` cap (OD-22); the release rule of OD-33
  (only 0 attempts dispatched frees the id; a network error or a 4xx
  after dispatch keeps it spent; no pruning).
- T-082 and T-083: "body as sent" reads "the body before escaping"
  (OD-24); T-083: the spent set is never pruned, a `send_id` has exactly
  one tag and the set holds its nonce (OD-33).
- T-083, T-084, T-085 and T-088: the "Not sent" text and each send tool's
  description put the ticket id first and ask the user to check it is the
  ticket they mean (threat 1); the reply's and the public note's carry
  OD-21's CC sentence.
- T-086: the A4 opt-in of OD-21 (one flag, reply only, one allow-listed
  ticket CC that is not the requester, no `cc` of the reply's own; every
  other CC case refuses; the requester check still holds under the flag;
  any other flag value refuses); a forward on a ticket with any CC
  refuses (OD-28, SPEC §11).
- T-087: the activity-log line after a reply, a forward and a public note
  (SPEC §13, OD-31); the A4 line becomes the result of the opt-in run
  (whether the CC mailbox received the reply), not "not checked". By the
  owner's word (2026-11-26, "Amend T-086 and T-087 to match"), T-086's
  and T-087's "In scope" and T-087's "Goal" were aligned with the A4 run
  in their task files.

## The owner's decisions (2026-11-26)

Given via the orchestrator on 2026-11-26:

- **Every proposal accepted as written:** OD-17, OD-18, OD-19, OD-22 to
  OD-25 and OD-27 to OD-33, including OD-33's single-use `send_id`, a
  stated exception to OD-15's no-server-state choice.
- **OD-34:** the procedure, plus no npm release that accepts `send` until
  T-087 is `done`.
- **OD-31:** SPEC §13's M3 row worded as proposed (adopted with every
  proposal).
- **The A4 test (OD-21's question): yes.** One T-087 reply run on an
  `mcp-test` ticket whose only CC is an allow-listed internal mailbox,
  recording whether Freshdesk copied the CC; T-086's smoke-send allows
  exactly that case, with one explicit opt-in flag and the CC on the
  allow-list (OD-21, "The A4 test"); T-086 and T-087 amended to match.

## Amendments

- **2026-11-26, owner (via the orchestrator), text only.** OD-33's
  message for a `send_id` already used was "this `send_id` was already
  used; nothing was sent". After a first confirm that sent, or that ended
  `may_have_been_sent`, a model can read "nothing was sent" as about the
  mail, mint a new id and send twice (T-083 security review,
  `docs/improvements.md`, `3aed115`). The message is now "this `send_id`
  was already used, and the earlier call may have sent; check the ticket
  before sending again". The mechanism is unchanged: the same refusal,
  `validation`, nothing sent by this call.

## Consequences

- **Easier:** one place, the core, to read to know what any send can do:
  which recipients, which keys, when it fires. A review of a send tool
  checks its use of the core's entry. A second confirm, a cast key or an
  off-list address is refused by construction, not by each tool.
- **Harder:** every send is two calls, and a `send_id` dies after 15
  minutes or on restart; the user approves twice (the first call shows
  the text, the second is the one that sends). Any change to recipients,
  keys, the body rule or the recipient cap of 10 is a change to the core
  and goes through `/rfc` (the previous RFC kept caps out of the core for
  M2; for `send` this RFC puts this one in).
- **Cost:** a new core module (`send-id.ts`) with per-process state (the
  spent set), the first server state besides the limiter's; three send
  entries and their resources; a recipient matcher in the core; a smoke
  script. No new dependency.
- **Given up:** HTML formatting in replies; attachments; a team-specific
  reply CC list; resending by re-confirming.
- **Not covered:**
  - invisible characters in the body outside `\p{Cc}` and `\p{Cf}`
    (variation selectors, Hangul fillers; OD-24): they could carry text
    the approver does not see. Widening the rule, for example to
    `\p{Default_Ignorable_Code_Point}`, is a change to the core's body
    rule and goes through `/rfc`;
  - the content of the body, and which ticket (so which requester) a
    reply or a public note goes to (threat 1): only the approval prompt
    guards them, and it shows a ticket id, not a person;
  - a user who sets "always allow" (threat 2);
  - **the ticket's existing CCs on a reply or a public note (threat 3,
    OD-21)**: they may receive it, unchecked;
  - Freshdesk's own additions to a sent mail (an agent signature, a
    status change on reply, A5) and automations a send fires on a
    production ticket;
  - hostile code in the process (as before).

## Alternatives considered

The rejected options for each decision are under that decision. Across
the whole design:

- **No `send` toolset; drafts only (M2's `hand_off_draft`).** C5 and C4
  stay with a human who copies the draft. Rejected: SPEC §13 commits M3,
  and the owner approved its plan (2026-11-26); the risk is handled by the
  checks above, not by not building it.
- **Send through Freshdesk's own approval (a draft the agent sends from
  the UI).** The v2 API has no "draft reply" object we know of (not in
  A1 to A6); a private note headed `DRAFT REPLY` is already C6. Rejected
  for M3; it would be C6, not C5.
- **A heavy core (signed approvals tied to a user, a governed send-gate
  file).** Rejected as in the previous RFC: SPEC §4's anti-goal, and the
  client's approval prompt is the human gate the design relies on.

## Review

`rfc-reviewer`, 2026-11-26, full round on the first draft: no high
finding; five medium, three low, all resolved in this draft.

1. (medium, fail-open) OD-33 released a `send_id` on any `validation`,
   which includes a Freshdesk 4xx after the POST was sent: now released
   only when no request left the process.
2. (medium, fail-open) OD-33's pruning by the wall clock, with a clock set
   back, let an id send twice: the spent set is never pruned.
3. (medium) OD-24's body rule listed code points and missed some (LRM,
   RLM, tag characters): now `\p{Cc}` and `\p{Cf}` but tab, LF, CR.
4. (medium) threat 1 left out that ticket text can steer `ticket_id`, and
   so the reply's recipient: added to threat 1, "Not covered", and the
   "Not sent" text and descriptions put the ticket id first.
5. (medium) "That RFC stays in force unchanged" was not true: the three
   points it changes are named at the top; the cap's move into the core
   is under Consequences.
6. (low) A4 is not checked in M3: said outright; an optional safe test is
   put to the owner under OD-21.
7. (low) OD-34's rule-1 reason for rejecting (b) was wrong: dropped.
8. (low) where the checks run and which body is bound: both stated
   (OD-24), and T-083 added to the rows governed.

Findings 1 to 3 change a mechanism (`/rfc` step 5, AGENTS.md rule 9): the
scoped round, on those three only, is in T-079's second half, after the
owner's answers.

`rfc-reviewer`, 2026-11-26, scoped round (the last, AGENTS.md rule 9) on
findings 1 to 3's fixes and on the new A4 opt-in: two high, two low; all
resolved by wording or by a check that adds no mechanism.

9. (high, fail-open) OD-33's release test named `http_status: null`,
   which a `network` error after the POST left also has
   (`src/client/errors.ts`, `networkError`): the test is now 0 attempts
   dispatched only. Wording: "no request left the process" already meant
   this.
10. (high, fail-open) a `preview_id` has one tag per ticket and a confirm
    looks only at the tags it needs (`src/tools/preview.ts`); a
    `send_id` copied in that form, its spent set keyed by text, would let
    a spent id with a tag appended pass as unspent: a `send_id` now has
    exactly one tag, parsed by an anchored pattern, and the set holds the
    nonce. This pins the form of OD-20's id and what "spent" is keyed on;
    the mechanism (HMAC, TTL, a spent set checked before dispatch) is
    unchanged.
11. (low) OD-24 claimed to refuse every character that carries text no
    one sees; variation selectors and Hangul fillers are outside
    `\p{Cc}`/`\p{Cf}`: the claim is narrowed to control and format
    characters, and the rest is under "Not covered". Widening the rule is
    left to the owner (a body-rule change, `/rfc`), not done in this round.
12. (low) A4: the one ticket CC could be the requester's own address,
    giving a false "copied": with the flag, a CC equal to the requester's
    email refuses, and the reply sends no `cc` of its own (smoke script
    only, no core change).

Parked from the scoped round, with its other notes, in
`docs/improvements.md`.
