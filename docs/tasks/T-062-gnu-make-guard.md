# T-062 — The Makefile asks for GNU Make 4 and says how to get it

- **Type:** build
- **Phase:** M2
- **Status:** done (2026-11-25)
- **Depends on:** none
- **Created:** 2026-11-25

## Goal
Run by a make older than 4 (macOS `/usr/bin/make` is GNU Make 3.81), the
Makefile stops at once with a message naming the fix, instead of
`Makefile:56: *** multiple target patterns.  Stop.`; README and
CONTRIBUTING say GNU Make 4+ is required and how to install it. Owner's
choice (2026-11-25); taken from `docs/improvements.md` `5005334` (T-049
review).

## In scope
- A version guard at the top of the `Makefile`, before the first
  target-specific `export override` line, that calls `$(error ...)` when
  the major of `$(MAKE_VERSION)` is under 4. The message names the fix:
  `brew install make` and its `gnubin` directory first in `PATH`, or run
  `gmake`.
- `README.md` "## Development" and `CONTRIBUTING.md` "## Dev loop": GNU
  Make 4+ is required, with the same two ways to get it.
- A unittest in `tools/checks/` (run by `make test`) that runs the real
  `make` on the repository's `Makefile`.

## Out of scope
- Rewriting the `export override` lines to parse under 3.81 (the owner
  chose to require 4+).
- Any other Makefile change.

## Spec sections to read
- none (repo tooling). `docs/improvements.md` entry `5005334`.

## Files expected to change
- `Makefile`
- `tools/checks/test_make_version.py` (new)
- `README.md`, `CONTRIBUTING.md`
- `docs/improvements.md` (entry `5005334`: note the GNU Make part done;
  its other items stay open)

## Wireframes
`none`

## Acceptance
`tools/checks/test_make_version.py` (runs the real `make` on the repo's
`Makefile`, cwd the repo root, with `MAKEFLAGS`, `MFLAGS` and `MAKELEVEL`
removed from its environment; make 4 on CI): `make MAKE_VERSION=<v> help`
for `3.81`, `3.82` and `3.82.90` exits non-zero, prints nothing on stdout,
and stderr names `brew install make`, `gnubin` and `gmake`; for `4.0` and
`4.4.1` it exits 0 and lists `quality` and `smoke-core`, and the guard is
not listed by `help`; the guard sits above the first `export override`
line (the first `$(error` line number is below the first `export override`
line number, now `Makefile:56`). Demonstrated by hand in "Done": `/usr/bin/make help` (3.81, macOS)
prints the guard's message, not "multiple target patterns". `README.md`
and `CONTRIBUTING.md` each name GNU Make 4, `brew install make`, `gnubin`
and `gmake` (asserted in the same test file); `make quality` green.

Notes for the builder (planner, 2026-11-25): reject a major of 3 or lower
(`filter 0 1 2 3` on the first field of `$(MAKE_VERSION)`), not just
`3`; keep `: ... ## ` out of the guard's lines so `help` never shows it;
if the test's own `make` is 3.81 (a mac without `gnubin` first in `PATH`),
the 4.x cases fail with a message naming the requirement, not a skip.
Optional (security-reviewer, 2026-11-25): an empty `MAKE_VERSION` passes a
`filter 0 1 2 3` guard; harmless (GNU make always sets it, and 3.81 still
stops at the parse error), so accepting only a major of 4 or more is the
builder's call.

---
*Filled at `/handoff`:*

## Done
- `37aa821`: guard at `Makefile:3-5` (`$(error ...)` when the major of
  `$(MAKE_VERSION)` is in `0 1 2 3`), above the first `export override`
  (now `Makefile:62`, was 56 before the guard's 6 lines); `README.md`
  "## Development" and `CONTRIBUTING.md` "## Dev loop" name GNU Make 4,
  `brew install make`, `gnubin` and `gmake`.
- `tools/checks/test_make_version.py`: `OldMakeIsStopped::test_versions_under_4_stop_with_the_fix`,
  `NewMakeRuns::test_versions_4_and_up_list_the_targets`,
  `GuardPlacement::test_guard_is_above_the_first_export_override`,
  `DocsNameTheRequirement::test_readme_and_contributing`. Shown failing
  before the change (12 subtest failures; the 4.x case passed already).
- By hand, `/usr/bin/make --version` "GNU Make 3.81":
  - before (`de24a88`): `/usr/bin/make help` printed
    `Makefile:56: *** multiple target patterns.  Stop.`
  - after: `/usr/bin/make help` printed, exit 2:
    `Makefile:4: *** GNU Make 4 or later is required, this is 3.81. On macOS: brew install make, then put its gnubin directory first in PATH, e.g. export PATH="$(brew --prefix make)/libexec/gnubin:$PATH", or run gmake instead of make.  Stop.`
- Builder's call on the optional note: kept `filter 0 1 2 3`, so an
  empty `MAKE_VERSION` passes (GNU make always sets it; a real 3.81 stops
  at the guard anyway, shown above).
- The placement test skips comment lines: the guard's own comment names
  `export override`.
- CI fix (the commit after `2ef129d`): run
  https://github.com/ZanichelliEditore/freshdesk-mcp/actions/runs/45627169277
  failed `quality (22.19)` with `UnicodeDecodeError: 'ascii' codec` (the
  runner's locale is ASCII; `README.md` and the `Makefile` hold non-ASCII
  bytes). The test now reads files and `make`'s output as UTF-8;
  reproduced and fixed with `LC_ALL=C LANG=C PYTHONUTF8=0 python3 -m
  unittest tools/checks/test_make_version.py`.

## Dead ends
none

## Open doubts
none

## Context pressure
low

## Next action
none (done). Next row: T-063.
