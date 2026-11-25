# A search cursor holds the second and the ids written in it

- **Status:** Active (owner, 2026-11-25)
- **Date:** 2026-11-25
- **Author:** freshdesk-mcp team
- [x] Implemented (T-066, 2026-11-25)

## Context

`export_tickets` pages a period with `next_cursor` (T-057). On the search
path (300 matches or fewer) the cursor's position is, since T-063 (0.3.0),
the pair (`created_at` second, id) of the last ticket written and the
search page that held it, as one safe integer. A resumed read requires the
pairs to fall strictly in search's order, "created_at, then id, both
descending", and is refused otherwise.

The id half of that order is wrong. The owner's probe (2026-11-25,
`make smoke-order-probe DAY=2026-11-23`, output kept in
`docs/private/account-facts.md`) read 177 results: `created_at` never rises
between neighbours, and the one neighbouring pair that shares a second has
its ids **rising**. So a resumed export is refused at that tie (near ticket
154 of 177), and a fresh read past it gives no cursor (`unordered`). The
owner's real export of that day cannot be paged. 0.3.0 does not fix it.

The tie order inside one second is therefore not something a position can
rely on. Only `created_at` is ordered (descending). A position that is
correct whatever the tie order must remember **which** tickets of the last
second were written, not where they stood.

`src/tools/list.ts` documents an invariant that this changes: a cursor is
`<position>.<digest>`, "what it returns is a position and nothing else"
(`docs/architecture/overview.md` line 36), and "a forged cursor can only
carry a whole number" (`list.ts` header). Callers see a cursor's form and
length. Hence this RFC (`INSTRUCTION.md`: a public contract changes).

## Decision

The design was approved by the owner on 2026-11-25 (T-066, "In scope");
this RFC records it.

1. **The search position** is the `created_at` second `S` of the last
   ticket written, the set of ids already written in `S` (by this call and
   the calls before it, at most 30: one search page), and the search page
   that held the last ticket written.
2. **Resume.** A resumed read skips tickets whose `created_at` is later
   than `S` (they come earlier in search's order: written before, created
   since, or entered the filters since) and, within `S`, those whose id is
   in the set. It writes the rest, whatever their id order. Between two
   calls, none that matched at the first call is skipped unless it left
   the filters (as T-063 says, and only between calls: within one call,
   offset paging can still move a ticket onto a page already read, as
   before this RFC).
3. **The order check** is only that `created_at` does not rise and that
   every `created_at` reads, on every page a resumed read reads
   (step-backs and their join included). A rise, or an unreadable one,
   refuses a resumed read with nothing kept; a fresh read writes on and,
   if it stops early, gives no cursor (`unordered`, as today).
4. **Step-back.** From the position's page, go back a page while the page
   is empty or its first result's second is `<= S`. Then the whole tie run
   of `S` lies at or after the page read, whatever its order. Each step
   counts against the budget and the time limit, as today.
5. **The set resets.** It holds only the ids of `S`. Writing a ticket of
   an older second starts it again with that ticket's id.
6. **The bound.** When the call stops and the set would hold more than 30
   ids, the call keeps its file and returns `truncated: true` with no
   `next_cursor`, and a `note`: do not call again with the same cursor;
   export the period without `max_tickets` (up to 300 matches fit one
   call, budget permitting, `confirm: true` past the budget) or in shorter
   periods. This holds whatever stopped the call: `max_tickets`, or a cut
   (budget, time limit) inside such a run. The tool's description
   says the same. A one-day period cannot be narrowed, so for it the way
   out is a call without `max_tickets`. This replaces T-063's "pair too
   large" case (`UNHELD`): the position no longer holds an id, so a large
   id cannot overflow it.
