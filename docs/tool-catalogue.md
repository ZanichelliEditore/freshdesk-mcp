# Tool catalogue

One line per planned tool of SPEC §8.2 and §8.3 (T-046). Only the
catalogue is written now (owner, 2026-11-23): the client's interfaces and
implementations for a resource, with their types and tests, land with the
toolset that first uses it (SPEC §4 goal 2, M5+ for the §8.3 toolsets).
A line here is a name and a purpose, not an input design.

- **Status:** `active` is a tool of SPEC §8.2 (`core` built in M1, `write`
  in M2, `send` in M3); `catalogue` is a tool of SPEC §8.3, not built.
- **Resource:** the Freshdesk API v2 section and object the tool wraps, as
  named on <https://developers.freshdesk.com/api/> (read 2026-11-25). The
  exact endpoints are checked again when the toolset is built.
- **Access:** `read` changes nothing, in Freshdesk or on disk, and is the
  only value a tool's `readOnlyHint: true` may follow; `write` creates,
  changes or deletes something in Freshdesk, writes a file, or starts a
  Freshdesk job (an export job included, since it hands out a bulk file of
  personal data).
- Names are English `snake_case`, unique across the whole catalogue: the
  §8.3 toolsets reuse no §8.2 name (agents and groups are listed by
  `core`'s `list_agents` and `list_groups`; `admin_read` adds only their
  detail).

## Active (SPEC §8.2)

| Name | Toolset | Status | Access | Resource | Purpose |
|---|---|---|---|---|---|
| `list_tickets` | `core` | active | read | Tickets | filtered list with cursor, compact rows with labels |
| `search_tickets` | `core` | active | read | Tickets (filter, search) | Freshdesk query language, 300-result cap, no full text |
| `get_ticket` | `core` | active | read | Tickets, Conversations, Contacts, Companies | a ticket with its full thread, labels, requester and optional recent tickets |
| `triage_queue` | `core` | active | read | Tickets (filter, search) | open and pending tickets with urgency signals |
| `find_similar_tickets` | `core` | active | read | Tickets, Conversations | best-effort past cases like one ticket, with a resolution excerpt |
| `get_ticket_schema` | `core` | active | read | Ticket Fields | fields with labels, types, choice tree and team meanings |
| `list_agents` | `core` | active | read | Agents | agent ids, names and work emails |
| `list_groups` | `core` | active | read | Groups | group ids and names |
| `search_solutions` | `core` | active | read | Solutions (articles) | knowledge-base search by term |
| `get_solution_article` | `core` | active | read | Solutions (articles) | one article's title, text and status |
| `list_solution_tree` | `core` | active | read | Solutions (categories, folders, articles) | the knowledge base as a tree |
| `list_canned_responses` | `core` | active | read | Canned Responses (folders, responses) | canned folders and titles |
| `get_canned_response` | `core` | active | read | Canned Responses | one canned response's text |
| `count_tickets` | `core` | active | read | Tickets (filter, search) | counts grouped by up to two closed-type fields over a period |
| `export_tickets` | `core` | active | write | Tickets, Conversations | JSONL or CSV file of a period's tickets in the export directory |
| `update_ticket` | `write` | active | write | Tickets | status, priority, type, group, agent, tags and custom fields by label |
| `categorize_tickets` | `write` | active | write | Tickets | bulk set of category fields, preview then confirm |
| `add_note` | `write` | active | write | Conversations (notes) | private note by default, optional agent notification |
| `hand_off_draft` | `write` | active | write | Conversations (notes), Tickets | draft reply as a private note, assign and notify |
| `reply_to_ticket` | `send` | active | write | Conversations (reply) | public reply to the requester, `confirm` required |
| `forward_ticket` | `send` | active | write | Tickets (forward) | forward outside Freshdesk to allow-listed recipients, `confirm` required |

## Prepared, not active (SPEC §8.3)

