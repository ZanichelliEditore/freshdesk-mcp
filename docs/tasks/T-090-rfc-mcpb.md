# T-090 — RFC: `.mcpb` packaging, tooling, signing and the internal bundle

- **Type:** plan
- **Phase:** M4
- **Status:** done (2026-11-27)
- **Depends on:** none (may run while T-087 is open)
- **Created:** 2026-11-26

## Goal
The decision AGENTS.md rule 3 asks for before the first packaging code:
an RFC on how the server becomes a `.mcpb` for Claude Desktop (tool,
manifest and `user_config` mapping, signing, where it is built and
released, the internal bundle with the team config baked in), Active by
the owner's word.

## In scope
- OD-35 to OD-42 (PLAN, M4): each answered with the alternatives
  rejected and why; the planner's proposals are the starting point, not
  the answer.
- The `user_config` mapping: `FRESHDESK_DOMAIN`, `FRESHDESK_API_KEY`
  (`sensitive`), the team file (`FRESHDESK_MCP_CONFIG`), the export
  directory by `FRESHDESK_EXPORT_DIR`, not `args` (PLAN M4, "Found while
  planning": an empty `--export-dir` stops the start,
  `src/config.ts:180`).
- T-091's findings, if done; else OD-42 and the unset-`user_config`
  question stated open, with T-092 and T-093 waiting on T-091.
- OD-34 restated: no tag, release or distributed bundle before T-087 is
  `done`; a bundle whose team config enables `send` stays under OD-40.
- The internal bundle (SPEC §10): the team config baked in never enters
  a tracked file or a public CI run (AGENTS.md rule 2).
- `rfc-reviewer` full round on the draft, at most one scoped round
  (AGENTS.md rule 9); the owner accepts or rejects.
- At acceptance: one dated "extended by" line in
  `2026-11-25-release-on-npm`; SPEC §10, §11 and §12 lines worded per the
  answers; `make rfc-sync`; the `proposed` rows T-092 to T-099 re-checked
  against the answers and listed for a `/decompose M4` amendment (this
  task does not size them: decompose step 6).

## Out of scope
- Any code, manifest or workflow.
- Installing anything: T-091 is the owner's install spike.
- Sizing T-092 to T-099 (a `/decompose M4` amendment).

## Spec sections to read
- SPEC.md §10
- SPEC.md §11
- SPEC.md §12

## Files expected to change
- `docs/rfc/proposed/<date>-mcpb-bundle.md` (new) → `docs/rfc/active/`
- `docs/rfc/active/2026-11-25-release-on-npm.md` (one dated line)
- `SPEC.md` §10, §11, §12 (at acceptance only)
- `docs/tasks/PLAN.md` (OD-35 to OD-42 answers, at acceptance)

## Wireframes
`none`

## Acceptance
A new RFC is in `docs/rfc/active/` after `make rfc-sync`, Status Active
by the owner's word (no word in session: stop at Proposed, no code); it
answers OD-35 to OD-42 with the alternatives rejected, the `user_config`
mapping (domain, key `sensitive`, team file, export directory by env,
not `args`) and T-091's findings if done (else OD-42 stated open, T-092
waiting on T-091); one dated "extended by" line in
`2026-11-25-release-on-npm`; `rfc-reviewer` findings resolved (AGENTS.md
rule 9); at acceptance the `proposed` rows T-092 to T-099 re-checked and
handed to a `/decompose M4` amendment to size; `make quality` green.

Split point: the draft and the full `rfc-reviewer` round first, stopping
at Proposed; the owner's answers, the scoped round and the acceptance
commit second (as T-079).

---
*Filled at `/handoff`:*

## Done
- RFC `docs/rfc/active/2026-11-27-mcpb-bundle.md`, Active (owner,
  2026-11-27): `af25520` (draft, rfc-reviewer rounds, owner's answers,
  acceptance), `024c47b` (handoff full-round fixes), then the handoff
  commit (scoped-round text fixes).
- OD-35 to OD-42 answered one at a time by the owner (2026-11-27):
  OD-35 (a), OD-36 (a), OD-37 (a) refined, OD-38 (a), OD-39 (c),
  OD-40 (c), OD-41 DPO already obtained 2026-11-23 covering all three
  toolsets, OD-42 (a). PLAN OD table filled; M4 paragraphs dated.
- `user_config` by env, never `args` (decision 1); T-091's findings used
  (Context, decisions 1, 3, 11).
- "Extended by" line in `docs/rfc/active/2026-11-25-release-on-npm.md`.
- SPEC §10, §11, §12 worded per the answers.
- T-092 to T-099 re-checked: the RFC's Consequences list one line per
  row, for a `/decompose M4` amendment (not sized here).
- `rfc-reviewer`: full round and scoped round on the draft, before the
  owner's answers; parked items in `docs/improvements.md`.
- `make quality` exit 0: Vitest "Test Files 58 passed (58)", "Tests
  4824 passed (4824)"; `tools/checks` "Ran 138 tests", OK.

## Dead ends
none

## Open doubts
- Guarding the CI build itself against a compromised dependency (RFC
  decision 5): the hash checks give transit integrity only. Options for
  T-094, owner's call: `npm ci --ignore-scripts` in `quality`,
  `gitleaks`, `build`; the pack job starting from `build`'s tarball;
  attach comparing the bundle's server files with the tarball.
  (security-reviewer, handoff scoped round, 2026-11-27)
- OD-39 and OD-40 were answered after `rfc-reviewer`'s two rounds, so
  `rfc-reviewer` never saw "config only on the maintainer's machine" or
  "`send` for operators"; the handoff's code- and security-reviewer did.
  The owner chose Active without a third round (2026-11-27).
- Carried from T-091: where Desktop stores the `sensitive` key (recheck
  in T-092, gates T-097 and T-099); `${__dirname}` expansion (T-095).

## Context pressure
ok

## Next action
none (done)
