// Synthetic canned response bodies in the shape Freshdesk's API v2 documents:
// `GET /canned_response_folders`, `GET /canned_response_folders/{id}` and
// `GET /canned_responses/{id}`. Every name and text is invented. They carry
// keys the module must drop.

function folder(id: number, name: string, personal = false) {
  return {
    id,
    name,
    personal,
    responses_count: 2,
    created_at: "2026-01-02T10:00:00Z",
    updated_at: "2026-01-02T10:00:00Z",
  };
}

function response(id: number, title: string, text: string, visibility = 0) {
  return {
    id,
    title,
    folder_id: 3501,
    content: text,
    content_html: `<div dir="ltr">${text}</div>`,
    visibility,
    group_ids: [],
    attachments: [{ id: 3701, name: "sprocket-chart.png", size: 1024 }],
    created_at: "2026-01-02T10:00:00Z",
    updated_at: "2026-01-03T10:00:00Z",
  };
}

export const cannedFolderPages = [
  [folder(3501, "Sprocket Replies"), folder(3502, "My Spanner Notes", true)],
  [folder(3503, "Widget Returns")],
];

/** A `GET /canned_response_folders/{id}` body: the folder and its responses' ids and titles. */
export const cannedFolderView = {
  ...folder(3501, "Sprocket Replies"),
  canned_responses: [
    { id: 3601, title: "Sprocket on its way" },
    { id: 3602, title: "Oil before fitting" },
  ],
};

export const cannedResponseView = response(
  3601,
  "Sprocket on its way",
  "Your new sprocket ships today.\nRegards, {{ticket.agent.name}}",
);
