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

With `--range <base>..<head>` (`make account-patterns-range`) it checks a
pull request's commits instead of the index, for a maintainer before merge:
the tree of every commit in `git rev-list <base>..<head>`, one `git grep` per
commit and locale, then each commit's message and the paths of its whole
tree. A tree match names the short commit id and `file:line`; a message or
path match names the short commit id and `message` or `path` only. Success
prints the number of commits checked. It refuses a malformed or unresolved
range, a base that is not an ancestor of the head, an empty range, a shallow
repository, and a checkout that reaches a commit of the range or whose
`Makefile` or `tools/` differ from HEAD. That last guard runs inside the code
it protects, so it catches a slip, not an attack; the control is running it
from `main` (CONTRIBUTING.md, "The account-patterns hook"). Author and
committer identities are not scanned.

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
import tempfile
from pathlib import Path

PATTERNS = "docs/private/account-patterns"
_NAME = "account-patterns"


def _fail(problem: str, fix: str) -> int:
    print(f"{_NAME}: {problem}\nFix: {fix}", file=sys.stderr)
    return 2


_GREP = ["git", "grep", "-iE", "--no-color", "--no-column", "-z"]


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


def _grep(
    root: Path, env: dict[str, str], flag: str, target: str = "--cached"
) -> subprocess.CompletedProcess:
    """git grep the index (`--cached`) or a commit's tree (its full id)."""
    return subprocess.run(
        [*_GREP, flag, "-f", PATTERNS, target],
        cwd=root,
        env=env,
        capture_output=True,
        check=False,
    )


def _not_checked(run: subprocess.CompletedProcess) -> bool:
    return run.returncode not in (0, 1) or (run.returncode == 1 and bool(run.stderr))


def _locations(
    root: Path,
    envs: list[dict[str, str]],
    outputs: list[bytes],
    target: str = "--cached",
) -> list[str]:
    """Turn git grep's `-z -n` output into `file:line`, plus `file (binary)`.

    The matched text, the third field, is dropped here and never printed. A
    binary match comes as a sentence in the user's language, so it is not
    parsed: one more run per locale lists the matching files, and a file
    with no line is the binary one. A commit's tree names each file
    `<commit>:<path>`; the prefix is dropped.
    """
    prefix = b"" if target == "--cached" else target.encode() + b":"

    def name(path: bytes) -> bytes:
        return path[len(prefix) :] if path.startswith(prefix) else path

    found: list[str] = []
    with_line: set[bytes] = set()
    for stdout in outputs:
        for record in stdout.split(b"\n"):
            fields = record.split(b"\0")
            if len(fields) == 3:
                path = name(fields[0])
                with_line.add(path)
                location = f"{_text(path)}:{fields[1].decode('ascii', 'replace')}"
                if location not in found:
                    found.append(location)
    for env in envs:
        for path in map(name, _grep(root, env, "-l", target).stdout.split(b"\0")):
            location = f"{_text(path)} (binary)"
            if path and path not in with_line and location not in found:
                found.append(location)
    return found or ["(git grep did not name the file)"]


def _patterns_problem(root: Path) -> int | None:
    """Refuse a missing, empty or misread patterns file (exit 2), else None."""
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
    return None


_NOT_CHECKED_FIX = (
    f"the usual cause is a line of {PATTERNS} that is not a valid "
    "POSIX extended regex. To find it without showing a value, "
    "copy one line at a time into a scratch file under "
    "docs/private/ and run `git grep -q -E -f <scratch file> "
    "2>/dev/null`: exit 0 or 1 means the line is valid. If every "
    "line is valid, run `git fsck`: an object or the index may be "
    "damaged."
)


_RANGE_FIX = (
    "run `make account-patterns-range RANGE=<base>..<head>` from main, with "
    "the pull request fetched as a ref (`git fetch origin "
    "pull/<n>/head:pr-<n>`) and RANGE=$(git merge-base main pr-<n>)..pr-<n>."
)


def _git(root: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=root, capture_output=True, check=False)


def _resolve(root: Path, end: str) -> str | None:
    """The full id of the commit `end` names, or None."""
    if not end or end.startswith("-"):
        return None
    done = _git(
        root,
        "rev-parse",
        "--verify",
        "--quiet",
        "--end-of-options",
        f"{end}^{{commit}}",
    )
    return done.stdout.decode().strip() if done.returncode == 0 else None


def _commits(root: Path, spec: str) -> list[str] | int:
    """Check the range and the checkout; return its commits, oldest first.

    On a refusal, return the exit code after printing why and how to fix it.
    """
    if "..." in spec or spec.count("..") != 1:
        return _fail(
            "RANGE must be exactly <base>..<head>: it is unset or empty, has "
            "no `..`, has `...`, or has more than one `..`.",
            _RANGE_FIX,
        )
    base_name, head_name = spec.split("..")
    base, head = _resolve(root, base_name), _resolve(root, head_name)
    if base is None or head is None:
        return _fail(
            "an end of RANGE is empty, starts with `-`, or does not name a "
            "commit in this repository.",
            "fetch the pull request first; " + _RANGE_FIX,
        )
    if _git(root, "rev-parse", "--is-shallow-repository").stdout.strip() != b"false":
        return _fail(
            "the repository is shallow, so `git rev-list` would stop at the "
            "boundary without saying so.",
            "run `git fetch --unshallow`, then run it again.",
        )
    ancestor = _git(root, "merge-base", "--is-ancestor", base, head)
    if ancestor.returncode != 0:
        return _fail(
            "the base of RANGE is not an ancestor of its head (a reversed or "
            "stale range), so the range would not be the pull request's commits.",
            _RANGE_FIX,
        )
    listed = _git(root, "rev-list", "--reverse", f"{base}..{head}")
    commits = listed.stdout.decode().split()
    if listed.returncode != 0 or not commits:
        return _fail(
            "RANGE holds no commit, and a check of nothing is not a pass.",
            _RANGE_FIX,
        )
    # A commit of the range reachable from HEAD means the checkout holds the
    # pull request's code (a local merge included): the checker itself may
    # be the pull request's.
    unreached = _git(root, "rev-list", "--count", head, f"^{base}", "^HEAD")
    if unreached.returncode != 0 or int(unreached.stdout or 0) != len(commits):
        return _fail(
            "the checkout reaches a commit of RANGE (the pull request is "
            "checked out or merged into it), so this check may be running the "
            "pull request's own code.",
            "check out main as it is on origin, without the pull request; "
            + _RANGE_FIX,
        )
    changed = _git(
        root,
        "status",
        "--porcelain",
        "--untracked-files=all",
        "--",
        "Makefile",
        "tools/",
    )
    if changed.returncode != 0 or changed.stdout:
        return _fail(
            "Makefile or tools/ differ from HEAD (changed, staged or "
            "untracked files), so this check may not be main's code.",
            "commit, stash or remove those changes, then run it again from main.",
        )
    return commits


