# Improvements backlog

Deferred ideas and known gaps — things not yet decided (so not an RFC) and not
current state (so not `architecture/`). Keep entries concrete; promote anything
that needs a real decision into an RFC in `docs/rfc/proposed/`.

**Start each entry with the short commit you're at (`git rev-parse --short HEAD`) and today's date, separated by ` · `, in square brackets**, so every idea is anchored to both the code it refers to and when it was raised.

`make improvement TEXT="<idea>"` appends a correctly-stamped entry here.

## Known gaps

- [a1b2c3d · YYYY-MM-DD] _Add the first gap or deferred idea here._
- [3ec2fde · 2026-11-20] M1 decompose: give §7.4 untrusted-content wrapping its own row, covering free-text custom fields as well as subject/body (security-reviewer on M0 plan, docs/tasks/T-010-schema-output.md)
- [3ec2fde · 2026-11-20] (done 2026-11-23, T-003: plain 'npm ci') quality.yml runs 'npm ci || npm install', which hides a lockfile out of sync with package.json; use plain 'npm ci' (.github/workflows/quality.yml, planner on M0)
- [6850f30 · 2026-11-20] M0 plan scoped review parks: T-003 say whether the error fallback is one of the seven codes (docs/tasks/T-003-ts-toolchain-errors.md); pin the error code for a refused redirect so reads don't retry it (T-006)
- [6850f30 · 2026-11-20] M0 plan scoped review parks: T-005 cap the Retry-After wait (docs/tasks/T-005-rate-limiter.md); T-004 test that a team config carrying the host override is refused, and pin whether FRESHDESK_DOMAIN is a subdomain or a full hostname
- [6850f30 · 2026-11-20] M0 plan scoped review parks: T-002 say where the MockAgent evidence check installs undici and how it is pinned (docs/tasks/T-002-rfc-runtime-stack.md); T-007 add DELETE and an attempt count for read-on-network-error; T-001 check 'git check-ignore' on the patterns file; T-001 private branch pushes real values to a private remote before any scrub (owner decision, AGENTS.md rule 2)
- [80c7aae · 2026-11-20] T-001 review parks: ruff pinned in both .github/workflows/quality.yml:33 and .pre-commit-config.yaml:44 with nothing enforcing they match (a tools/checks test could compare them); supply-chain pins are versions/tags, not hashes (quality.yml:33,53, pre-commit revs, actions@vN): consider 'pre-commit autoupdate --freeze' + SHA-pinned actions; CI secret scan is now defined in .pre-commit-config.yaml too, so treat it as security-relevant (CODEOWNERS); 'npm ci || npm install' (quality.yml:23,48) silently falls back past the lockfile (pre-existing; done 2026-11-23, T-003)
- [2fd2230 · 2026-11-23] T-002 handoff review parks: add a 3xx row (retryable:false, one request; foreign and other *.freshdesk.com Location) to the T-003 fallback test and T-006 acceptance (security-reviewer, docs/tasks/T-006-http-core.md); lint against rejectUnauthorized:false in src/** before T-006 builds the Agent (security-reviewer, docs/rfc/active/2026-11-23-adopt-runtime-stack.md)
- [507e702 · 2026-11-23] T-003: no-restricted-imports in test/** does not catch a dynamic import('undici') or import('node:http'); a no-restricted-syntax rule on ImportExpression would close it (eslint.config.mjs:28; T-006's global MockAgent backstop covers undici, not node:http)
- [68acf47 · 2026-11-23] T-003 handoff review parks (security-reviewer): createRequire(...)('node:http') dodges the test import ban like import() does (eslint.config.mjs:45); the env scrub runs only in vitest workers, so vitest.config.ts and any globalSetup must not read FRESHDESK_* and T-004 tests must load the team config from a fixture path only (test/setup.ts:6); T-006 add a test that logging an error carrying errors[] puts none of its strings on stderr (src/client/errors.ts:13)
