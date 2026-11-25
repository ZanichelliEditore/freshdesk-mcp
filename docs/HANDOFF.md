# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-25T10:43:51+01:00`
- **Describes commit:** filled by the stamp commit. **CI:** filled by the
  stamp commit.

- **Current task:** T-058 `done (2026-11-25)`, `list_solution_tree`
  takes an optional `category`,
  `docs/tasks/T-058-solution-tree-category.md` ("Done"). Commits
  `c14c8c0` (status), `59dc763` (`getCategory`, the tool's `category`,
  smoke prefers it), `f0f9869` (review records, done). Built by a builder
  agent under the orchestrator.
  - **Real run** (orchestrator, owner's authorisation, GET only,
    2026-11-25, `make smoke-core` at `59dc763`; raw in the gitignored
    `docs/private/account-facts.md`): "17 tool lines, 17 pass, 0 pass
    (empty), 0 not exercised, 0 refused (budget), 0 fail; 102 calls",
    `smoke core: ok`; `list_solution_tree category: pass, categories 1,
    folders 11, articles 35, calls 13`.

- **Next action:** no build task left on the path to the first release.
  The owner:
  - **Release, RFC 2026-11-25 steps 0–6** (HANDOFF at `c6dba4b`): steps
    1–2 (environment `npm`, `v*` tag ruleset, `main` ruleset) can be done
    by the orchestrator with `gh` if the owner is a repository admin and
    says go; steps 3–4 and 6 need the owner's npm login; step 5 (tag
    `v0.1.0`) by the orchestrator on the owner's go.
  - **T-057 (rule 9):** accept the unreviewed scoped list A fixes
    (`ba6ea89`), or ask for a review.
  - **T-057:** list-scan same-second tie exception: keep, or fix at one
    `GET /tickets/{id}` per resumed call.
  - Then `/pickup` by PLAN's rule (still `proposed`: T-041, T-052, T-049;
    M2 gates T-040, T-014).

- **Read before anything else:** the RFC's manual steps; T-057's task
  file "Open doubts".

- **Reviews:** full round on `90ce4a8..59dc763`, R1 = `59dc763`. The four
  quotes matched for all three. compliance: Wireframes `none`. security:
  no finding, 1 info (folders read with the id from Freshdesk's reply).
  code-reviewer: clean, 3 Low. Parked, `docs/improvements.md` entry
  `59dc763`. No code after R1, no scoped round. SPEC §8.2 checked by the
  orchestrator: it names the tool, not its inputs.

- **Proposed plan changes:** none new.

- **Open doubts (owner):** see "Next action"; earlier: HANDOFF at
  `aff4666`, `c6dba4b`, `d1c7efe`, `fe81a3c`.

- **Dead ends:** a bad `category` is refused by the SDK's input check, not
  the tool's `validation` (T-058 task file).

- **Known red:** none (CI red on `1afbd08` fixed in `c23a682`, green on
  `aff4666`).

- **Checkpoint:** `make quality` exit 0 (local Node v26.13.1), run by the
  orchestrator on `f0f9869`:
  - vitest "Test Files 39 passed (39)", "Tests 2591 passed (2591)";
  - `tools/checks` "Ran 87 tests", OK;
  - lint, format, typecheck, build and both gitleaks scans passed.
