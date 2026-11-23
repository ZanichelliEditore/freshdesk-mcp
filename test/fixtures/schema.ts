// A synthetic `GET /api/v2/ticket_fields` body with every field the output
// mapping treats apart, and a raw ticket that sets each of them. Every name,
// label and choice is invented; agents and groups come from agents-groups.ts.

import { ticketFieldsPayload } from "./ticket-fields.js";

export const schemaFieldsPayload = [
  ...ticketFieldsPayload,
  {
    id: 1006,
    name: "source",
    label: "Source",
    type: "default_source",
    default: true,
    choices: { Email: 1, Portal: 2, Phone: 3 },
  },
  { id: 1007, name: "agent", label: "Agent", type: "default_agent", default: true },
  { id: 1008, name: "group", label: "Group", type: "default_group", default: true },
  {
    id: 1009,
    name: "ticket_type",
    label: "Type",
    type: "default_ticket_type",
    default: true,
    choices: ["Question", "Incident"],
  },
  {
    id: 1010,
    name: "cf_shelf",
    label: "Shelf",
    type: "nested_field",
    default: false,
    // A 2-level tree: the same shape as a status's choices, told apart by `type`.
    choices: { North: ["Top", "Bottom"], South: ["Middle"] },
    nested_ticket_fields: [{ name: "cf_tier", label: "Tier", level: 2 }],
  },
  { id: 1013, name: "requester", label: "Requester", type: "default_requester", default: true },
  { id: 1014, name: "company", label: "Company", type: "default_company", default: true },
  { id: 1015, name: "product", label: "Catalogue", type: "default_product", default: true },
  { id: 1011, name: "cf_hobby", label: "Hobby", type: "custom_text", default: false },
  { id: 1012, name: "cf_notes", label: "Notes", type: "custom_paragraph", default: false },
];

export const rawTicket = {
  id: 4242,
  subject: "Sprocket squeaks",
  status: 2,
  priority: 3,
  source: 2,
  responder_id: 502,
  group_id: 703,
  type: "Incident",
  requester_id: 9001,
  company_id: 8001,
  product_id: 7001,
  custom_fields: {
    cf_colour: "Teal",
    cf_kit: "Gadgets",
    cf_family: "Sprockets",
    cf_model: "Blue sprocket",
    cf_shelf: "North",
    cf_tier: "Bottom",
    cf_hobby: "Kite flying",
    cf_notes: null,
  },
};
