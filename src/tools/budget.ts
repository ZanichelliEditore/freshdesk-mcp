// Cost estimate and per-call budget (SPEC §7.2, last bullet): an operation
// that needs many calls (`count_tickets`, `export_tickets`) estimates them
// first and is refused beyond the team's budget unless `confirm: true`.
//
//   - `estimateCalls`: one list page per LIST_PAGE_SIZE tickets, plus one
//     conversations call per ticket when the threads are asked for (2,000
//     tickets with conversations: 20 + 2,000 = 2,020). A thread over one page
//     costs more than estimated (docs/architecture/ticket-queries.md,
//     `export_tickets`).
//   - `checkBudget`, before the first request, in this order:
//       1. below the limiter's reserve: the limiter's own `rate_limited`
//          refusal, whatever `confirm` says, since `confirm` never overrides
//          the limiter (read through `http.reserveRefusal()`, no token taken);
//       2. an estimate over `limits.call_budget` without `confirm: true`: a
//          `validation` error naming the estimate and the budget. An estimate
//          at exactly the budget passes. One that is not a number is over it.
//     It sends nothing. A pass is not a reservation: each request still goes
//     through the limiter, which can refuse it later in the run.

import type { FreshdeskError } from "../client/errors.js";
import type { AppContext } from "./context.js";

/** Tickets per list page (`per_page`'s maximum). */
export const LIST_PAGE_SIZE = 100;

export interface CallEstimate {
  /** Tickets the operation reads: a whole number, 0 or more. */
  tickets: number;
  /** One more call per ticket, for its conversations. */
  conversations: boolean;
}

/** Calls an operation over `tickets` tickets needs. Throws `RangeError` on a bad count. */
export function estimateCalls({ tickets, conversations }: CallEstimate): number {
  if (!Number.isSafeInteger(tickets) || tickets < 0) {
    throw new RangeError("tickets must be a whole number, 0 or more");
  }
  return Math.ceil(tickets / LIST_PAGE_SIZE) + (conversations ? tickets : 0);
}

/** The refusal for an operation estimated at `estimate` calls, or `undefined` when it may run. */
export function checkBudget(
  context: Pick<AppContext, "http" | "team">,
  estimate: number,
  confirm: boolean | undefined,
): FreshdeskError | undefined {
  const reserve = context.http.reserveRefusal();
  if (reserve !== undefined) return reserve;
  const budget = context.team.limits.call_budget;
  if (estimate <= budget || confirm === true) return undefined;
  return {
    code: "validation",
    http_status: null,
    message: `This call needs an estimated ${estimate} API calls, over the per-call budget of ${budget} (limits.call_budget). Narrow it, or call again with confirm: true.`,
    retryable: false,
  };
}
