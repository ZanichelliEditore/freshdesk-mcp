# PLAN

Ordered task list. One task = one session (SPEC.md
§14.1). Statuses: `proposed | todo | doing | done | dropped`.

- **Every status change carries its date:** `doing (YYYY-MM-DD)`, never a
  bare `doing`. A session can't tell how much time has passed unless the
  documents say.
- A **`proposed`** row has been raised but not yet sized, whoever raised
  it: a `/handoff`, the owner, or an RFC accepted in session. It has no
  task file, and no session may take it until `/decompose` or the owner
  confirms it as `todo`.
- A **`dropped`** row is kept, with one line saying where its work went.
- Only `/decompose` reorders, re-scopes, merges or drops rows, or changes their
  dependencies or acceptance. `/handoff` may change only its own row's
  status and add `proposed` rows, except at the end of a `plan` task,
  where `/decompose`'s authority carries through the handoff.
- The owner reviews every plan before its first task.

**Sizing calibration:** tasks that overflowed: 0 · tasks split after the
fact: 0 · sessions that ran two tasks: 0 · split points set at planning and
taken: 0 · split points set at planning and not needed: 0.

## Setup

| Id | Title | Type | Depends | Acceptance | Status |
|---|---|---|---|---|---|
| T-001 | Connect the remote (GitHub) | build | none | owner and visibility of the GitHub repo chosen (SPEC §12); SPEC holds no real account values before a public push (SPEC §14 rule 2); `main` pushed; first `quality.yml` run **observed** green, URL in HANDOFF (the first run may be red: `gitleaks-action` has no parent for the root commit); Dependabot security updates on | proposed (2026-11-20) |
