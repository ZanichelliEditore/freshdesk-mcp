# Contributing

## Dev loop

1. Read `AGENTS.md` — the contract and the four execution principles.
2. For anything architectural or hard to reverse, write an RFC first
   (`docs/rfc/proposed/`, from `docs/rfc/TEMPLATE.md`).
3. Make the change. Keep it surgical.
4. Run the quality gate before committing (see the command surface in `AGENTS.md`).

## The `account-patterns` hook

The `account-patterns` commit hook checks staged content against
`docs/private/account-patterns`, a gitignored list of patterns for real
account values that only maintainers hold; without the file it refuses
every commit. Maintainers keep the file in place. An outside contributor who
was never given the file commits with `SKIP=account-patterns git commit`, that
one hook id only, and does not create a stand-in file: a file with a dummy
line switches the guard off for good. A maintainer or an agent session never
uses `SKIP`: for them a missing file is a stop (`AGENTS.md`, hard rule 3).
Every other hook still runs. A commit made that way was checked by nothing
for account values (CI has no patterns file), so a maintainer reads it for
them before merging.

## Definition of done

- The change traces directly to the task — no drive-by edits.
- It's verified by a test or an explicit check.
- Linters and hooks pass.
