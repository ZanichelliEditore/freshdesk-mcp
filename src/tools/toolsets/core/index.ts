// The `core` toolset (SPEC §8.2): read tools, in the order they are listed.

import type { Tool } from "../index.js";
import { getTicketTool } from "./get-ticket.js";
import { getTicketSchema } from "./get-ticket-schema.js";
import { listAgentsTool } from "./list-agents.js";
import { listGroupsTool } from "./list-groups.js";
import { listTicketsTool } from "./list-tickets.js";
import { searchTicketsTool } from "./search-tickets.js";

export const CORE_TOOLS: readonly Tool[] = Object.freeze([
  getTicketSchema,
  listAgentsTool,
  listGroupsTool,
  getTicketTool,
  listTicketsTool,
  searchTicketsTool,
]);
