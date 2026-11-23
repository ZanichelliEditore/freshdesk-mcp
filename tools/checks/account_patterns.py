"""Refuse a commit whose staged content matches a real account value.

Runs `git grep --cached -n -iE -f docs/private/account-patterns` over the
whole index, from the repository's top level. The patterns file is
gitignored: one POSIX extended regex per line. The matcher is git's own, the
one the history scrub used; it is not reimplemented with Python's `re`, which
is not POSIX ERE. The working tree is never read.

git grep's exit decides: 0 is a match and refuses the commit (exit 1 here),
1 passes (exit 0), anything else means the index was not checked (exit 2).
Its stdout and stderr are never forwarded: stdout carries the matched text,
and on an invalid regex stderr quotes the pattern. This script prints
`file:line` only.

Run by the `account-patterns` commit-stage hook; not part of `make quality`
or CI, which have no patterns file.

Known limits, not handled here:
- `git commit --no-verify` and `SKIP=account-patterns` skip the hook;
- a clone that never ran `make install` has no hook;
- a merge commit runs no commit-stage hook;
- only file contents are scanned, not paths and not commit messages;
- a pattern line with trailing whitespace, or a `#` comment line, is taken
  literally by git grep and silently never matches what was meant.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

PATTERNS = "docs/private/account-patterns"
_NAME = "account-patterns"


def _fail(problem: str, fix: str) -> int:
    print(f"{_NAME}: {problem}\nFix: {fix}", file=sys.stderr)
    return 2


def _locations(stdout: bytes) -> list[str]:
    """Turn git grep's `-z -n` output into `file:line` (or `file (binary)`).

    The matched text, the third field, is dropped here and never printed.
    """
    found: list[str] = []
    for record in stdout.split(b"\n"):
        if not record:
            continue
        fields = record.split(b"\0")
        if len(fields) == 3:
            path, line = fields[0], fields[1].decode("ascii", "replace")
            found.append(f"{path.decode('utf-8', 'backslashreplace')}:{line}")
        elif record.startswith(b"Binary file ") and record.endswith(b" matches"):
            path = record[len(b"Binary file ") : -len(b" matches")]
            found.append(f"{path.decode('utf-8', 'backslashreplace')} (binary)")
        else:
            found.append("(a match git grep reported in a form not recognised)")
    return found


def main() -> int:
    top = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True,
        text=True,
        check=False,
    )
    if top.returncode != 0:
        return _fail(
            "not inside a git working tree, so there is no index to check.",
            "run it from the repository.",
        )
    root = Path(top.stdout.rstrip("\n"))

    patterns = root / PATTERNS
    if not patterns.is_file():
        return _fail(
            f"{PATTERNS} is missing. It is gitignored, so a clone starts "
            "without it, and without it no commit can be checked.",
            "create it with one POSIX extended regex per line, one for each "
            "real account value (see CONTRIBUTING.md).",
        )
    if not patterns.read_bytes().strip():
        return _fail(
            f"{PATTERNS} has no pattern (it is empty or holds blank lines "
            "only), so it would check nothing.",
            "add one POSIX extended regex per line, one for each real account value.",
        )

    # The environment goes to git unchanged apart from the message language:
    # `git commit -a` and `git commit <path>` point GIT_INDEX_FILE at a
    # temporary index, and that is the index to scan.
    grep = subprocess.run(
        [
            "git",
            "grep",
            "--cached",
            "-n",
            "-iE",
            "--no-color",
            "--full-name",
            "-z",
            "-f",
            PATTERNS,
        ],
        cwd=root,
        env={**os.environ, "LC_ALL": "C"},
        capture_output=True,
        check=False,
    )

    if grep.returncode == 1:
        return 0
    if grep.returncode != 0:
        return _fail(
            f"git grep exited {grep.returncode}, so the index was not "
            "checked. Its output is withheld: it can quote a pattern.",
            f"the usual cause is a line of {PATTERNS} that is not a valid "
            "POSIX extended regex; try the lines one at a time with "
            "`git grep -E -e '<line>'`. If every line is valid, run "
            "`git status`: the repository or its index may be damaged.",
        )

    print(
        f"{_NAME}: staged content matches an account-value pattern:",
        file=sys.stderr,
    )
    for location in _locations(grep.stdout):
        print(f"  {location}", file=sys.stderr)
    print(
        "Fix: take the value out of the file and `git add` it again. Real "
        "values live in gitignored files under docs/private/; tracked files "
        "name an account by its slug.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
