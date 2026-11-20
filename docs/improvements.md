# Improvements backlog

Deferred ideas and known gaps — things not yet decided (so not an RFC) and not
current state (so not `architecture/`). Keep entries concrete; promote anything
that needs a real decision into an RFC in `docs/rfc/proposed/`.

**Start each entry with the short commit you're at (`git rev-parse --short HEAD`) and today's date, separated by ` · `, in square brackets**, so every idea is anchored to both the code it refers to and when it was raised.

`make improvement TEXT="<idea>"` appends a correctly-stamped entry here.

## Known gaps

- [a1b2c3d · YYYY-MM-DD] _Add the first gap or deferred idea here._
- [3ec2fde · 2026-11-20] M1 decompose: give §7.4 untrusted-content wrapping its own row, covering free-text custom fields as well as subject/body (security-reviewer on M0 plan, docs/tasks/T-010-schema-output.md)
- [3ec2fde · 2026-11-20] quality.yml runs 'npm ci || npm install', which hides a lockfile out of sync with package.json; use plain 'npm ci' (.github/workflows/quality.yml, planner on M0)
- [6850f30 · 2026-11-20] M0 plan scoped review parks: T-003 say whether the error fallback is one of the seven codes (docs/tasks/T-003-ts-toolchain-errors.md); pin the error code for a refused redirect so reads don't retry it (T-006)
- [6850f30 · 2026-11-20] M0 plan scoped review parks: T-005 cap the Retry-After wait (docs/tasks/T-005-rate-limiter.md); T-004 test that a team config carrying the host override is refused, and pin whether FRESHDESK_DOMAIN is a subdomain or a full hostname
- [6850f30 · 2026-11-20] M0 plan scoped review parks: T-002 say where the MockAgent evidence check installs undici and how it is pinned (docs/tasks/T-002-rfc-runtime-stack.md); T-007 add DELETE and an attempt count for read-on-network-error; T-001 check 'git check-ignore' on the patterns file; T-001 private branch pushes real values to a private remote before any scrub (owner decision, AGENTS.md rule 2)
