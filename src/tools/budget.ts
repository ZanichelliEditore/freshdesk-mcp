// Cost estimate and per-call budget (SPEC §7.2, last bullet): an operation
// that needs many calls (`count_tickets`, `export_tickets`) estimates them
// first and is refused beyond the team's budget unless `confirm: true`.
//
//   - `estimateCalls`: the `probe` requests sent before the pages (such as
//     search page 1, which tells the total), one page per `pageSize` tickets,
//     plus one conversations call per ticket when the threads are asked for
//     (2,000 tickets at 100 a page with conversations: 20 + 2,000 = 2,020). A
//     thread over one page costs more than estimated
//     (docs/architecture/ticket-queries.md, `export_tickets`).
//   - What it covers: a path whose ticket count is known before its pages
//     (search, `total` ≤ 300). A list scan's count is not known up front: its
//     cost is not estimated but bounded while it runs, and its caller
//     (T-036, T-037) must stop the scan at the budget.
//   - `checkBudget`, before the operation's pages, in this order:
//       1. below the limiter's reserve: the limiter's own `rate_limited`
//          refusal, whatever `confirm` says, since `confirm` never overrides
//          the limiter (read through `http.reserveRefusal()`, no token taken);
//       2. an estimate that is not a whole number, 0 or more (NaN, negative,
//          infinite, fractional, or not a number at all through a cast): a
//          `validation` error, whatever `confirm` says (fails closed);
//       3. an estimate over `limits.call_budget` without `confirm: true`: a
//          `validation` error naming the estimate and the budget. An estimate
//          at exactly the budget passes.
//     It sends nothing. A pass is not a reservation: each request still goes
//     through the limiter, which can refuse it later in the run.

import type { FreshdeskError } from "../client/errors.js";
import type { AppContext } from "./context.js";

export interface CallEstimate {
  /** Tickets the operation reads: a whole number, 0 or more. */
  tickets: number;
  /** Tickets per page of the endpoint it pages: a whole number, 1 or more. */
  pageSize: number;
  /** One more call per ticket, for its conversations. */
  conversations: boolean;
  /** Requests sent before the pages (a search page-1 probe): 0 when absent. */
  probe?: number;
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

/** Calls an operation over `tickets` tickets needs. Throws `RangeError` on a bad count. */
export function estimateCalls({
  tickets,
  pageSize,
  conversations,
  probe = 0,
}: CallEstimate): number {
  if (!isCount(tickets)) throw new RangeError("tickets must be a whole number, 0 or more");
  if (!isCount(pageSize) || pageSize === 0) {
    throw new RangeError("pageSize must be a whole number, 1 or more");
  }
  if (!isCount(probe)) throw new RangeError("probe must be a whole number, 0 or more");
  return probe + Math.ceil(tickets / pageSize) + (conversations ? tickets : 0);
}

/** The refusal for an operation estimated at `estimate` calls, or `undefined` when it may run. */
export function checkBudget(
  context: Pick<AppContext, "http" | "team">,
  estimate: number,
  confirm: boolean | undefined,
): FreshdeskError | undefined {
  const reserve = context.http.reserveRefusal();
  if (reserve !== undefined) return reserve;
  if (!isCount(estimate)) {
    return {
      code: "validation",
      http_status: null,
      message: "The call's cost estimate is not a whole number of API calls, so it is refused.",
      retryable: false,
    };
  }
  const budget = context.team.limits.call_budget;
  if (estimate <= budget || confirm === true) return undefined;
  return {
    code: "validation",
    http_status: null,
    message: `This call needs an estimated ${estimate} API calls, over the per-call budget of ${budget} (limits.call_budget). Narrow it, or call again with confirm: true.`,
    retryable: false,
  };
}
