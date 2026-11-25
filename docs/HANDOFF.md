# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-25T12:41:39+01:00`
- **Describes commit:** filled by the stamp commit right after this one.
  **CI:** filled by the stamp commit.

- **Current task:** T-060 `done (2026-11-25)`, `--export-dir` flag,
  `docs/tasks/T-060-export-dir-flag.md` ("Done" lists commits and tests).
  Build `1d4463b`, review fixes `16c6ff4`. Version 0.2.0 (unreleased) in
  `package.json`, `src/version.ts`, CHANGELOG; not tagged, not published.

- **Next action:** the owner decides the 0.2.0 release (tag `v0.2.0` on
  the stamp commit's parent or later; `release.yml` publishes). Otherwise
  `/pickup` takes the next row: T-046 (first `todo` with dependencies
  done), or one of T-040 / T-014 (M2 gates).

- **Read before anything else:** `docs/tasks/T-060-export-dir-flag.md`
  ("Open doubts"); `CHANGELOG.md` 0.2.0.

- **Reviews:**
  - Full round, R1 = `1d4463b`, range `fcbce1d..1d4463b`:
    - `code-reviewer`: 1 Medium (the "names `--export-dir`" tests passed
      for any refusal, since every refusal's fixed ending named it), 2 Low
      (ending omitted `--version`; overview.md line 49 overstated), Info.
      All fixed in `16c6ff4`. A first `code-reviewer` dispatch without the
      diff file ran with `git diff`; its findings are the same set, and the
      dispatch with the diff file (quotes checked) reported the Lows only:
      both recorded.
    - `security-reviewer`: first dispatch without a diff file = red gate
      (no shell, nothing reviewed); re-dispatched with the diff file,
      quotes checked: no findings.
    - `compliance-reviewer`: wireframes `none`, complete.
  - Scoped round, range `1d4463b..16c6ff4` (no mechanism changed), quotes
    checked for all three: `code-reviewer` no finding, one item parked
    (`docs/improvements.md`, `16c6ff4` entry: `test/config.test.ts:411`);
    `security-reviewer` no finding (one doc-accuracy note dismissed: the
    full round's code-reviewer checked `place()`); `compliance-reviewer`
    wireframes `none`, complete.

- **Proposed plan changes:** none.

- **Open doubts (owner):** README snippets unpinned (`@<v>` in the task's
  scope): keep or pin? Step 6 of the release RFC on npm ("Require
  two-factor authentication and disallow tokens") still open; see the
  T-057, T-058, T-059 task files.

- **Dead ends:** `util.parseArgs` strict mode (messages quote the token;
  one error code for two causes): see the task file and `docs/journal.md`
  2026-11-25.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on `16c6ff4`:
  - vitest "Test Files 39 passed (39)", "Tests 2645 passed (2645)";
  - `tools/checks` "Ran 87 tests", OK;
  - lint, format, typecheck, build and both gitleaks scans passed.
