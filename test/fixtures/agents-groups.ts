// Synthetic `GET /api/v2/agents` and `GET /api/v2/groups` pages, in the shape
// Freshdesk's API v2 documents. Every name and address is invented.

function agent(id: number, name: string, email: string) {
  return {
    id,
    available: true,
    occasional: false,
    signature: null,
    ticket_scope: 1,
    group_ids: [],
    created_at: "2026-01-02T10:00:00Z",
    updated_at: "2026-01-02T10:00:00Z",
    contact: {
      active: true,
      email,
      job_title: null,
      language: "en",
      name,
      phone: null,
      time_zone: "UTC",
    },
  };
}

function group(id: number, name: string) {
  return {
    id,
    name,
    description: `${name} desk`,
    escalate_to: null,
    unassigned_for: null,
    agent_ids: [],
    auto_ticket_assign: false,
    created_at: "2026-01-02T10:00:00Z",
    updated_at: "2026-01-02T10:00:00Z",
  };
}

export const agentPages = [
  [
    agent(501, "Quill Ottersby", "quill@example.com"),
    agent(502, "Juniper Vantablack", "juniper@example.com"),
  ],
  [agent(503, "Ferro Lumen", "ferro@example.com")],
];

export const groupPages = [
  [group(701, "Sprocket Desk"), group(702, "Widget Desk")],
  [group(703, "Spanner Desk")],
];
