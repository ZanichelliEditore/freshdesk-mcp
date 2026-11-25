# T-048 — RFC: release on npm

- **Type:** plan
- **Phase:** M1
- **Status:** done (2026-11-25)
- **Depends on:** none
- **Created:** 2026-11-23

## Goal
The RFC the runtime-stack RFC leaves to release tooling
(`docs/rfc/active/2026-11-23-adopt-runtime-stack.md:126-128`): it records
the owner's release decisions and decides how a publish is authorised.

## In scope
- Recorded (owner, 2026-11-23): public npm, `@zanichelli/freshdesk-mcp`,
  published from CI on a version tag with provenance, 0.x until M4, first
  publish 0.1.0 after T-039 on the owner's go.
- Decided here, the RFC recommends and the owner approves: a GitHub
  Environment with the owner as required reviewer and an environment secret,
  or npm trusted publishing over OIDC with no long-lived token. For each:
  who can trigger a publish, and what a leaked credential allows.
- Also weighed: who can push a `v*` tag (tag protection), and whether npm
  trusted publishing works for a package that does not exist yet (if not,
  0.1.0 may need a token).
- Any tool or action the workflow needs is named with its pin.
- `rfc-reviewer` on the draft. An accepted RFC may amend T-045's acceptance
  line (decompose.md step 6), in the row and the task file.

## Out of scope
- The workflow itself (T-045); the `.mcpb` and its tooling (M4, their own
  RFC).

## Spec sections to read
- SPEC.md §11
- SPEC.md §12

## Files expected to change
- `docs/rfc/proposed/` → `docs/rfc/active/`
- `docs/tasks/PLAN.md` and `docs/tasks/T-045-release-workflow.md`
  (acceptance amendment only)
- `SPEC.md` §11 (the first-release line, on the owner's word with the flip
  to Active)

## Wireframes
`none`

## Acceptance
The RFC is in `docs/rfc/active/` after `make rfc-sync`, Status Active by the
owner's word; it states the five recorded decisions, chooses one
authorisation mechanism with the other weighed and rejected for a stated
reason, and says who can trigger a publish; `rfc-reviewer`'s findings are
resolved or dismissed in the RFC; T-045's acceptance names the chosen
mechanism in both places it is written; `make quality` green.

---
*Filled at `/handoff`:*

## Done
- RFC `docs/rfc/active/2026-11-25-release-on-npm.md`, Status Active by the
  owner's word (2026-11-25): npm trusted publishing over OIDC, bound to the
  GitHub environment `npm` (tags `v*` only), a `v*` tag ruleset deciding who
  may publish, a deprecated `0.0.0` placeholder before the first release
  0.1.0, no npm token. The environment-secret option is weighed and
  rejected in the RFC.
- Commits: `fda62ac` (status doing), `ed35b74` (RFC proposed, T-045
  acceptance amended), `415abb1` (rfc-reviewer fixes), and the commit
  `T-048: RFC active, done` (owner's answers, SPEC §11, rfc-sync).
- `rfc-reviewer` (2026-11-25): decision sound; 1 High, 3 Medium, 2 Low, all
  text, all resolved; each finding with its resolution in the RFC's
  "Review" section.
- Owner (2026-11-25): RFC approved; `LICENSE` copyright holder "Zanichelli
  Editore S.p.A."; a `main` branch ruleset (pull request and `quality`
  green, same bypass list as the tag ruleset) before the first tag. All in
  the RFC, T-045 (task file and PLAN row) and SPEC §11 (first release
  0.1.0 after a deprecated 0.0.0 placeholder).

## Dead ends
- Trusted publishing for a package that does not exist yet: not possible
  (`npm trust` docs, read 2026-11-25); hence the placeholder.

## Open doubts
- The environment, both rulesets and the trusted publisher are settings,
  not code: no test in the repository can prove them; the owner confirms
  them (RFC, owner's steps 0-6).
- `release.yml` copies the quality and gitleaks jobs from `quality.yml`
  (a local reusable workflow cannot carry a SHA), so the two can drift.
- A trusted publisher not used within 2 days of being configured expires:
  steps 4 and 5 of the RFC must happen within that window.

## Context pressure
Low: one RFC, three review fixes, one approval round.

## Next action
none: done.
