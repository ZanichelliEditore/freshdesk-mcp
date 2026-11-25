"""T-045's checks on .github/workflows/release.yml (stdlib unittest, text-level).

No YAML parser (no PyYAML: T-045). The workflow is read as text, comments
dropped first, so a commented-out line counts for nothing. The helpers rely
on the layout release.yml keeps: jobs at two spaces, job keys at four, steps
at six (`      - `).

What text-level reading cannot catch (the RFC's threat model is a mistake,
not a writer on the bypass list, who can tag a commit whose release.yml
drops any check): a ` #` inside a quoted string is taken for a comment; a
publish spelled differently (`npx npm publish`, `npm pub`, a script that
publishes) is not seen as one; a step mixing `--dry-run` with a real
publish is taken for a dry run.
"""

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "release.yml"
QUALITY = ROOT / ".github" / "workflows" / "quality.yml"

PUBLISH_IF = "github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')"
SHA_PIN = re.compile(r"^[\w.-]+/[\w.-]+(/[\w./-]+)?@[0-9a-f]{40}$")
SECRET = re.compile(
    r"\bsecrets\b|github\.token|npm_token|node_auth_token|_authtoken|github_token",
    re.I,
)


def uncommented(text: str) -> str:
    """`text` without comments: whole comment lines and trailing ` # ...`."""
    lines = []
    for line in text.splitlines():
        if line.lstrip().startswith("#"):
            lines.append("")
        else:
            lines.append(re.sub(r"\s+#.*$", "", line))
    return "\n".join(lines) + "\n"


def block(text: str, header: re.Pattern[str], indent: int) -> str:
    """The lines under the first line matching `header`, until the indent drops back."""
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if header.match(line):
            out = []
            for rest in lines[i + 1 :]:
                if rest.strip() and len(rest) - len(rest.lstrip()) <= indent:
                    break
                out.append(rest)
            return "\n".join(out) + "\n"
    return ""


def jobs(text: str) -> dict[str, str]:
    """Job name -> its block, from the uncommented workflow."""
    body = block(uncommented(text), re.compile(r"^jobs:\s*$"), 0)
    names = re.findall(r"^  ([\w-]+):\s*$", body, re.M)
    return {n: block(body, re.compile(rf"^  {re.escape(n)}:\s*$"), 2) for n in names}


def key(job: str, name: str) -> str:
    """A job key's inline value ("" if absent or a block)."""
    match = re.search(rf"^    {name}:[ \t]*(.*)$", job, re.M)
    return match.group(1).strip() if match else ""


def needs(job: str) -> set[str]:
    return {n.strip() for n in key(job, "needs").strip("[]").split(",") if n.strip()}


def steps(job: str) -> list[str]:
    """The job's steps, one text block each, in order."""
    parts = re.split(r"^      - ", job, flags=re.M)
    return parts[1:]


def publish_index(job: str) -> int:
    """Index of the step that runs a real `npm publish` (-1 if none)."""
    for i, step in enumerate(steps(job)):
        if "npm publish" in step and "--dry-run" not in step:
            return i
    return -1


def first_step_with(job: str, needle: str) -> int:
    for i, step in enumerate(steps(job)):
        if needle in step:
            return i
    return -1


def publishing_jobs(text: str) -> list[str]:
    return [name for name, job in jobs(text).items() if publish_index(job) >= 0]


def secret_references(text: str) -> list[str]:
    """Every secret or token reference in the uncommented text."""
    return SECRET.findall(uncommented(text))


def permissions(job: str) -> list[str] | None:
    """A job's permissions as stripped lines, None without a `permissions:` key."""
    match = re.search(r"^    permissions:[ \t]*(.*)$", job, re.M)
    if not match:
        return None
    if match.group(1).strip():
        return [match.group(1).strip()]
    body = block(job, re.compile(r"^    permissions:\s*$"), 4)
    return sorted(line.strip() for line in body.splitlines() if line.strip())


def permission_problems(text: str) -> list[str]:
    """Jobs whose permissions are not the allowed ones (publish: read + id-token)."""
    problems = []
    for name, job in jobs(text).items():
        got = permissions(job)
        if name == "publish":
            if got != ["contents: read", "id-token: write"]:
                problems.append(name)
        elif got not in (None, ["contents: read"]):
            problems.append(name)
    return problems


def normalised(job: str) -> list[str]:
    """A copied job's lines without the copy's own changes: the `@<ref>` of
    `uses:`, `persist-credentials`, and a `with:` left empty by dropping it."""
    lines = [
        re.sub(r"(uses: [^@\s]+)@\S+", r"\1", line)
        for line in job.splitlines()
        if line.strip() and "persist-credentials:" not in line
    ]
    out = []
    for i, line in enumerate(lines):
        if line.strip() == "with:":
            nxt = lines[i + 1] if i + 1 < len(lines) else ""
            indent = len(line) - len(line.lstrip())
            if len(nxt) - len(nxt.lstrip()) <= indent:
                continue
        out.append(line)
    return out


