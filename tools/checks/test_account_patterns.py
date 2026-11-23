"""Tests for the account-patterns commit guard (stdlib unittest).

Every test builds its own temporary repository and patterns file; none reads
the real `docs/private/account-patterns`. All values are synthetic.
"""

import locale
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parent / "account_patterns.py"
_PATTERN = "zq-synth-[0-9]+"
_VALUE = "ZQ-Synth-4711"  # differs in case from the pattern on purpose


def _utf8_locale() -> str | None:
    """The name of a UTF-8 locale installed on this machine, if any."""
    for name in ("C.UTF-8", "en_US.UTF-8"):
        try:
            locale.setlocale(locale.LC_CTYPE, name)
        except locale.Error:
            continue
        locale.setlocale(locale.LC_CTYPE, "C")
        return name
    return None


_UTF8 = _utf8_locale()


def _clean_env() -> dict[str, str]:
    """The environment without git's hook variables.

    Under a hook git exports GIT_DIR and GIT_INDEX_FILE; left in place, the
    temporary repositories below would act on the real one.
    """
    return {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}


class _Repo(unittest.TestCase):
    def setUp(self) -> None:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.env = _clean_env()
        self.git("init", "-q", ".")

    def git(self, *args: str, env: dict[str, str] | None = None) -> None:
        subprocess.run(
            ["git", *args],
            cwd=self.root,
            env=env or self.env,
            check=True,
            capture_output=True,
        )

    def patterns(self, content: bytes | None = _PATTERN.encode() + b"\n") -> None:
        if content is not None:
            path = self.root / "docs" / "private" / "account-patterns"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)

    def stage(self, name: str, content: bytes) -> None:
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        self.git("add", "--", name)

    def run_guard(
        self, cwd: Path | None = None, env: dict[str, str] | None = None
    ) -> tuple[int, str]:
        done = subprocess.run(
            [sys.executable, str(_SCRIPT)],
            cwd=cwd or self.root,
            env=env or self.env,
            capture_output=True,
            text=True,
            check=False,
        )
        return done.returncode, done.stdout + done.stderr

    def assert_no_leak(self, output: str) -> None:
        lowered = output.lower()
        self.assertNotIn(_VALUE.lower(), lowered)
        self.assertNotIn("zq-synth", lowered)


class Matching(_Repo):
    def test_clean_index_passes_silently(self) -> None:
        self.patterns()
        self.stage("a.txt", b"nothing to see\n")
        self.assertEqual(self.run_guard(), (0, ""))

    def test_match_is_refused_naming_file_and_line(self) -> None:
        self.patterns()
        self.stage("src/a.txt", f"one\ntwo {_VALUE} three\n".encode())
        code, output = self.run_guard()
        self.assertEqual(code, 1)
        self.assertIn("src/a.txt:2", output)
        self.assert_no_leak(output)

    def test_every_matching_file_is_named(self) -> None:
        self.patterns()
        self.stage("a.txt", f"{_VALUE}\n".encode())
        self.stage("b.txt", f"x\ny\n{_VALUE}\n".encode())
        code, output = self.run_guard()
        self.assertEqual(code, 1)
        self.assertIn("a.txt:1", output)
        self.assertIn("b.txt:3", output)

    def test_colon_in_a_path_does_not_break_the_location(self) -> None:
        self.patterns()
        self.stage("a:7:b.txt", f"x\n{_VALUE}\n".encode())
        code, output = self.run_guard()
        self.assertEqual(code, 1)
        self.assertIn("a:7:b.txt:2", output)

    def test_match_in_a_binary_file_is_refused_naming_the_file(self) -> None:
        self.patterns()
        self.stage("blob.dat", b"\x00\x01" + _VALUE.encode() + b"\x00")
        code, output = self.run_guard()
        self.assertEqual(code, 1)
        self.assertIn("blob.dat (binary)", output)
        self.assert_no_leak(output)

    def test_interior_blank_line_does_not_match_everything(self) -> None:
        self.patterns(b"\n" + _PATTERN.encode() + b"\n\n")
        self.stage("a.txt", b"nothing to see\n")
        self.assertEqual(self.run_guard()[0], 0)

    def test_crlf_patterns_file_still_matches(self) -> None:
        self.patterns(b"other\r\n" + _PATTERN.encode() + b"\r\n")
        self.stage("a.txt", f"{_VALUE}\n".encode())
        self.assertEqual(self.run_guard()[0], 1)

    def test_patterns_file_without_a_final_newline_still_matches(self) -> None:
        self.patterns(b"other\n" + _PATTERN.encode())
        self.stage("a.txt", f"{_VALUE}\n".encode())
        self.assertEqual(self.run_guard()[0], 1)

    def test_text_and_binary_matches_are_both_named(self) -> None:
        self.patterns()
        self.stage("a.txt", f"{_VALUE}\n".encode())
        self.stage("blob.dat", b"\x00" + _VALUE.encode())
        code, output = self.run_guard()
        self.assertEqual(code, 1)
        self.assertIn("a.txt:1", output)
        self.assertIn("blob.dat (binary)", output)
        self.assertNotIn("a.txt (binary)", output)


