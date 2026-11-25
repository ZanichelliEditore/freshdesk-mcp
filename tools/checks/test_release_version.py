"""Tests for the release tag check (stdlib unittest): run as the workflow runs it."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parent / "release_version.py"


def run(tag: str, version: str | None) -> subprocess.CompletedProcess[str]:
    """Run the script on `tag` against a package.json holding `version`."""
    with tempfile.TemporaryDirectory() as tmp:
        manifest = Path(tmp) / "package.json"
        data = {"name": "@scope/pkg"} if version is None else {"version": version}
        manifest.write_text(json.dumps(data), encoding="utf-8")
        return subprocess.run(
            [sys.executable, str(_SCRIPT), tag, str(manifest)],
            capture_output=True,
            text=True,
            check=False,
        )


class ReleaseVersion(unittest.TestCase):
    def test_matching_tag_passes(self) -> None:
        result = run("v0.1.0", "0.1.0")
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_mismatched_version_fails(self) -> None:
        result = run("v0.1.1", "0.1.0")
        self.assertEqual(result.returncode, 1)
        self.assertIn("v0.1.1", result.stderr)
        self.assertIn("0.1.0", result.stderr)

    def test_tag_without_v_fails(self) -> None:
        self.assertEqual(run("0.1.0", "0.1.0").returncode, 1)

    def test_tag_with_suffix_fails(self) -> None:
        self.assertEqual(run("v0.1.0-rc", "0.1.0").returncode, 1)

    def test_missing_version_fails(self) -> None:
        self.assertEqual(run("v0.1.0", None).returncode, 1)

    def test_wrong_arguments_fail(self) -> None:
        result = subprocess.run(
            [sys.executable, str(_SCRIPT)], capture_output=True, text=True, check=False
        )
        self.assertEqual(result.returncode, 2)


if __name__ == "__main__":
    unittest.main()
