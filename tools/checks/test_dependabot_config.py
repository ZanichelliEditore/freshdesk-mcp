"""T-052's checks on .github/dependabot.yml (stdlib unittest, text-level).

No YAML parser (no PyYAML: T-045), as test_release_workflow.py. The helpers
rely on the layout dependabot.yml keeps: entries at `  - package-ecosystem:`,
entry keys at four spaces, ignore rules at `      - dependency-name:`, and a
rule's comment on the `#` lines right above it.

What text-level reading cannot catch: a ` #` inside a quoted string is taken
for a comment; a rule written in flow style (`ignore: [{...}]`) is not seen.
Whether Dependabot actually stops proposing the ignored versions is not
testable here: the owner observes the next weekly run.
"""

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / ".github" / "dependabot.yml"

# dependency -> (versions line value, token its comment must name)
RULES = {
    "@types/node": ('[">=23"]', "RFC"),
    "typescript": ('[">=7"]', "typescript-eslint"),
}


def entries(text: str) -> dict[str, list[str]]:
    """Ecosystem -> the entry's lines, comments kept."""
    out: dict[str, list[str]] = {}
    current: list[str] | None = None
    for line in text.splitlines():
        match = re.match(r'^  - package-ecosystem:\s*"?([\w-]+)"?\s*$', line)
        if match:
            current = out.setdefault(match.group(1), [])
        elif current is not None:
            if (
                line.strip()
                and not line.startswith("    ")
                and not line.lstrip().startswith("#")
            ):
                current = None
            else:
                current.append(line)
    return out


def has_ignore(lines: list[str]) -> bool:
    return any(re.match(r"^    ignore:", line) for line in lines)


def ignore_rules(lines: list[str]) -> dict[str, tuple[str, str]]:
    """Dependency -> (its versions value, its comment), from the uncommented ignore block."""
    rules: dict[str, tuple[str, str]] = {}
    inside = False
    comment: list[str] = []
    name = None
    for line in lines:
        if re.match(r"^    ignore:\s*$", line):
            inside, comment = True, []
            continue
        if not inside:
            continue
        if line.strip() and not line.startswith("      "):
            break
        stripped = line.strip()
        if stripped.startswith("#"):
            comment.append(stripped.lstrip("#").strip())
            continue
        match = re.match(r'^      - dependency-name:\s*"?([^"\s]+)"?\s*$', line)
        if match:
            name = match.group(1)
            rules[name] = ("", " ".join(comment))
            comment = []
            continue
        match = re.match(r"^        versions:\s*(.*?)\s*$", line)
        if match and name is not None:
            rules[name] = (match.group(1), rules[name][1])
            continue
        comment = []
    return rules


def problems(text: str) -> list[str]:
    found = []
    config = entries(text)
    if "github-actions" not in config:
        found.append("no github-actions entry")
    elif has_ignore(config["github-actions"]):
        found.append("github-actions entry has an ignore")
    if "npm" not in config:
        return found + ["no npm entry"]
    rules = ignore_rules(config["npm"])
    for dep, (versions, token) in RULES.items():
        if dep not in rules:
            found.append(f"npm ignore has no rule for {dep}")
            continue
        got, comment = rules[dep]
        if got != versions:
            found.append(f"{dep}: versions {got!r}, expected {versions!r}")
        if token not in comment:
            found.append(f"{dep}: comment does not name {token!r}")
    return found


class DependabotConfig(unittest.TestCase):
    def test_config_holds_the_rules(self) -> None:
        self.assertEqual(problems(CONFIG.read_text()), [])


GOOD = """\
version: 2
updates:
  - package-ecosystem: "github-actions"
    directory: "/"
  - package-ecosystem: "npm"
    directory: "/"
    ignore:
      # Lifted by an RFC.
      - dependency-name: "@types/node"
        versions: [">=23"]
      # Lifted by a typescript-eslint release.
      - dependency-name: "typescript"
        versions: [">=7"]
"""


class Fixtures(unittest.TestCase):
    def test_good_fixture_passes(self) -> None:
        self.assertEqual(problems(GOOD), [])

    def test_without_the_rules_fails(self) -> None:
        text = GOOD.split("    ignore:")[0]
        self.assertEqual(
            problems(text),
            [
                "npm ignore has no rule for @types/node",
                "npm ignore has no rule for typescript",
            ],
        )

    def test_commented_out_rule_fails(self) -> None:
        text = GOOD.replace(
            '      - dependency-name: "typescript"',
            '      # - dependency-name: "typescript"',
        )
        self.assertIn("npm ignore has no rule for typescript", problems(text))

    def test_wrong_versions_fail(self) -> None:
        text = GOOD.replace('[">=23"]', '[">=24"]')
        self.assertEqual(
            problems(text),
            ["@types/node: versions '[\">=24\"]', expected '[\">=23\"]'"],
        )

    def test_missing_versions_fails(self) -> None:
        text = GOOD.replace('        versions: [">=7"]\n', "")
        self.assertEqual(
            problems(text), ["typescript: versions '', expected '[\">=7\"]'"]
        )

    def test_comment_without_token_fails(self) -> None:
        self.assertEqual(
            problems(GOOD.replace("Lifted by an RFC.", "Lifted later.")),
            ["@types/node: comment does not name 'RFC'"],
        )
        self.assertEqual(
            problems(GOOD.replace("typescript-eslint release", "eslint release")),
            ["typescript: comment does not name 'typescript-eslint'"],
        )

    def test_comment_of_another_rule_does_not_count(self) -> None:
        text = GOOD.replace(
            "      # Lifted by a typescript-eslint release.\n", ""
        ).replace("Lifted by an RFC.", "Lifted by an RFC; typescript-eslint.")
        self.assertEqual(
            problems(text), ["typescript: comment does not name 'typescript-eslint'"]
        )

    def test_ignore_under_github_actions_fails(self) -> None:
        text = GOOD.replace(
            '    directory: "/"\n  - package-ecosystem: "npm"',
            '    directory: "/"\n    ignore:\n      - dependency-name: "*"\n  - package-ecosystem: "npm"',
        )
        self.assertEqual(problems(text), ["github-actions entry has an ignore"])

    def test_rule_under_github_actions_does_not_count_for_npm(self) -> None:
        npm = '  - package-ecosystem: "npm"\n    directory: "/"\n'
        moved = GOOD.replace(npm, "") + npm
        self.assertEqual(
            problems(moved),
            [
                "github-actions entry has an ignore",
                "npm ignore has no rule for @types/node",
                "npm ignore has no rule for typescript",
            ],
        )


if __name__ == "__main__":
    unittest.main()
