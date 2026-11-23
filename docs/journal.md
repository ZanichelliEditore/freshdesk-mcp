# Journal

Append-only, dated. Learnings too small for an RFC. Newest at the bottom.

Use absolute dates only: a heading per day (`## YYYY-MM-DD`), and never
"today", "yesterday", "last session" or "next week" without the date it
stands for. End an entry with the task id it came from.

## YYYY-MM-DD
- <what was learned, and the observation that proves it>. (T-NNN)

## 2026-11-20
- A plan session's task file is `docs/tasks/PLAN.md`; `compliance-reviewer` reports "section missing" unless it has a `## Wireframes` section whose body is exactly `` `none` `` (a trailing explanation also fails). PLAN.md now carries one. Because `/handoff` puts the task file *at base* in the diff file, the first review of the session that added it had to show PLAN.md at HEAD instead (ranges 1dd03b1..3ec2fde, 3ec2fde..c414802). (M0 plan)
- A "prints nothing" grep is a fail-open check: an empty or missing patterns file, or a bad regex, also prints nothing. Acceptance lines built on grep need a positive control and an exact exit status (1 = no match). (M0 plan, T-001)
- `gitleaks/gitleaks-action` refuses to run on an organisation's repo without a `GITLEAKS_LICENSE` secret; the gitleaks CLI through the existing `gitleaks-history` pre-commit hook needs none and scans every commit. That hook must keep `always_run: true`: in CI nothing is staged, and without it pre-commit reports "Skipped" and exits 0. (T-001)
- An unpinned `pipx install ruff` in CI drifted to 0.17.6 and failed rules the pre-commit pin (0.15.17) does not run: every CI tool install needs the same pin as pre-commit. (T-001)

## 2026-11-23
- undici `MockAgent` set with `setGlobalDispatcher` intercepts Node's bundled `fetch` too (Node 20.19–24.22, bundled undici 6.21–7.30, installed 7.30/8.13), through a process-global symbol shared across copies; so interception silently depends on the Node release. Passing `dispatcher` explicitly avoids it. (T-002)
- `undici@8` declares `node >=22.19.0` and crashes at load on Node 20; `vitest@5` needs `^22.12`. A package's `engines` can force a SPEC-level runtime decision: check them before pinning majors. (T-002)
- `no-restricted-globals: fetch` does not catch `globalThis.fetch`; name-based `no-restricted-syntax` bans are dodged by renamed imports. Ban by import path (`no-restricted-imports`) when the goal is "this module never reaches X". (T-002)
- In this harness, `nvm alias default` does not change `node` in the session's own shell (PATH inherited); verify with a clean login shell (`env -i ... bash -ic`). (T-002)
