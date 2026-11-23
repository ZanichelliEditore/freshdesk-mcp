# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-23T18:04:33+01:00`
- **Describes commit:** `60909d3`
  (`60909d35c7cb11e4938c4fb134458b2f011475b5`), pushed to
  `ZanichelliEditore/freshdesk-mcp`. **CI:** green,
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45223781850
  (ran on `60909d3`: `quality (22.19)`, `quality (24)`, `checks`). This
  file's hash and CI line arrive in the commit right after it.

- **Current task:** T-017 `done (2026-11-23)`,
  `docs/tasks/T-017-untrusted-content.md` ("Done"). Commits `fef8a5f`
  (build), `1950f43` (full-round fixes) and `60909d3` (handoff: one test,
  comment wording).

- **Next action:**
  1. **The owner** runs `make smoke` against the real account (still
     pending; see HANDOFF at `e9df10e`, "Next action" 1). It unblocks
     T-022 (then T-023, T-024, T-043) and decides T-041.
  2. **The owner**, on the Dependabot pull requests (still open; T-044
     "Done"): PR #1 rebase, check and merge; PR #3 close; confirm or drop
     T-052.
  3. Meanwhile `/pickup` takes **T-018** (list envelope and cursor): by
     PLAN's rule the first `todo` row whose dependencies are `done` (T-011).

- **Read before anything else:** `docs/tasks/PLAN.md` (T-018 row);
  "Proposed plan changes" below.

- **Reviews:**
  - **Full round** on `b77e51e..fef8a5f`, R1 = `fef8a5f`. The four quotes
    matched for all three; no Bash calls. compliance-reviewer: Wireframes
    `none`. security-reviewer: 1 Medium-High, 1 Medium, 3 Low.
    code-reviewer: 3 Medium, 6 Low. All fixed in `1950f43` by the
    orchestrator's decisions, except the plan items below.
  - **Scoped round** on `fef8a5f..1950f43`. The four quotes matched for
    all three. compliance-reviewer: `none`. security-reviewer: list A
    empty. code-reviewer: list A 1 (T-017's acceptance wording "one closing
    delimiter, at the end" vs the marker after CLOSE): code kept, one test
    added in the handoff commit, wording proposed below. code-reviewer made
    two read-only Bash calls (`git show | grep`) and said so.
  - List B of the scoped round parked in `docs/improvements.md`, entry
    `1950f43`; the comment-wording items of it applied in the handoff
    commit.

- **Proposed plan changes** (for the next `/decompose`; this session may
  not edit those rows):
  - T-017's acceptance to read "…one closing delimiter, at the end of the
    block; a truncation marker, when present, follows it" (orchestrator's
    choice of 2026-11-23).
  - T-026's acceptance gains "a `custom_text` value is inside
    `<ticket_content>`, a validated dropdown value is not" (`ticketOutput`
    does not wrap; `fieldValue` needs the `TicketField`).
  - T-051's allow-list lacks `../client/resources/ticket-fields.js` at
    `T0` (task file, "In scope", `T0` entries): `src/tools/format.ts`
    imports it as a type; it needs a `type` entry.
  - Carried: T-052 (Dependabot ignore rules), T-041 (waits on OD-4) and
    T-049 (owner's confirm or drop) stay `proposed (2026-11-23)`.

- **Open doubts (owner):**
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

- **Dead ends:** matching the delimiter word by pattern (T-017 "Dead
  ends"). From before: running the smoke script through Node's type
  stripping; the shortest-form grammar for T-051; the root `server.json`
  and the MCP Registry listing (withdrawn by the owner on 2026-11-23). Do
  not raise them again unasked.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 (Node 22), filled from the run
  before the handoff commit:
  - eslint clean, ruff "All checks passed!";
  - prettier "All matched files use Prettier code style!";
  - `tsc --noEmit` clean;
  - vitest "Test Files 16 passed (16)", "Tests 758 passed (758)";
  - `tools/checks` "Ran 54 tests", OK;
  - `npm run build` clean;
  - both gitleaks scans passed.
