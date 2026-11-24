// Synthetic `GET /api/v2/tickets`, `GET /api/v2/tickets/{id}` and
// `GET /api/v2/tickets/{id}/conversations` bodies, in the shape Freshdesk's
// API v2 documents. Every name, address and text is invented; the custom
// field names are those of `ticket-fields.ts`.

function ticket(id: number, subject: string, requesterId: number, colour: string | null) {
  return {
    id,
    subject,
    status: 2,
    priority: 1,
    source: 1,
    type: null,
    requester_id: requesterId,
    responder_id: 501,
    group_id: 701,
    company_id: 9001,
    tags: ["sprocket"],
    fr_escalated: false,
    is_escalated: false,
    due_by: "2026-01-05T10:00:00Z",
    fr_due_by: "2026-01-03T10:00:00Z",
    created_at: "2026-01-02T10:00:00Z",
    updated_at: "2026-01-02T11:00:00Z",
    custom_fields: { cf_colour: colour, cf_kit: "Gadgets" },
  };
}

export const ticketPage = [
  ticket(4101, "Sprocket squeaks at dawn", 8801, "Amber"),
  ticket(4102, "Widget arrived in two halves", 8802, null),
];

/** One ticket as `GET /tickets/{id}` returns it: the description included. */
export const ticketView = {
  ...ticket(4101, "Sprocket squeaks at dawn", 8801, "Amber"),
  description: "<div>It squeaks only before sunrise.</div>",
  description_text: "It squeaks only before sunrise.",
};

function conversation(id: number, text: string, incoming: boolean) {
  return {
    id,
    ticket_id: 4101,
    user_id: incoming ? 8801 : 501,
    body: `<div>${text}</div>`,
    body_text: text,
    incoming,
    private: false,
    source: 0,
    to_emails: [],
    created_at: "2026-01-02T12:00:00Z",
    updated_at: "2026-01-02T12:00:00Z",
  };
}

export const conversationPages = [
  [
    conversation(6201, "Have you tried oiling it?", false),
    conversation(6202, "Oil made it louder.", true),
  ],
  [conversation(6203, "A new sprocket is on its way.", false)],
];
