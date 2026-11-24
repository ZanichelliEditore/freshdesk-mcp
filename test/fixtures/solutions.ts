// Synthetic solution (knowledge base) bodies in the shape Freshdesk's API v2
// documents: `GET /solutions/categories`, `GET /solutions/categories/{id}/folders`,
// `GET /solutions/folders/{id}/articles`, `GET /solutions/articles/{id}` and
// `GET /search/solutions?term=`. Every name and text is invented. They carry
// keys the module must drop.

function category(id: number, name: string) {
  return {
    id,
    name,
    description: `All about ${name.toLowerCase()}.`,
    visible_in_portals: [77001],
    created_at: "2026-01-02T10:00:00Z",
    updated_at: "2026-01-02T10:00:00Z",
  };
}

function folder(id: number, name: string, visibility = 1) {
  return {
    id,
    name,
    description: `${name} notes.`,
    visibility,
    parent_folder_id: null,
    sub_folders_count: 0,
    articles_count: 2,
    created_at: "2026-01-02T10:00:00Z",
    updated_at: "2026-01-02T10:00:00Z",
  };
}

function article(id: number, title: string, text: string, status = 2) {
  return {
    id,
    type: 1,
    category_id: 3101,
    folder_id: 3201,
    agent_id: 501,
    title,
    description: `<p>${text}</p>`,
    description_text: text,
    status,
    tags: ["widgets"],
    hits: 12,
    thumbs_up: 3,
    thumbs_down: 0,
    seo_data: { meta_title: title },
    created_at: "2026-01-02T10:00:00Z",
    updated_at: "2026-01-03T10:00:00Z",
  };
}

export const categoryPages = [
  [category(3101, "Widget Basics"), category(3102, "Sprocket Care")],
  [category(3103, "Spanner Lore")],
];

export const folderPages = [
  [folder(3201, "Getting Started"), folder(3202, "Squeaks and Rattles", 3)],
  [folder(3203, "Oiling Schedules")],
];

export const articlePages = [
  [
    article(3301, "Fitting a new sprocket", "Line the teeth up first."),
    article(3302, "Quieting a squeak", "A drop of oil, no more.", 1),
  ],
  [article(3303, "Storing spanners", "Keep them dry.")],
];

export const articleView = article(
  3301,
  "Fitting a new sprocket",
  "Line the teeth up first, then turn gently.",
);

/** A `GET /search/solutions` body: an array of articles, with the search extras. */
export const searchHits = [
  {
    ...article(3302, "Quieting a squeak", "A drop of oil, no more."),
    category_name: "Widget Basics",
    folder_name: "Getting Started",
    folder_visibility: 1,
    language_id: 6,
    path: "3302-quieting-a-squeak",
  },
  {
    ...article(3304, "Squeak after oiling", "Wipe off the extra oil."),
    category_name: "Widget Basics",
    folder_name: "Squeaks and Rattles",
    folder_visibility: 3,
    language_id: 6,
    path: "3304-squeak-after-oiling",
  },
];

/** A `GET /solutions/folders/{id}` body. */
export const folderView = folder(3202, "Squeaks and Rattles", 3);

/** An article whose plain text still carries a tag, as an author can leave one. */
export const taggedArticleView = article(
  3305,
  "Oiling a sprocket",
  "Use <b>light</b> oil, then <i>wipe</i> it.",
);
