// The `core` toolset (SPEC §8.2): read tools, in the order they are listed.

import type { Tool } from "../index.js";
import { findSimilarTicketsTool } from "./find-similar-tickets.js";
import { getTicketTool } from "./get-ticket.js";
import { getTicketSchema } from "./get-ticket-schema.js";
import { listAgentsTool } from "./list-agents.js";
import { listGroupsTool } from "./list-groups.js";
import { listTicketsTool } from "./list-tickets.js";
import { getCannedResponseTool, listCannedResponsesTool } from "./canned.js";
import { searchTicketsTool } from "./search-tickets.js";
import { getSolutionArticleTool, listSolutionTreeTool, searchSolutionsTool } from "./solutions.js";
import { triageQueueTool } from "./triage-queue.js";

export const CORE_TOOLS: readonly Tool[] = Object.freeze([
  getTicketSchema,
  listAgentsTool,
  listGroupsTool,
  getTicketTool,
  listTicketsTool,
  searchTicketsTool,
  triageQueueTool,
  findSimilarTicketsTool,
  searchSolutionsTool,
  getSolutionArticleTool,
  listSolutionTreeTool,
  listCannedResponsesTool,
  getCannedResponseTool,
]);