@unittest.skipUnless(_UTF8, "no UTF-8 locale on this machine")
class BothLocales(_Repo):
    """Each case is missed by one locale alone; the guard runs both."""

    def setUp(self) -> None:
        super().setUp()
        self.env["LC_ALL"] = _UTF8

    def test_accented_letter_in_another_case_is_caught(self) -> None:
        # Missed by the C locale: `-i` folds ASCII only there.
        self.patterns("zq-società-[0-9]+\n".encode())
        self.stage("a.txt", "ZQ-SOCIETÀ-1\n".encode())
        code, output = self.run_guard()
        self.assertEqual(code, 1)
        self.assertIn("a.txt:1", output)

    def test_value_beside_a_byte_that_is_not_utf8_is_caught(self) -> None:
        # Missed by a UTF-8 locale: `.` does not match the Latin-1 byte.
        self.patterns(b"zq-synth.[0-9]+\n")
        self.stage("a.txt", b"ZQ-Synth\xe94711\n")
        code, output = self.run_guard()
        self.assertEqual(code, 1)
        self.assertIn("a.txt:1", output)
        self.assertEqual(output.count("a.txt"), 1)


class IndexNotWorkingTree(_Repo):
    def test_staged_content_deleted_from_the_working_tree_is_caught(self) -> None:
        self.patterns()
        self.stage("gone.txt", f"{_VALUE}\n".encode())
        (self.root / "gone.txt").unlink()
        code, output = self.run_guard()
        self.assertEqual(code, 1)
        self.assertIn("gone.txt:1", output)

    def test_staged_content_overwritten_in_the_working_tree_is_caught(self) -> None:
        self.patterns()
        self.stage("a.txt", f"{_VALUE}\n".encode())
        (self.root / "a.txt").write_text("clean now\n")
        code, output = self.run_guard()
        self.assertEqual(code, 1)
        self.assertIn("a.txt:1", output)

    def test_unstaged_match_is_not_this_commit(self) -> None:
        self.patterns()
        self.stage("a.txt", b"clean\n")
        (self.root / "a.txt").write_text(f"{_VALUE}\n")
        (self.root / "untracked.txt").write_text(f"{_VALUE}\n")
        self.assertEqual(self.run_guard()[0], 0)

    def test_whole_index_is_scanned_from_a_subdirectory(self) -> None:
        self.patterns()
        self.stage("top.txt", f"{_VALUE}\n".encode())
        self.stage("sub/clean.txt", b"clean\n")
        code, output = self.run_guard(cwd=self.root / "sub")
        self.assertEqual(code, 1)
        self.assertIn("top.txt:1", output)

    def test_temporary_index_of_commit_a_is_the_one_scanned(self) -> None:
        # `git commit -a` and `git commit <path>` hand the hook a temporary
        # index through GIT_INDEX_FILE; the match lives only there.
        self.patterns()
        self.stage("a.txt", b"clean\n")
        other = {**self.env, "GIT_INDEX_FILE": str(self.root / ".git" / "other-index")}
        (self.root / "b.txt").write_text(f"{_VALUE}\n")
        self.git("add", "--", "b.txt", env=other)
        self.assertEqual(self.run_guard()[0], 0)
        code, output = self.run_guard(env=other)
        self.assertEqual(code, 1)
        self.assertIn("b.txt:1", output)


