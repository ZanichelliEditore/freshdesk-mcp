# T-052 — Dependabot ignore rules for majors outside the runtime RFC

- **Type:** build
- **Phase:** M1
- **Status:** done (2026-11-25)
- **Depends on:** none
- **Created:** 2026-11-25

## Goal
Dependabot stops proposing the majors the project has decided not to take
yet, so closing PR #3 is final (T-044's recommendation; raised by T-044's
review, 2026-11-23).

## In scope
- `.github/dependabot.yml`, npm entry only: `ignore` for `@types/node`
  `versions: [">=23"]` (RFC 2026-11-23, adopt runtime stack, pins `^22`,
  the types of the minimum supported Node) and for `typescript`
  `versions: [">=7"]` (TypeScript 7 waits for a `typescript-eslint`
  release whose peer range accepts it). Each rule carries a comment naming
  what lifts it. The explicit `versions` form, not
  `update-types: semver-major`, so the file shows which pin each rule holds.
- `tools/checks/test_dependabot_config.py`, standard library, text-level
  (no YAML parser in the standard library), as `test_release_workflow.py`.
- Confirm against GitHub's Dependabot documentation whether `ignore`
  also mutes security updates for those versions; each rule's comment says
  so if it does (both packages are dev-only, the ranges bounded).
- Not testable in the repository: whether Dependabot stops proposing
  them. The owner's observation after the next weekly run (no
  `@types/node` 23 or later, no `typescript` 7 or later proposed) goes in
  HANDOFF, not in the acceptance.
- Check at session start that `typescript-eslint`'s current peer range
  still refuses TypeScript 7 (`npm view typescript-eslint peerDependencies`);
  if it accepts it, stop and ask the owner before writing the
  `typescript` rule.

## Out of scope
- Closing PR #3 or PR #1, or any change to `package.json`: the owner's.
- The github-actions entry.

## Spec sections to read
- SPEC.md §11
- `docs/rfc/active/2026-11-23-adopt-runtime-stack.md` (Decision)

## Files expected to change
- `.github/dependabot.yml`
- `tools/checks/test_dependabot_config.py` (new)

## Wireframes
`none`

## Acceptance
`tools/checks/test_dependabot_config.py` (standard library, text-level, as `test_release_workflow.py`): `.github/dependabot.yml`'s npm entry ignores `@types/node` `versions: [">=23"]` and `typescript` `versions: [">=7"]`, each with a comment naming what lifts it, the test checking the token `RFC` in the first and `typescript-eslint` in the second (an RFC moving the Node types off `^22`; a `typescript-eslint` release whose peer range accepts TypeScript 7); the github-actions entry has no `ignore`; a fixture file without the rules fails the test; `make quality` green. Closing PR #3 stays the owner's.

---
*Filled at `/handoff`:*

## Done
- `88a2a6a` (R1): `.github/dependabot.yml` npm entry ignores `@types/node`
  `versions: [">=23"]` (comment names the RFC) and `typescript`
  `versions: [">=7"]` (comment names `typescript-eslint`); github-actions
  entry unchanged. Test `tools/checks/test_dependabot_config.py`
  (`DependabotConfig::test_config_holds_the_rules`, `Fixtures::*`, 10
  tests); the pre-task file (`dc97e47:.github/dependabot.yml`) gives
  "npm ignore has no rule for @types/node", "... for typescript".
- Review fixes (handoff commit): each rule's comment says it mutes security
  updates too; "each range is bounded" reworded (the ranges are open
  above).
- Session-start check: `typescript-eslint` 8.74.0 peer
  `typescript: '>=4.8.4 <6.1.0'`, refuses TypeScript 7.
- Docs check: GitHub's "Controlling which dependencies are updated by
  Dependabot", section "Ignoring specific dependencies": ignored
  dependencies are skipped "for version updates and security updates"
  (`update-types` alone is documented as version-updates-only). The
  reference page's `ignore` section was not read verbatim.

## Dead ends
none

## Open doubts
- Whether Dependabot actually stops proposing `@types/node` >=23 and
  `typescript` >=7: the owner observes the next weekly run.

## Context pressure
low

## Next action
none (done). Owner: close PR #3.