def step_has_if(step: str) -> bool:
    return re.search(r"(?m)^(        )?if:", step) is not None


class Helpers(unittest.TestCase):
    """The helpers on fixtures: what they must and must not count."""

    FIXTURE = (
        "on:\n  push:\n    tags: ['v*']\n"
        "jobs:\n"
        "  publish:\n"
        "    runs-on: ubuntu-latest\n"
        "    steps:\n"
        "      - uses: actions/checkout@v6\n"
        "      # - run: npm publish --provenance --access public\n"
        "      - run: npm ci # npm publish --provenance --access public\n"
    )

    def test_commented_out_publish_is_not_publishing(self) -> None:
        self.assertEqual(publishing_jobs(self.FIXTURE), [])

    def test_uncommented_publish_is_publishing(self) -> None:
        fixture = self.FIXTURE.replace("# - run: npm publish", "- run: npm publish")
        self.assertEqual(publishing_jobs(fixture), ["publish"])

    def test_trailing_comment_is_dropped(self) -> None:
        self.assertEqual(uncommented("a: b # c\n"), "a: b\n")

    def test_tag_pin_is_not_a_sha_pin(self) -> None:
        self.assertIsNone(SHA_PIN.match("actions/checkout@v6"))
        self.assertIsNotNone(SHA_PIN.match("actions/checkout@" + "a" * 40))

    def test_needs_reads_a_flow_list(self) -> None:
        self.assertEqual(needs("    needs: [a, b]\n"), {"a", "b"})

    def test_every_secret_form_is_found(self) -> None:
        for form in (
            "${{ secrets.NPM }}",
            "${{ secrets['NPM'] }}",
            "${{ toJSON(secrets) }}",
            "${{ github.token }}",
            "NPM_TOKEN",
            "npm_token",
            "Node_Auth_Token",
            "//registry.npmjs.org/:_authToken=x",
            "GITHUB_TOKEN",
        ):
            self.assertTrue(secret_references(f"      - run: echo {form}\n"), form)
        self.assertEqual(secret_references("      # run: echo ${{ secrets.X }}\n"), [])

    def test_with_left_empty_is_dropped(self) -> None:
        copy = (
            "      - uses: a/b@"
            + "0" * 40
            + "\n        with:\n          persist-credentials: false\n"
        )
        self.assertEqual(normalised(copy), normalised("      - uses: a/b@v6\n"))