| Name | Toolset | Status | Access | Resource | Purpose |
|---|---|---|---|---|---|
| `create_ticket` | `tickets_admin` | catalogue | write | Tickets (create) | create a ticket |
| `delete_ticket` | `tickets_admin` | catalogue | write | Tickets (delete) | move a ticket to trash |
| `restore_ticket` | `tickets_admin` | catalogue | write | Tickets (restore) | restore a deleted ticket |
| `merge_tickets` | `tickets_admin` | catalogue | write | Tickets (merge) | merge secondary tickets into a primary one |
| `bulk_update_tickets` | `tickets_admin` | catalogue | write | Tickets (bulk update job) | start a bulk update job |
| `bulk_delete_tickets` | `tickets_admin` | catalogue | write | Tickets (bulk delete job) | start a bulk delete job |
| `get_job_status` | `tickets_admin` | catalogue | read | Jobs | status of a bulk update or bulk delete job |
| `get_archived_ticket` | `tickets_admin` | catalogue | read | Archive Tickets | an archived ticket with its conversations |
| `list_ticket_watchers` | `tickets_admin` | catalogue | read | Tickets (watchers) | agents watching a ticket |
| `watch_ticket` | `tickets_admin` | catalogue | write | Tickets (watchers) | add a watcher to a ticket |
| `unwatch_ticket` | `tickets_admin` | catalogue | write | Tickets (watchers) | remove a watcher from a ticket |
| `list_time_entries` | `tickets_admin` | catalogue | read | Time Entries | time entries, of the account or of one ticket |
| `create_time_entry` | `tickets_admin` | catalogue | write | Time Entries | log time on a ticket |
| `update_time_entry` | `tickets_admin` | catalogue | write | Time Entries | change a time entry |
| `toggle_time_entry_timer` | `tickets_admin` | catalogue | write | Time Entries | start or stop a time entry's timer |
| `delete_time_entry` | `tickets_admin` | catalogue | write | Time Entries | delete a time entry |
| `list_satisfaction_ratings` | `tickets_admin` | catalogue | read | Surveys (satisfaction ratings) | satisfaction ratings over a period |
| `list_ticket_satisfaction_ratings` | `tickets_admin` | catalogue | read | Tickets (satisfaction ratings) | one ticket's satisfaction ratings |
| `create_satisfaction_rating` | `tickets_admin` | catalogue | write | Tickets (satisfaction ratings) | record a rating on a ticket |
| `get_ticket_summary` | `tickets_admin` | catalogue | read | Tickets (summary) | a ticket's summary |
| `update_ticket_summary` | `tickets_admin` | catalogue | write | Tickets (summary) | write or change a ticket's summary |
| `delete_ticket_summary` | `tickets_admin` | catalogue | write | Tickets (summary) | remove a ticket's summary |
| `list_contacts` | `contacts` | catalogue | read | Contacts | contacts by filter |
| `search_contacts` | `contacts` | catalogue | read | Contacts (filter, search) | contacts by query language |
| `get_contact` | `contacts` | catalogue | read | Contacts | one contact |
| `create_contact` | `contacts` | catalogue | write | Contacts | create a contact |
| `update_contact` | `contacts` | catalogue | write | Contacts | change a contact |
| `delete_contact` | `contacts` | catalogue | write | Contacts (soft delete) | soft-delete a contact |
| `hard_delete_contact` | `contacts` | catalogue | write | Contacts (hard delete) | permanently delete a contact |
| `restore_contact` | `contacts` | catalogue | write | Contacts (restore) | restore a soft-deleted contact |
| `merge_contacts` | `contacts` | catalogue | write | Contacts (merge) | merge secondary contacts into a primary one |
| `make_contact_agent` | `contacts` | catalogue | write | Contacts (make agent) | convert a contact into an agent |
| `export_contacts` | `contacts` | catalogue | write | Contacts (export job) | start a contact export job, or read its status |
| `list_contact_fields` | `contacts` | catalogue | read | Contact Fields | contact fields with labels and choices |
| `get_contact_field` | `contacts` | catalogue | read | Contact Fields | one contact field |
| `create_contact_field` | `contacts` | catalogue | write | Contact Fields | create a contact field |
| `update_contact_field` | `contacts` | catalogue | write | Contact Fields | change a contact field |
| `delete_contact_field` | `contacts` | catalogue | write | Contact Fields | delete a contact field |
| `list_companies` | `companies` | catalogue | read | Companies | companies by filter |
| `search_companies` | `companies` | catalogue | read | Companies (filter, search) | companies by query language |
| `get_company` | `companies` | catalogue | read | Companies | one company |
| `create_company` | `companies` | catalogue | write | Companies | create a company |
| `update_company` | `companies` | catalogue | write | Companies | change a company |
| `delete_company` | `companies` | catalogue | write | Companies | delete a company |
| `export_companies` | `companies` | catalogue | write | Companies (export job) | start a company export job, or read its status |
| `list_company_fields` | `companies` | catalogue | read | Company Fields | company fields with labels and choices |
| `get_company_field` | `companies` | catalogue | read | Company Fields | one company field |
| `create_company_field` | `companies` | catalogue | write | Company Fields | create a company field |
| `update_company_field` | `companies` | catalogue | write | Company Fields | change a company field |
| `delete_company_field` | `companies` | catalogue | write | Company Fields | delete a company field |
| `create_solution_category` | `kb_write` | catalogue | write | Solutions (categories) | create a category |
| `update_solution_category` | `kb_write` | catalogue | write | Solutions (categories) | change a category |
| `translate_solution_category` | `kb_write` | catalogue | write | Solutions (categories, translations) | add or change a category's translation |
| `create_solution_folder` | `kb_write` | catalogue | write | Solutions (folders) | create a folder in a category |
| `update_solution_folder` | `kb_write` | catalogue | write | Solutions (folders) | change a folder |
| `translate_solution_folder` | `kb_write` | catalogue | write | Solutions (folders, translations) | add or change a folder's translation |
| `create_solution_article` | `kb_write` | catalogue | write | Solutions (articles) | create an article as a draft (C9) |
| `update_solution_article` | `kb_write` | catalogue | write | Solutions (articles) | change an article |
| `translate_solution_article` | `kb_write` | catalogue | write | Solutions (articles, translations) | add or change an article's translation |
| `create_canned_response_folder` | `canned_write` | catalogue | write | Canned Responses (folders) | create a canned folder |
| `update_canned_response_folder` | `canned_write` | catalogue | write | Canned Responses (folders) | rename a canned folder |
| `create_canned_response` | `canned_write` | catalogue | write | Canned Responses | create a canned response from C10's suggestion |
| `update_canned_response` | `canned_write` | catalogue | write | Canned Responses | change a canned response |
| `get_agent` | `admin_read` | catalogue | read | Agents | one agent's detail: role, groups, skills, availability |
| `get_group` | `admin_read` | catalogue | read | Groups | one group's detail and members |
| `list_roles` | `admin_read` | catalogue | read | Roles | roles |
| `get_role` | `admin_read` | catalogue | read | Roles | one role |
| `list_skills` | `admin_read` | catalogue | read | Skills | skills |
| `get_skill` | `admin_read` | catalogue | read | Skills | one skill and its conditions |
| `list_sla_policies` | `admin_read` | catalogue | read | SLA Policies | SLA policies and their targets |
| `list_business_hours` | `admin_read` | catalogue | read | Business Hours | business-hour calendars |
| `get_business_hours` | `admin_read` | catalogue | read | Business Hours | one business-hour calendar |
| `list_products` | `admin_read` | catalogue | read | Products | products |
| `get_product` | `admin_read` | catalogue | read | Products | one product |
| `list_email_configs` | `admin_read` | catalogue | read | Email Configs | support email configurations |
| `get_email_config` | `admin_read` | catalogue | read | Email Configs | one email configuration |
| `list_mailboxes` | `admin_read` | catalogue | read | Email Mailboxes | mailboxes |
| `get_mailbox` | `admin_read` | catalogue | read | Email Mailboxes | one mailbox |
| `list_automation_rules` | `admin_read` | catalogue | read | Automations | automation rules of one type |
| `get_automation_rule` | `admin_read` | catalogue | read | Automations | one automation rule |
| `create_agent` | `admin_write` | catalogue | write | Agents | create an agent |
| `update_agent` | `admin_write` | catalogue | write | Agents | change an agent |
| `delete_agent` | `admin_write` | catalogue | write | Agents | downgrade an agent to a contact |
| `create_group` | `admin_write` | catalogue | write | Groups | create a group |
| `update_group` | `admin_write` | catalogue | write | Groups | change a group or its members |
| `delete_group` | `admin_write` | catalogue | write | Groups | delete a group |
| `create_skill` | `admin_write` | catalogue | write | Skills | create a skill |
| `update_skill` | `admin_write` | catalogue | write | Skills | change a skill |
| `delete_skill` | `admin_write` | catalogue | write | Skills | delete a skill |
| `create_sla_policy` | `admin_write` | catalogue | write | SLA Policies | create an SLA policy |
| `update_sla_policy` | `admin_write` | catalogue | write | SLA Policies | change an SLA policy |
| `create_mailbox` | `admin_write` | catalogue | write | Email Mailboxes | create a mailbox |
| `update_mailbox` | `admin_write` | catalogue | write | Email Mailboxes | change a mailbox |
| `delete_mailbox` | `admin_write` | catalogue | write | Email Mailboxes | delete a mailbox |
| `create_automation_rule` | `admin_write` | catalogue | write | Automations | create an automation rule |
| `update_automation_rule` | `admin_write` | catalogue | write | Automations | change an automation rule |
| `delete_automation_rule` | `admin_write` | catalogue | write | Automations | delete an automation rule |