def _texts_matching(
    root: Path, envs: list[dict[str, str]], texts: dict[str, bytes]
) -> list[str] | int:
    """The names of `texts` that match, both locales; or exit 2.

    git grep cannot read stdin, so each text goes into its own file in a
    private temporary directory, deleted on return, and git grep
    `--no-index` lists the files that match: the same matcher as the trees.
    """
    with tempfile.TemporaryDirectory() as tmp:
        for name, text in texts.items():
            (Path(tmp) / name).write_bytes(text)
        found: set[str] = set()
        for env in envs:
            run = subprocess.run(
                [*_GREP, "--no-index", "-l", "-f", str(root / PATTERNS)],
                cwd=tmp,
                env=env,
                capture_output=True,
                check=False,
            )
            if _not_checked(run):
                return _fail(
                    f"git grep exited {run.returncode} with an error on the "
                    "commit messages and paths, so they were not checked. Its "
                    "output is withheld: it can quote a pattern.",
                    _NOT_CHECKED_FIX,
                )
            found.update(n.decode() for n in run.stdout.split(b"\0") if n)
    return sorted(found)


def _range_main(args: list[str]) -> int:
    top = _git(Path.cwd(), "rev-parse", "--show-toplevel")
    if top.returncode != 0:
        return _fail(
            "not inside a git working tree, so there is no range to check.",
            "run it from the repository.",
        )
    root = Path(top.stdout.decode().rstrip("\n"))
    commits = _commits(root, args[0] if len(args) == 1 else "")
    if isinstance(commits, int):
        return commits
    problem = _patterns_problem(root)
    if problem is not None:
        return problem

    envs = [dict(os.environ), {**os.environ, "LC_ALL": "C"}]
    found: list[str] = []
    texts: dict[str, bytes] = {}
    for commit in commits:
        short = commit[:12]
        runs = [_grep(root, env, "-n", commit) for env in envs]
        if any(_not_checked(run) for run in runs):
            return _fail(
                f"git grep could not read all of commit {short} (exit "
                f"{max(run.returncode for run in runs)}, with an error), so "
                "it was not checked. Its output is withheld: it can quote a "
                "pattern.",
                "fetch the pull request in full (a partial clone may lack a "
                "blob of a fork), then run `git fsck`; else " + _NOT_CHECKED_FIX,
            )
        if any(run.returncode == 0 for run in runs):
            outputs = [run.stdout for run in runs]
            found += [f"{short} {x}" for x in _locations(root, envs, outputs, commit)]
        # The raw object: headers, a blank line, then the message as stored.
        message = _git(root, "cat-file", "commit", commit)
        paths = _git(root, "ls-tree", "-r", "-z", "--name-only", commit)
        if message.returncode != 0 or paths.returncode != 0:
            return _fail(
                f"git could not read the message or tree of commit {short}.",
                "run `git fsck`: an object may be missing or damaged.",
            )
        texts[f"{commit}.message"] = message.stdout.partition(b"\n\n")[2]
        texts[f"{commit}.path"] = paths.stdout.replace(b"\0", b"\n")

    matched = _texts_matching(root, envs, texts)
    if isinstance(matched, int):
        return matched
    matched.sort(key=lambda name: commits.index(name.split(".")[0]))
    found += [f"{name[:12]} {name.split('.')[1]}" for name in matched]
    if not found:
        print(f"commits checked: {len(commits)}")
        return 0
    print(
        f"{_NAME}: commits in the range match an account-value pattern:",
        file=sys.stderr,
    )
    for location in found:
        print(f"  {location}", file=sys.stderr)
    print(
        "Fix: the value is in the pull request's history, not only its last "
        "commit: ask for the commits to be rewritten without it before merge. "
        "Real values live in gitignored files under docs/private/.",
        file=sys.stderr,
    )
    return 1


def main() -> int:
    if sys.argv[1:2] == ["--range"]:
        return _range_main(sys.argv[2:])
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
    problem = _patterns_problem(root)
    if problem is not None:
        return problem

    # The first environment goes to git untouched: `git commit -a` and `git
    # commit <path>` point GIT_INDEX_FILE at a temporary index, which is the
    # one to scan. The second differs in the locale only.
    envs = [dict(os.environ), {**os.environ, "LC_ALL": "C"}]
    runs = [_grep(root, env, "-n") for env in envs]

    for run in runs:
        if _not_checked(run):
            return _fail(
                f"git grep exited {run.returncode} with an error, so the "
                "index was not fully checked. Its output is withheld: it can "
                "quote a pattern.",
                _NOT_CHECKED_FIX,
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
