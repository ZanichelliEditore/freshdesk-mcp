// The `core` toolset (SPEC §8.2): read tools, in the order they are listed.

import type { Tool } from "../index.js";
import { getTicketSchema } from "./get-ticket-schema.js";

export const CORE_TOOLS: readonly Tool[] = Object.freeze([getTicketSchema]);