SPEC §9 applies to every row above when its toolset is planned: anything
that may reach people outside Freshdesk follows `send`'s rules, and a bulk
change takes a preview, then `confirm`. Rows that need that judgement
first:

- delete for good or in bulk: `hard_delete_contact`, `bulk_delete_tickets`,
  `delete_agent`;
- change in bulk: `bulk_update_tickets`;
- grant helpdesk access: `make_contact_agent`, `create_agent`,
  `update_agent`;
- may send email outside Freshdesk through its notifications (not checked
  against the API reference): `create_ticket`, `create_agent`,
  `create_automation_rule`.

`admin_write` has no tool for roles, business hours, products and email
configs: the API reference lists no write endpoint for them (read
2026-11-25). `canned_write` and `kb_write` have no delete tool: SPEC §8.3
names create, update and translate only.

## Toolsets without listed tools

SPEC §8.3's last row names no resources ("as Freshdesk exposes them"), so
these toolsets get one line each and their tools are not listed; they are
catalogued when one is planned.

| Toolset | Freshdesk API section it would wrap |
|---|---|
| `discussions` | Discussions: forum categories, forums, topics and comments |
| `surveys` | Surveys: surveys and their satisfaction ratings (the legacy API), and customer-satisfaction surveys and their responses; the satisfaction-rating tools above are `tickets_admin`'s, as SPEC §8.3 places them |
| `threads` | Threads (collaboration): threads and their messages |
