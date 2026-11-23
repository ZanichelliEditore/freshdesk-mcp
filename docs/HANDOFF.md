# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-23T18:15:41+01:00`
- **Describes commit:** `<hash>` (filled in the stamp commit). **CI:**
  filled in the stamp commit.

- **Current task:** T-018 `done (2026-11-23)`,
  `docs/tasks/T-018-list-envelope.md` ("Done"). Commits `86d293c` (build),
  `14487fa` (full-round fixes) and the handoff commit (overview wording,
  parked items).

- **Next action:**
  1. **A short `/decompose`** that applies the pending proposed plan
     changes below (T-017 wording, T-026 line, T-051's `type` entry, the
     list-tool lines): T-051 must be amended before it is built. Then
     `/pickup` by PLAN's rule.
  2. **The owner** runs `make smoke` against the real account (still
     pending; see HANDOFF at `e9df10e`, "Next action" 1). It unblocks
     T-022 (then T-023, T-024, T-043) and decides T-041.
  3. **The owner**, on the Dependabot pull requests (still open; T-044
     "Done"): PR #1 rebase, check and merge; PR #3 close; confirm or drop
     T-052.

- **Read before anything else:** "Proposed plan changes" below;
  `docs/tasks/PLAN.md` (rows T-017, T-021, T-026, T-051 and the list-tool
  rows).

- **Reviews:**
  - **Full round** on `bd1fc26..86d293c`, R1 = `86d293c`. The four quotes
    matched for all three. compliance-reviewer: Wireframes `none`.
    code-reviewer: 1 Medium, 3 Low; it made one read-only Bash call (a
    `grep` of `SPEC.md`) and said so. security-reviewer: 2 Low, 1 info. All
    fixed in `14487fa` by the orchestrator's decisions; the list-tool test
    rule went to the plan changes below.
  - **Scoped round** on `86d293c..14487fa`. The four quotes matched for
    all three; no Bash calls. List A empty for all three; compliance
    `none`. List B parked in `docs/improvements.md`, entry `14487fa`;
    code B3 (overview signature) fixed in the handoff commit.

- **Proposed plan changes** (for the next `/decompose`; this session may
  not edit those rows):
  - **T-021 and every list-tool row** (T-026, T-027, T-032, T-034 and any
    later one using `src/tools/list.ts`): the tool's tests repeat "a
    refused cursor sends nothing" (MockAgent call count 0), the tool passes
    the raw JSON arguments to `listEnvelope` / `readCursor`, and passes a
    `maxPosition`, made required in `readCursor` by T-021 (parked
    `14487fa`).
  - T-017's acceptance to read "…one closing delimiter, at the end of the
    block; a truncation marker, when present, follows it" (orchestrator's
    choice of 2026-11-23).
  - T-026's acceptance gains "a `custom_text` value is inside
    `<ticket_content>`, a validated dropdown value is not".
  - T-051's allow-list lacks `../client/resources/ticket-fields.js` at
    `T0`: `src/tools/format.ts` imports it as a type; it needs a `type`
    entry. `src/tools/list.ts` needs nothing new (`node:crypto`,
    `../client/errors.js`).
  - Carried: T-052 (Dependabot ignore rules), T-041 (waits on OD-4) and
    T-049 (owner's confirm or drop) stay `proposed (2026-11-23)`.

- **Open doubts (owner):**
  - **T-018:** the cursor digest is unkeyed (a forged cursor carries a
    whole number only); with no cursor, non-JSON arguments are caught only
    after the requests (fails closed). See the task file.
  - **T-017:** a customer's `<` (as in `"Ada" <ada@…>`) reads `‹` in
    every block; `ticketOutput` does not wrap (T-026 applies `fieldValue`).
  - **T-044:** checkout v7's `persist-credentials` default is not in its
    release notes; check it before merging PR #1.
  - **T-016:** RFC 2026-11-23 rule 2 read by its purpose for
    `scripts/smoke/cli.ts`; the "not JSON" label relies on a fixed message
    prefix in `src/client/http.ts` (parked, `2f20509`).
  - **T-051's list** is drawn from the M1 task files (see HANDOFF at
    `31ce639`).
  - **Carried from before**, unchanged; see HANDOFF at `81ee087`:
    T-050 `.constructor` and `rate-limit.ts` not banned; the 5 s lint-test
    timeout (`97c11e8`); T-047's builder choices; T-048 and T-038 publish
    gates; OD-2, OD-3, OD-4; the orchestrator's choices of 2026-11-23;
    `examples/team-config.example.json` until T-019 and T-037; schemas
    taken from the docs, not measured; the gitleaks planted-secret check
    (T-001); hashes from before the history rewrite.

- **Dead ends:** none this task. From before: matching the delimiter word
  by pattern (T-017); running the smoke script through Node's type
  stripping; the shortest-form grammar for T-051; the root `server.json`
  and the MCP Registry listing (withdrawn by the owner on 2026-11-23). Do
  not raise them again unasked.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (Node 22), filled from the run
  before the handoff commit:
  - eslint clean, ruff "All checks passed!";
  - prettier "All matched files use Prettier code style!";
  - `tsc --noEmit` clean;
  - vitest "Test Files 17 passed (17)", "Tests 846 passed (846)";
  - `tools/checks` "Ran 54 tests", OK;
  - `npm run build` clean;
  - both gitleaks scans passed.
