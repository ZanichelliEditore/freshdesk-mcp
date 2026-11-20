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
