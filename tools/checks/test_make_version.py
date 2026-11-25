"""T-062's checks on the Makefile's GNU Make version guard (stdlib unittest).

Runs the real `make` from PATH on the repository's Makefile, cwd the repo root,
with MAKEFLAGS, MFLAGS and MAKELEVEL removed so an outer `make test` does not
leak its flags in. `MAKE_VERSION=<v>` on the command line stands in for an
older make: the guard reads that variable, so a make 4 can play 3.81.

What this cannot show: that a real make 3.81 stops at the guard rather than at
the first `export override` line. The line-number test keeps the guard above
it, and T-062's "Done" quotes `/usr/bin/make help` (3.81, macOS) by hand.
"""

import os
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MAKEFILE = ROOT / "Makefile"
FIX_WORDS = ("brew install make", "gnubin", "gmake")
DOC_WORDS = ("GNU Make 4", *FIX_WORDS)


def run_make(*args: str) -> subprocess.CompletedProcess[str]:
    env = {
        k: v
        for k, v in os.environ.items()
        if k not in ("MAKEFLAGS", "MFLAGS", "MAKELEVEL")
    }
    return subprocess.run(
        ["make", *args],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )


def make_major() -> int:
    """The major version of the `make` on PATH (0 if unreadable)."""
    first = run_make("--version").stdout.splitlines()[:1]
    match = re.match(r"GNU Make (\d+)\.", first[0]) if first else None
    return int(match.group(1)) if match else 0


class OldMakeIsStopped(unittest.TestCase):
    def test_versions_under_4_stop_with_the_fix(self) -> None:
        for version in ("3.81", "3.82", "3.82.90"):
            with self.subTest(version=version):
                result = run_make(f"MAKE_VERSION={version}", "help")
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout, "")
                for word in FIX_WORDS:
                    self.assertIn(word, result.stderr)


class NewMakeRuns(unittest.TestCase):
    def setUp(self) -> None:
        major = make_major()
        self.assertGreaterEqual(
            major,
            4,
            "the `make` on PATH is not GNU Make 4+: brew install make and put "
            "its gnubin directory first in PATH (README.md, Development)",
        )

    def test_versions_4_and_up_list_the_targets(self) -> None:
        for version in ("4.0", "4.4.1"):
            with self.subTest(version=version):
                result = run_make(f"MAKE_VERSION={version}", "help")
                self.assertEqual(result.returncode, 0, result.stderr)
                names = [
                    line.split()[0]
                    for line in result.stdout.splitlines()
                    if line.strip()
                ]
                self.assertIn("quality", names)
                self.assertIn("smoke-core", names)
                for word in FIX_WORDS:
                    self.assertNotIn(word, result.stdout)


class GuardPlacement(unittest.TestCase):
    def test_guard_is_above_the_first_export_override(self) -> None:
        # Comments left out: the guard's own comment names `export override`.
        lines = [
            "" if line.lstrip().startswith("#") else line
            for line in MAKEFILE.read_text().splitlines()
        ]
        error_at = next((i for i, line in enumerate(lines) if "$(error" in line), None)
        export_at = next(i for i, line in enumerate(lines) if "export override" in line)
        self.assertIsNotNone(error_at, "no $(error guard in the Makefile")
        self.assertLess(error_at, export_at)


class DocsNameTheRequirement(unittest.TestCase):
    def test_readme_and_contributing(self) -> None:
        for name in ("README.md", "CONTRIBUTING.md"):
            text = (ROOT / name).read_text()
            for word in DOC_WORDS:
                with self.subTest(doc=name, word=word):
                    self.assertIn(word, text)


if __name__ == "__main__":
    unittest.main()
