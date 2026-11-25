# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-25T13:32:19+01:00`
- **Describes commit:** filled by the stamp commit right after this one.
  **CI:** filled by the stamp commit.

- **Current task:** M1 plan session (`/decompose` scoped to T-049, T-052
  and the owner's row of 2026-11-25) `done (2026-11-25)`: T-061, T-052,
  T-049 sized to `todo` with task files, in that order after T-060 in
  `docs/tasks/PLAN.md` (dated note above "Not sized"). Commits `bcf8138`,
  `6a8cfdc` and this one. T-046's two open doubts closed by the owner
  (`docs/tasks/T-046-tool-catalogue.md`, "Open doubts").

- **Next action:** `/pickup` takes T-061 (README `npx` commands with
  `--prefer-online`; first `todo` in PLAN order, T-060 done). The
  orchestrator has T-040 and T-014 (M2 gates) in scope next by the owner's
  word; their rows are untouched by this session.

- **Read before anything else:** `docs/tasks/T-061-readme-prefer-online.md`.

- **Reviews:**
  - Full round, R1 = `bcf8138`, range `bd61729..bcf8138`, diff file with
    quotes checked for all three:
    - `code-reviewer`: 2 Medium (T-061 "an `npx` command" undefined;
      T-049 one-commit-at-a-time clause untestable), 3 Low (T-049 malformed
      `RANGE`; T-052 comment check loose, Dependabot behaviour untestable;
      T-061 edits the stale block). All fixed in `6a8cfdc`; the last as a
      note in T-061's scope.
    - `security-reviewer`: 1 High (T-049 run from the PR's checkout), 3
      Medium (T-012's partial-read exit and shallow clones; reversed range,
      silent pass; messages and paths not scanned), 1 Low (`RANGE`
      quoting), 2 Info (T-052 may mute security updates: the builder
      confirms; pin advice overstated: parked, `docs/improvements.md`).
      Fixed in `6a8cfdc` except the parked Info.
    - `compliance-reviewer`: wireframes `none`, complete.
  - Scoped round, range `bcf8138..6a8cfdc`, quotes checked for all three:
    `code-reviewer` and `security-reviewer` each 2 fail-open findings on
    T-049 (empty range no longer refused; checkout guard missed a local
    merge or dirty `Makefile`/`tools/`), fixed in this commit; the rest
    parked (`docs/improvements.md`, "M1 plan scoped review");
    `compliance-reviewer`: wireframes `none`, complete.
  - The scoped fix changed T-049's guard mechanism a second time and was
    **not reviewed again** (rule 9): owner, see "Open doubts".

- **Proposed plan changes:** none.

- **Open doubts (owner):**
  - T-049's checkout guard (acceptance in PLAN and task file) was changed
    by the scoped round's fix and not reviewed a third time; confirm it, or
    have T-049's own review settle it.
  - README's "Not yet published" block is stale (0.1.0 and 0.2.0 are on
    npm); T-061 only updates its snippet. Remove it in T-061, a new row,
    or keep?
  - Closed: pin vs `--prefer-online` (owner, 2026-11-25: `--prefer-online`,
    T-061; pin advice kept). Step 6 of RFC 2026-11-25 (release on npm: 2FA,
    disallow tokens) is the owner's own action, not a row (PLAN, "Not
    sized").

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `6a8cfdc` plus this commit's
  doc edits:
  - vitest "Test Files 39 passed (39)", "Tests 2645 passed (2645)";
  - `tools/checks` "Ran 87 tests", OK;
  - lint, format, typecheck, build and both gitleaks scans passed.
