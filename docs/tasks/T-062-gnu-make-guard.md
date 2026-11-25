# T-062 — The Makefile asks for GNU Make 4 and says how to get it

- **Type:** build
- **Phase:** M2
- **Status:** todo (2026-11-25)
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

## Dead ends
none

## Open doubts
none

## Context pressure

## Next action
