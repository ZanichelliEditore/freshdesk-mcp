// A synthetic `GET /api/v2/ticket_fields` body, in the shape Freshdesk's API
// v2 documents. Every name, label and choice is invented.

export const nestedChoices = {
  Gadgets: {
    Sprockets: ["Blue sprocket", "Red sprocket"],
    Widgets: ["Small widget"],
  },
  Tools: {
    Spanners: ["Left spanner", "Right spanner"],
  },
};

export const ticketFieldsPayload = [
  {
    id: 1001,
    name: "subject",
    label: "Subject",
    label_for_customers: "Subject",
    description: "Ticket subject",
    position: 1,
    type: "default_subject",
    default: true,
    required_for_closure: false,
    required_for_agents: true,
    customers_can_edit: true,
    displayed_to_customers: true,
    created_at: "2026-01-02T10:00:00Z",
    updated_at: "2026-01-02T10:00:00Z",
  },
  {
    id: 1002,
    name: "status",
    label: "Status",
    label_for_customers: "Status",
    position: 2,
    type: "default_status",
    default: true,
    choices: { "2": ["Open", "Being processed"], "5": ["Closed", "This ticket is closed"] },
  },
  {
    id: 1003,
    name: "priority",
    label: "Priority",
    position: 3,
    type: "default_priority",
    default: true,
    choices: { Low: 1, Medium: 2, High: 3, Urgent: 4 },
  },
  {
    id: 1004,
    name: "cf_colour",
    label: "Colour",
    position: 4,
    type: "custom_dropdown",
    default: false,
    choices: ["Amber", "Teal"],
  },
  {
    id: 1005,
    name: "cf_kit",
    label: "Product",
    position: 5,
    type: "nested_field",
    default: false,
    choices: nestedChoices,
    nested_ticket_fields: [
      { name: "cf_family", label: "Family", label_in_portal: "Family", level: 2 },
      { name: "cf_model", label: "Model", label_in_portal: "Model", level: 3 },
    ],
  },
];

/**
 * The payload with an agent, a group and a product field whose `choices` are
 * a name → id record: the shape OD-4 asks about. Every name and id is
 * invented.
 */
export const ticketFieldsWithEntityChoices = [
  ...ticketFieldsPayload,
  {
    id: 1006,
    name: "responder_id",
    label: "Agent",
    position: 6,
    type: "default_agent",
    default: true,
    choices: { "Quill Pemberton": 70411, "Oriel Vantasse": 70412 },
  },
  {
    id: 1007,
    name: "group_id",
    label: "Group",
    position: 7,
    type: "default_group",
    default: true,
    choices: { "Harbour desk": 70421, "Lantern desk": 70422, "Meadow desk": 70423 },
  },
  {
    id: 1008,
    name: "product",
    label: "Product line",
    position: 8,
    type: "default_product",
    default: true,
    choices: { "Zephyr kit": 70431 },
  },
];
