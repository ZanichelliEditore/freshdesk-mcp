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
- A test that imports a module with a side effect runs that side effect itself: `test/setup.test.ts` importing `test/setup.ts` stayed green with `setupFiles` deleted from `vitest.config.ts`. Keep the function in a side-effect-free module and let the wiring test import only that. (T-003)
- A lint rule nobody breaks is a check that cannot fail. ESLint's `lintText` with a `filePath` tests a flat config's globs and patterns from vitest with no new dependency; filter to the rule ids under test, because snippets trip unrelated rules. (T-003)
- undici's `fetch` rejects with `TypeError("fetch failed")` and puts the real error (`ECONNREFUSED`, `UND_ERR_CONNECT_TIMEOUT`) in `.cause`: an error mapper tested only with a top-level `code` loses it on the real path. (T-003)
- The `rfc-needed` commit hook fires on any new dependency in `package.json` and on any change under `docs/architecture/`, even when an Active RFC already covers it; the answer is the `RFC-Not-Needed: <reason>` trailer naming that RFC, not a new RFC. (T-003)
- Node runs `.ts` files directly from 22.18 but refuses them under `node_modules`, so a package published to npm still has to emit JavaScript. (T-003)
- zod 4: `.default({})` on an object returns `{}` unparsed, so inner defaults are lost; `.prefault({})` feeds the value through the schema. `z.strictObject` reports unknown keys as one `unrecognized_keys` issue with a `keys` array at the parent's path. (T-004)
- gitleaks' `generic-api-key` rule fires on an invented test value assigned to a name containing `KEY` when its entropy is high; a repetitive value (`test-test-test-test`) passes. (T-004)
- An error message that "names the file" quotes an environment value: a secret pasted into the wrong setting comes back in the error. Replacing the secret's text in the final message covers the path and key names in one place. (T-004)
- The rate limiter's below-floor bound is 15 s (`MAX_WAIT_S` in `src/client/rate-limit.ts`): a call waits for the window's end when it is at most 15 s away and is refused with `retry_after_s` beyond that, so a tool call answers well inside an MCP client's timeout. Freshdesk sends no window-end header, so the end is an upper bound: 60 s after the last response seen, or a 429's `Retry-After`. (T-005)
- A test that only asserts "the promise settled without the clock moving" passes on a refusal too: a hand mutation that left the 429 hold in place survived until the test asserted the resolved value. (T-005)
- Correction to the entry above on the 15 s bound: since `4384a89` it covers one `acquire` as a whole (floor, 429 and pacing waits together), and a 429's hold is kept between 1 s and 1 h whatever `Retry-After` says. A bound checked per sleep is not a bound on the call: a loop that re-evaluates after each sleep can sleep again. (T-005)
- A rate limiter that resets to a full budget when a hold ends turns "retry after 0" from the server into "everything may go": the strongest exhaustion signal became the most permissive state. Clamp the hold from below, and never let a later signal shorten one in force. (T-005)
- Responses arrive out of order: a 200 sent before a 429 can be observed after it. State taken from "the latest response seen" needs a rule for which response wins; during a 429 hold this limiter ignores budget headers. (T-005)
- undici's `MockAgent` records every request it is handed when built with `enableCallHistory: true` (`getCallHistory().calls()`: URL, headers, body), intercepted or not: "no request sent" is `calls()` being empty, which a refused request and a blocked one would otherwise both look like. (T-006)
- "The host matches `*.freshdesk.com`" is not "the host is ours": anyone can open an account there, so the per-request check compares with the one configured host and the pattern is only a rule for the configuration. (T-006)
- Mutating each guard by hand found the one check no test held (the user name in a URL, masked by the password check in the same row): one mutation per condition, not per function. (T-006)
- vitest fake timers with undici's `MockAgent`: fake only `setTimeout`, `clearTimeout` and `Date` (`toFake`), and alternate a real `setImmediate` turn with `advanceTimersByTimeAsync`; the mock's replies need real macrotasks, and its `.delay()` uses `setTimeout`, so it follows the fake clock. `AbortSignal.timeout()` does not: a timeout a test must reach is an `AbortController` aborted from `setTimeout`. (T-007)
- A write that is not retried is not yet safe: its error still said `retryable: true`, an invitation to the layer above to send it again. Whoever decides not to repeat a request must also say so in what it returns. (T-007)
- A hand mutation that survives can be an equivalent one only by accident: retrying a limiter refusal sent nothing more and returned the same error, and only a count of `acquire` calls told the two apart. (T-007)
- `git grep -f <file>` on an invalid regex exits 128, not 2, and prints the offending pattern in its `fatal:` line (git 2.53.0): a guard over a file of secrets must treat every exit but 0 and 1 as a failure and never forward git's own output. Without `-n` its match line is `path:<matched text>`, the very text such a guard must not print. (T-012)
- A plan gets the same review a diff gets, and it paid: an acceptance line that named a matcher's semantics but not the matcher let a builder ship a guard that compiles every pattern and matches none. Name the command and its exits in the acceptance. (T-012)
- `git grep` exits 1, the "no match" exit, after skipping a blob it could not read; only its stderr says so (git 2.53.0, loose object removed). A guard that treats 1 as a pass must also require an empty stderr. (T-012)
- No single locale is safe for a `git grep -iE` guard: under `LC_ALL=C` `-i` does not fold `À`/`à`, and under a UTF-8 locale `.` does not match a byte that is not valid UTF-8, so a Latin-1 file hides a value. Both measured; the guard runs both and refuses on either. (T-012)
- git strips a carriage return from a `-f` pattern line only when a line feed follows: a last line ending in a bare CR, or CR-only line endings, leaves a pattern that matches nothing, with exit 1. (T-012)
- A new whole-index guard fired on its first run against a file tracked since T-004: run a guard on the real index before its first commit, not only on synthetic repositories. (T-012)
- A pre-commit hook with no `stages` runs at every installed stage (`default_install_hook_types` here has three); a commit-only hook needs `stages: [pre-commit]`. (T-012)
- `x <= 0` is not the negation of `x > 0`: a `NaN` passes the first as "time left". A guard on a computed remainder is written `!(left > 0)`. (T-013)
- When a wrapper rewrites a field (`requestWithRetry` forces `retryable: false` on a write), a test of that field through the wrapper cannot see the inner function get it wrong: test the inner function directly. (T-013)
- An invented fixture name can still be an account value: the account-patterns hook refused a made-up custom-field name in T-008's first commit. Pick fixture names nothing real would use, and let the hook be the check, not the memory of the real names. (T-008)
- zod 4 does not copy a `__proto__` key from parsed JSON into its output, neither in `z.record` nor in `z.looseObject`: the key is dropped silently, not refused, and the result's prototype stays `Object.prototype` (zod ^4.2, probed in `test/client/resources/ticket-fields.test.ts`). (T-008)
- An async generator's return value is invisible to `for await`: adding one (`paginate`'s `truncated`) breaks no existing caller, and a caller that needs it drives `next()` by hand. (T-009)
- undici's `MockAgent` call history `path` has no query string; `fullUrl` has it. A test asserting `per_page` or `page` must read `fullUrl`. (T-009)
- `Object.freeze` on a `Map` does not stop `set`/`delete`: a deep freeze that walks `Object.values` leaves a map mutable, and `ReadonlyMap` protects only at compile time. (T-010)
- A `Record` lookup with a name from the tenant (`TICKET_KEY[name]`) reaches `Object.prototype` (`constructor`, `toString`); a `Map` or an `Object.hasOwn` guard does not. (T-010)
- A `\u` escape written into a test source can arrive as the literal character, so a Unicode-form test compares two identical strings and cannot fail. Build such strings with `String.fromCharCode` and prove the test with a mutation that drops `normalize`. (T-011)
