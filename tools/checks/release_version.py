"""Fail unless a release tag equals `v` + the package.json version (T-045).

Usage: release_version.py TAG [PACKAGE_JSON]   (PACKAGE_JSON defaults to ./package.json)
Exit 0 on a match, 1 on a mismatch, 2 on wrong arguments.
"""

import json
import sys
from pathlib import Path


def main(argv: list[str]) -> int:
    if len(argv) not in (1, 2):
        print(__doc__, file=sys.stderr)
        return 2
    tag = argv[0]
    manifest = Path(argv[1] if len(argv) == 2 else "package.json")
    version = json.loads(manifest.read_text(encoding="utf-8")).get("version")
    if not isinstance(version, str) or tag != f"v{version}":
        print(
            f"tag {tag!r} does not match package.json version {version!r} (want 'v{version}')",
            file=sys.stderr,
        )
        return 1
    print(f"tag {tag} matches package.json version {version}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