class CannotCheck(_Repo):
    def assert_refused_with_fix(self, needle: str) -> None:
        # The staged file holds a match, so a guard that went on to scan
        # would leak or answer 1; a clean index must not be what saves it.
        self.stage("a.txt", f"{_VALUE}\n".encode())
        code, output = self.run_guard()
        self.assertEqual(code, 2)
        self.assertIn("docs/private/account-patterns", output)
        self.assertIn(needle, output)
        self.assertIn("Fix:", output)
        self.assert_no_leak(output)

    def test_missing_file(self) -> None:
        self.patterns(None)
        self.assert_refused_with_fix("missing")

    def test_empty_file(self) -> None:
        self.patterns(b"")
        self.assert_refused_with_fix("no pattern")

    def test_blank_only_file(self) -> None:
        self.patterns(b"\n  \n\t\r\n")
        self.assert_refused_with_fix("no pattern")

    def test_invalid_regex_does_not_print_the_pattern(self) -> None:
        self.patterns(b"zq-synth-(unclosed\n")
        self.assert_refused_with_fix("git grep")

    def test_comment_line_is_refused_naming_its_line(self) -> None:
        self.patterns(_PATTERN.encode() + b"\n# zq-synth note\n")
        self.assert_refused_with_fix("line 2")

    def test_trailing_whitespace_is_refused_naming_its_line(self) -> None:
        self.patterns(b"\n" + _PATTERN.encode() + b" \n")
        self.assert_refused_with_fix("line 2")

    def test_whitespace_only_line_beside_a_pattern_is_refused(self) -> None:
        self.patterns(_PATTERN.encode() + b"\n\n  \n")
        self.assert_refused_with_fix("line 3")

    def test_carriage_return_at_the_end_of_the_file_is_refused(self) -> None:
        self.patterns(b"other\r\n" + _PATTERN.encode() + b"\r")
        self.assert_refused_with_fix("line 2")

    def test_lone_carriage_return_line_endings_are_refused(self) -> None:
        self.patterns(b"other\r" + _PATTERN.encode() + b"\r")
        self.assert_refused_with_fix("line 1")

    def test_byte_order_mark_is_refused(self) -> None:
        self.patterns(b"\xef\xbb\xbf" + _PATTERN.encode() + b"\n")
        self.assert_refused_with_fix("line 1")

    def test_unreadable_blob_is_not_a_pass(self) -> None:
        # git grep skips a blob it cannot read and still exits 1.
        self.patterns()
        self.stage("a.txt", f"{_VALUE}\n".encode())
        blob = subprocess.run(
            ["git", "rev-parse", ":a.txt"],
            cwd=self.root,
            env=self.env,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
        (self.root / ".git" / "objects" / blob[:2] / blob[2:]).unlink()
        code, output = self.run_guard()
        self.assertEqual(code, 2)
        self.assertIn("Fix:", output)
        self.assert_no_leak(output)

    def test_patterns_path_that_is_a_directory(self) -> None:
        (self.root / "docs" / "private" / "account-patterns").mkdir(parents=True)
        self.assert_refused_with_fix("missing")

    def test_outside_a_repository(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            code, output = self.run_guard(cwd=Path(tmp))
        self.assertEqual(code, 2)
        self.assertIn("Fix:", output)


if __name__ == "__main__":
    unittest.main()
