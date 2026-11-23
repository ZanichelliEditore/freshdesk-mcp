"""Refuse a commit whose staged content matches a real account value.

Runs `git grep --cached -n -iE -f docs/private/account-patterns` over the
whole index, from the repository's top level. The patterns file is
gitignored: one POSIX extended regex per line. The matcher is git's own, the
one the history scrub used; it is not reimplemented with Python's `re`, which
is not POSIX ERE. The working tree is never read.

It runs twice, in the caller's locale and in the C locale, and a match in
either refuses. Each alone misses something: the C locale does not fold the
case of an accented letter, and a UTF-8 locale does not let `.` match a byte
that is not valid UTF-8, as in a Latin-1 file.

git grep's exit decides, per run: 0 is a match and refuses the commit (exit 1
here), 1 with nothing on stderr passes (exit 0 when both runs pass), anything
else means the index was not checked (exit 2). git grep exits 1 after
skipping a blob it could not read, so an exit 1 that came with an error is
not a pass.
Its stdout and stderr are never forwarded: stdout carries the matched text,
and on an invalid regex stderr quotes the pattern. This script prints
`file:line` only.

Run by the `account-patterns` commit-stage hook; not part of `make quality`
or CI, which have no patterns file.

Known limits, not handled here:
- `git commit --no-verify` and `SKIP=account-patterns` skip the hook;
- a clone that never ran `make install` has no hook;
- a merge commit runs no commit-stage hook;
- only the contents of regular files are scanned: not paths, not the target
  of a symlink, not commit messages;
- a path is printed as git stores it, control characters included;
- a caller whose own locale is C (no `LANG`, as some GUI clients run git)
  gets the C run twice, so no case folding of accented letters.

git grep takes every line of the patterns file literally: a `#` comment, a
line with spaces around it or a byte-order mark would be a pattern that never
matches what was meant, so such a file is refused, not read around.
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


_GREP = ["git", "grep", "--cached", "-iE", "--no-color", "--no-column", "-z"]


def _bad_line(content: bytes) -> int | None:
    """Return the number of the first line git grep would misread, if any."""
    if content.startswith(b"\xef\xbb\xbf"):
        return 1
    # git drops a carriage return only where a line feed follows it; any
    # other one stays in the pattern.
    for number, line in enumerate(content.replace(b"\r\n", b"\n").split(b"\n"), 1):
        if line != line.strip() or line.startswith(b"#") or b"\r" in line:
            return number
    return None


def _text(path: bytes) -> str:
    return path.decode("utf-8", "backslashreplace")


def _grep(root: Path, env: dict[str, str], flag: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [*_GREP, flag, "-f", PATTERNS],
        cwd=root,
        env=env,
        capture_output=True,
        check=False,
    )


def _locations(
    root: Path, envs: list[dict[str, str]], outputs: list[bytes]
) -> list[str]:
    """Turn git grep's `-z -n` output into `file:line`, plus `file (binary)`.

    The matched text, the third field, is dropped here and never printed. A
    binary match comes as a sentence in the user's language, so it is not
    parsed: one more run per locale lists the matching files, and a file
    with no line is the binary one.
    """
    found: list[str] = []
    with_line: set[bytes] = set()
    for stdout in outputs:
        for record in stdout.split(b"\n"):
            fields = record.split(b"\0")
            if len(fields) == 3:
                with_line.add(fields[0])
                location = f"{_text(fields[0])}:{fields[1].decode('ascii', 'replace')}"
                if location not in found:
                    found.append(location)
    for env in envs:
        for path in _grep(root, env, "-l").stdout.split(b"\0"):
            location = f"{_text(path)} (binary)"
            if path and path not in with_line and location not in found:
                found.append(location)
    return found or ["(git grep did not name the file)"]


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
            "a maintainer puts the file back. Without the account values, do "
            "not create one: see CONTRIBUTING.md, 'The account-patterns hook'.",
        )
    content = patterns.read_bytes()
    if not content.strip():
        return _fail(
            f"{PATTERNS} has no pattern (it is empty or holds blank lines "
            "only), so it would check nothing.",
            "add one POSIX extended regex per line, one for each real account value.",
        )
    bad = _bad_line(content)
    if bad is not None:
        return _fail(
            f"{PATTERNS} line {bad} starts with `#` or a byte-order mark, "
            "has whitespace at its start or end, or holds a carriage return "
            "with no line feed after it. git grep takes the line literally, "
            "so it would never match what was meant.",
            "remove the comment, the mark, the surrounding whitespace or the "
            "stray carriage return; an empty line is fine.",
        )

    # The first environment goes to git untouched: `git commit -a` and `git
    # commit <path>` point GIT_INDEX_FILE at a temporary index, which is the
    # one to scan. The second differs in the locale only.
    envs = [dict(os.environ), {**os.environ, "LC_ALL": "C"}]
    runs = [_grep(root, env, "-n") for env in envs]

    for run in runs:
        if run.returncode not in (0, 1) or (run.returncode == 1 and run.stderr):
            return _fail(
                f"git grep exited {run.returncode} with an error, so the "
                "index was not fully checked. Its output is withheld: it can "
                "quote a pattern.",
                f"the usual cause is a line of {PATTERNS} that is not a valid "
                "POSIX extended regex. To find it without showing a value, "
                "copy one line at a time into a scratch file under "
                "docs/private/ and run `git grep -q -E -f <scratch file> "
                "2>/dev/null`: exit 0 or 1 means the line is valid. If every "
                "line is valid, run `git fsck`: an object or the index may be "
                "damaged.",
            )
    if all(run.returncode == 1 for run in runs):
        return 0

    print(
        f"{_NAME}: staged content matches an account-value pattern:",
        file=sys.stderr,
    )
    for location in _locations(root, envs, [run.stdout for run in runs]):
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
