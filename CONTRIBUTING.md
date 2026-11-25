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
for account values (CI has no patterns file), so a maintainer checks it
before merging. Fetch the pull request as a ref and run the check from
`main`, never from the pull request's checkout: its code could change the
checker or read the patterns file.

```bash
git switch main && git pull --ff-only
git fetch origin pull/<n>/head:pr-<n>
make account-patterns-range RANGE="$(git merge-base main pr-<n>)..pr-<n>"
```

It scans the whole tree of every commit in the range, each commit's
message and the paths in its tree (not author or committer names), and
prints only the number of commits checked, or the short id of each commit
with the file and line, `message` or `path` that matched; never the value.
It refuses to run from a checkout that holds a commit of the range or whose
`Makefile` or `tools/` differ from HEAD, but that guard runs inside the code
it protects: running from `main` is the control.

## Definition of done

- The change traces directly to the task — no drive-by edits.
- It's verified by a test or an explicit check.
- Linters and hooks pass.