7. **The ids form** (`list.ts`, a separate reader and minter used by
   `export_tickets` only; `readCursor`, `listEnvelope` and
   `CURSOR_MAX_LENGTH` do not change, so no other list tool changes):
   - `<position>.<id>-<id>-….<digest>`, or `<position>.<digest>` when the
     set is empty.
   - Ids are canonical decimals (`[1-9][0-9]{0,15}`: no leading zero, sign
     or empty segment), safe integers, strictly ascending, at most a bound
     the caller passes (30).
   - The digest is SHA-256, base64url, over the tool, the arguments (as
     `readCursor`'s), the position **and the ids array**, the empty array
     included. So a plain cursor and an ids cursor never verify as each
     other.
   - The reader checks the length first (its cap is the longest cursor
     the minter can give for the bound, computed: a 16-digit position, 30
     ids of 16 digits, 29 dashes, two dots, a 43-character digest: 570),
     then one anchored pattern with no nested quantifiers, then each id,
     the bound, the digest, and the position against a `maxPosition` the
     caller passes. Any failure is `validation`, `http_status: null`, and
     the message never quotes the cursor.
   - It returns the position and the ids, numbers only. The ids are
     compared with results, never sent: no cursor content reaches a URL,
     a host or a path.
   - The minter throws a `TypeError` for more ids than the bound, ids not
     strictly ascending, an id below 1 or an unsafe one. It never trims or
     sorts.
8. **The amended invariant.** `list.ts`: a cursor of the ids form carries
   a whole number and a bounded set of whole numbers, both used only for
   comparison. `overview.md` line 36 says so.
9. **The position integer.** The odd (search) position drops the id:
   `2*(rel*MAX_SEARCH_PAGE + page-1) + 1`, `rel` the second minus the
   period's first. `export_tickets`' `maxPosition` becomes the period's
   real bound (the larger of the search and list maxima), since the
   position no longer holds an unbounded id. After the digest, the tool
   refuses an odd position whose second is outside the period, and ids on
   position 0 or on an even (list) position. A page over
   `MAX_SEARCH_PAGE` cannot be expressed (`page-1` is the position modulo
   10), so the task's "page over 10" case is tested as the highest
   position of the period's last second accepted, the next one refused as
   outside the period (rfc-reviewer, 2026-11-25).
10. **Old cursors refused once.** `export_tickets`' `CURSOR_FORM` becomes
    3. Every form-2 cursor (T-063, 0.3.0), search and list alike, is
    refused with nothing sent. A form-2 search cursor is not read as the
    set `{id}`: the tie tickets above that id, which 0.3.0 had already
    written, would be written twice. CHANGELOG says so.
11. **`count_tickets`** shares `readPeriod` but passes no `resume` and does
    not read `unordered`: its output does not change.

### Threat model of the unkeyed digest

The digest stays unkeyed. It catches a cursor used with another call, and
an edited one; it does not stop a forged one, since anyone can recompute
it. A forged position can already make a call skip every ticket newer than
a chosen second; a forged id set adds the skipping of chosen ids within
that second. Both affect only what the caller's own export writes, from
the caller's own account, through the caller's own client: there is no
second party a forgery could harm, apart from the prompt-injection path
below.

One path to a forged cursor does not come from the user (rfc-reviewer,
2026-11-25): the model supplies the cursor, and it reads ticket text that
outside customers write. A prompt-injected model could pass a forged
cursor that drops chosen tickets of one second from an export that
otherwise looks complete; before, a forged position could drop only a
run of tickets newer than a second. The marginal risk is small: an
injected model can already narrow the filters, choose the period, or
stop paging, and the file and its row count go to the user, not to the
injector. A key would have to live in the process
(nothing else stores one), so every restart, which MCP clients do freely,
would invalidate every cursor. **Owner, 2026-11-25: unkeyed, the forgery
risk accepted for this reason.** Confirmed by the owner after T-066's
handoff (2026-11-25, relayed by the orchestrator at `/decompose M2`): the
prompt-injection path stays accepted.

A `next_cursor` now shows, in clear, the ids of tickets already written in
its second. They are the caller's own tickets, already in the file the
same call wrote.

### Cursor length

The longest cursor is 570 characters (point 7); in practice a tie run is a
few ids, so a cursor is tens of characters. **Owner, 2026-11-25: about 570
is acceptable.**

### The owner's word (2026-11-25)

Given in advance, through the orchestrator's dispatch of T-066: the RFC
becomes Active by the owner's word provided it stays within the approved
design (point 1 to 6, 10; the unkeyed digest with the forgery risk
accepted, since only the user's own client reads their own account and a
per-process key would invalidate cursors on every restart; a cursor of
about 570 characters acceptable). The `rfc-reviewer` (2026-11-25) found
no change to that design; its seven findings were resolved in wording
here (the prompt-injection path in the threat model, the count
alternative, the "entered the filters" caveat, the cut past 30 ids, the
step-back's extra request, the "page over 10" acceptance line,
reversibility). No second review round: no mechanism changed.

## Consequences

- The owner's export of 2026-11-23 pages: ties in either id order are
  written once.
- The resumed read no longer depends on an unmeasured tie-break; the one
  order it checks (`created_at` not rising) was measured on every pair.
- A cursor grows from at most 64 to at most 570 characters, and shows ids.
- A resume whose page starts with a ticket of second `S` (most often the
  last ticket written at the top of its page) steps back one page: one
  request more than T-063, and that page is read twice.
- Reversible at the cost of one more `CURSOR_FORM` bump, which refuses
  every cursor once more, as point 10 does now.
- A new no-cursor case: more than 30 tickets written in one second.
  Exports with `max_tickets` across such a burst must instead run without
  `max_tickets` or over shorter periods. Bulk imports that stamp many
  tickets with one second are the likely source.
- Every 0.3.0 cursor is refused once after the upgrade (the second such
  break after T-063).
- `list.ts` has a second cursor form to keep correct; the other list
  tools are untouched.

## Alternatives considered

- **Keep one integer and stop only on a second's boundary**, dropping the
  unfinished tie run from the call. Rejected: it changes what
  `max_tickets` means (a call may write fewer, or must write more), and a
  tie run longer than `max_tickets` never moves forward.
- **Count the ties, as the list scan does** (one integer, no form
  change). Rejected: a count assumes the tie order stays the same between
  calls, which is not measured (the probe saw one tie); a tie that moves,
  enters or leaves the results skips one ticket or writes one twice,
  which the list path documents as its own exception.
- **Keep the pair, flip the tie-break to id ascending.** Rejected: one
  measured tie is not an order; another tie, or another account, may
  differ, and the check would refuse again.
- **Read a form-2 search cursor as the set `{id}`.** Rejected (point 10):
  it writes twice what 0.3.0 already wrote.
- **A keyed digest.** Rejected (threat model): a per-process key
  invalidates cursors on every restart, against no second party.
- **No bound on the set.** Rejected: the cursor's length must be capped
  before parsing (model-supplied input); 30 is one search page.
