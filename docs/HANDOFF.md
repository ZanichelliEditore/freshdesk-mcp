# HANDOFF

*Rewritten from scratch at every `/handoff`. One page. Point at artifacts
(commits, `path::test`, run URLs); don't narrate. An empty section says
"none".*

- **Written:** `2026-11-26T14:45:52+01:00`
- **Describes commit:** filled by the stamp commit. **CI:** filled by the
  stamp commit.

- **Current task:** T-084 `done (2026-11-26)`: `reply_to_ticket` in
  `src/tools/toolsets/send/reply-to-ticket.ts`, the `send` wiring in
  `src/tools/toolsets/send/index.ts`, built by `src/tools/context.ts` from
  the write path's `sends`; `send` no longer a `ConfigError`. Commits
  `1ef27e0` (build), `4cc147b` (review fixes), then this handoff commit.
  See `docs/tasks/T-084-reply-to-ticket.md` "Done". Started from `b6aa9fb`
  (owner commit after the T-082 stamp `dd95fdd`, `docs/improvements.md`
  only: the `kb_write` proposal; not a mismatch).

- **Next action:** `/pickup` T-085 (`forward_ticket`; depends on T-084,
  `done`). T-076 (owner action) stays first in PLAN order and is not a
  session's to take.

- **Read before anything else:** `docs/tasks/T-085-forward-ticket.md`;
  `src/tools/toolsets/send/reply-to-ticket.ts` (`sendFailed`: the rule for
  a failure after dispatch, `may_have_been_sent`, to reuse) and
  `src/tools/toolsets/send/index.ts` (add the factory); T4 in
  `eslint.tool-imports.json`; the `4cc147b` entry in `docs/improvements.md`
  (drop `retry_after_s` on a spent id's `rate_limited`).

- **Owner, open:** T-076 `todo (2026-11-25)`: the overnight check that no
  time trigger acted on the `mcp-test` tickets, due 2026-11-27. OD-34: no
  npm release accepting `send` (any tag from `1ef27e0` on) until T-087 is
  `done`.

- **Reviews:**
  - Full round, R1 = `1ef27e0`, range `b6aa9fb..1ef27e0`: code-reviewer
    no fail-open; medium: send imported a write module for
    `withoutAddresses` (fixed: moved to `src/tools/format.ts`); low:
    description's ticket check was the second sentence (fixed, first, test
    `startsWith`); low: a 429 or 4xx after dispatch did not say the
    `send_id` is spent (fixed, all dispatched failures `retryable: false`);
    low: network `may_have_been_sent` unit-tested only (fixed, MockAgent
    test); nit: overview blank lines (fixed). security-reviewer: no high or
    medium, no fail-open; low: `rate_limited` after dispatch (fixed, as
    above); info: T4 imports write (fixed); info: residual "always allow"
    risk (stated in the RFC). compliance-reviewer: Wireframes `none`.
  - Scoped round, range `1ef27e0..4cc147b`: code-reviewer no blocker, 3
    parkable; security-reviewer no blocker, 2 parkable; compliance `none`.
    All parked in `docs/improvements.md` (`4cc147b`). The handoff commit's
    one test change (the zero-width case written with
    `String.fromCodePoint`, same string) is not reviewed again.
  - All quotes of base, HEAD, stat and trailer matched in both rounds. The
    full-round code-reviewer made one read-only `git grep` call (it said
    so).

- **Proposed plan changes:** none.

- **Open doubts:**
  - `may_have_been_sent` is a boolean key on the error, the code kept;
    T-085 and T-088 should follow `sendFailed`.
  - A 408 or 409 after dispatch reports "send_id spent", not
    `may_have_been_sent` (OD-27's list), though the RFC says such a 4xx is
    no proof nothing was sent.
  - Carried from T-082: CRLF/CR/LF each one `<br>`; U+2028/U+2029 neither
    refused nor `<br>` (owner, `/rfc`); unknown keys on a send entry
    refused; A1 to A6 and the four CC field names unverified (T-087);
    OD-34's release rule has no acceptance line; the older carried doubts
    (T-040, T-067, T-072 to T-074, T-076, T-077) as in `4efcc70`'s HANDOFF.

- **Dead ends:** none.

- **Known red:** none.

- **Checkpoint:** `make quality` exit 0 on the handoff commit's tree.
  Vitest "Test Files 55 passed (55)", "Tests 4644 passed (4644)";
  `tools/checks` "Ran 138 tests", OK; build and both gitleaks hooks
  passed.