class ReleaseWorkflow(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.raw = WORKFLOW.read_text(encoding="utf-8")
        cls.text = uncommented(cls.raw)
        cls.jobs = jobs(cls.raw)
        cls.publish = cls.jobs.get("publish", "")
        cls.dry_run = cls.jobs.get("dry-run", "")

    def test_one_job_publishes_and_it_is_publish(self) -> None:
        self.assertEqual(publishing_jobs(self.raw), ["publish"])

    def test_triggers_are_v_tags_and_dispatch_without_inputs(self) -> None:
        on = block(self.text, re.compile(r"^on:\s*$"), 0)
        self.assertRegex(on, r"(?m)^  push:\n    tags: \[\"v\*\"\]\n")
        self.assertNotIn("branches", on)
        self.assertRegex(on, r"(?m)^  workflow_dispatch:\s*$")
        self.assertNotIn("inputs", on)

    def test_publish_condition_is_a_v_tag_push_alone(self) -> None:
        self.assertEqual(key(self.publish, "if"), PUBLISH_IF)
        self.assertNotIn("inputs", self.publish)
        self.assertNotIn("workflow_dispatch", self.publish)

    def test_publish_needs_quality_gitleaks_and_build(self) -> None:
        self.assertEqual(needs(self.publish), {"quality", "gitleaks", "build"})
        self.assertEqual(needs(self.jobs["build"]), {"quality", "gitleaks"})

    def test_publish_ships_what_build_packed(self) -> None:
        build = self.jobs["build"]
        order = [
            first_step_with(build, s) for s in ("npm ci", "npm run build", "npm pack")
        ]
        self.assertTrue(all(i >= 0 for i in order) and order == sorted(order), order)
        self.assertIn("actions/upload-artifact@", build)
        self.assertRegex(build, r"(?m)^\s+name: package$")
        download = first_step_with(self.publish, "actions/download-artifact@")
        self.assertGreaterEqual(download, 0)
        self.assertRegex(steps(self.publish)[download], r"(?m)^\s+name: package$")
        self.assertLess(download, publish_index(self.publish))
        publish_step = steps(self.publish)[publish_index(self.publish)]
        self.assertIn("npm publish ./package/*.tgz", publish_step)
        for local in ("npm ci", "npm run build", "npm pack", "npm install", "tsc"):
            self.assertNotIn(local, self.publish)

    def test_version_script_runs_on_the_tag_before_publish(self) -> None:
        check = first_step_with(self.publish, 'release_version.py "$GITHUB_REF_NAME"')
        self.assertGreaterEqual(check, 0)
        self.assertLess(check, publish_index(self.publish))
        self.assertNotIn("continue-on-error", self.publish)

    def test_tagged_commit_must_be_on_main_before_publish(self) -> None:
        check = first_step_with(
            self.publish, 'git merge-base --is-ancestor "$GITHUB_SHA" origin/main'
        )
        self.assertGreaterEqual(check, 0)
        self.assertLess(check, publish_index(self.publish))
        self.assertRegex(steps(self.publish)[0], r"(?m)^\s+fetch-depth: 0$")

    def test_trusted_publishing_with_provenance(self) -> None:
        self.assertEqual(key(self.publish, "environment"), "npm")
        step = steps(self.publish)[publish_index(self.publish)]
        self.assertIn("--provenance", step)
        self.assertIn("--access public", step)
        self.assertIn('node-version: "24.22.3"', self.publish)

    def test_no_job_references_a_token_or_secret(self) -> None:
        self.assertEqual(secret_references(self.raw), [])

    def test_permissions(self) -> None:
        top = block(self.text, re.compile(r"^permissions:\s*$"), 0)
        self.assertEqual(
            [line.strip() for line in top.splitlines() if line.strip()],
            ["contents: read"],
        )
        self.assertEqual(self.text.count("id-token: write"), 1)
        self.assertEqual(permission_problems(self.raw), [])

    def test_wider_job_permissions_are_found(self) -> None:
        build = self.raw.replace(
            "  build:\n    needs: [quality, gitleaks]\n",
            "  build:\n    needs: [quality, gitleaks]\n    permissions: write-all\n",
        )
        self.assertEqual(permission_problems(build), ["build"])
        publish = self.raw.replace(
            "      contents: read\n      id-token: write\n",
            "      contents: write\n      id-token: write\n",
        )
        self.assertEqual(permission_problems(publish), ["publish"])

    def test_checkouts_take_the_triggering_commit(self) -> None:
        for name in ("build", "publish"):
            self.assertNotRegex(self.jobs[name], r"(?m)^\s+ref:", name)

    def test_checks_and_publish_steps_are_unconditional(self) -> None:
        for needle in ("release_version.py", "git merge-base --is-ancestor"):
            index = first_step_with(self.publish, needle)
            self.assertFalse(step_has_if(steps(self.publish)[index]), needle)
        publish = steps(self.publish)[publish_index(self.publish)]
        self.assertFalse(step_has_if(publish))
        self.assertTrue(step_has_if("if: false\n        run: x\n"))
        self.assertTrue(step_has_if("run: x\n        if: false\n"))

    def test_dry_run_publishes_nothing_and_needs_nothing_secret(self) -> None:
        self.assertEqual(
            key(self.dry_run, "if"), "github.event_name == 'workflow_dispatch'"
        )
        self.assertEqual(needs(self.dry_run), {"quality", "gitleaks", "build"})
        publishes = [s for s in steps(self.dry_run) if "npm publish" in s]
        self.assertEqual(len(publishes), 1)
        self.assertIn("--dry-run", publishes[0])
        self.assertNotIn("--provenance", publishes[0])
        self.assertEqual(key(self.dry_run, "environment"), "")
        self.assertEqual(secret_references(self.dry_run), [])
        self.assertIsNone(permissions(self.dry_run))

    def test_every_uses_is_pinned_by_sha(self) -> None:
        uses = re.findall(r"uses:\s*(\S+)", self.text)
        self.assertTrue(uses)
        for ref in uses:
            self.assertRegex(ref, SHA_PIN)

    def test_copied_jobs_equal_quality_yml(self) -> None:
        quality = jobs(QUALITY.read_text(encoding="utf-8"))
        for ours, theirs in (("quality", "quality"), ("gitleaks", "checks")):
            self.assertEqual(
                normalised(self.jobs[ours]), normalised(quality[theirs]), ours
            )


class PackageMetadata(unittest.TestCase):
    def test_package_json(self) -> None:
        pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        self.assertEqual(
            pkg["repository"]["url"],
            "https://github.com/ZanichelliEditore/freshdesk-mcp",
        )
        self.assertEqual(pkg["license"], "MIT")
        self.assertNotIn("private", pkg)
        # A publish from outside Actions then fails: no OIDC token to sign with.
        self.assertIs(pkg["publishConfig"]["provenance"], True)

    def test_license_is_mit_with_the_holder(self) -> None:
        text = (ROOT / "LICENSE").read_text(encoding="utf-8")
        self.assertTrue(text.startswith("MIT License\n"))
        self.assertRegex(text, r"Copyright \(c\) \d{4} Zanichelli Editore S\.p\.A\.\n")
        self.assertIn(
            "Permission is hereby granted, free of charge, to any person obtaining a copy",
            text,
        )
        self.assertIn(
            'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND', text
        )

    def test_readme_states_the_version_policy(self) -> None:
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("**Version policy:** 0.x until milestone M4, then 1.0.0.", readme)

    def test_changelog_started(self) -> None:
        changelog = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
        self.assertRegex(changelog, r"(?m)^## 0\.1\.0")


if __name__ == "__main__":
    unittest.main()
