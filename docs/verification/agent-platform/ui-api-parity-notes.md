# UI / normalized API capability gaps

Scope: source comparison of the existing UI against the approved Task 2 API and
migrations `202610200002_agent_operations.sql` (below: **002**) and
`202610200003_integration_grants.sql` (**003**). Task 5 requires real task editing,
comments, executor assignment and human intervention (`task-5-brief.md:12`); Task 6
requires existing workflows and local-demo parity (`task-6-brief.md:8`). No source,
tests, DB, remote state or Task 4 interfaces were changed/reviewed. Findings below
are static contract evidence; no runtime verification is claimed.

## Task / execution blockers

1. **Human panel cannot distinguish an assigned executor from an active/expired
   lease.** `get_task` returns the tasks row only (002:455), and `list_tasks` uses
   the generic tasks-table reader (002:466, 002:469); neither projects safe claim
   metadata. `task_claims` contains `agent_id`, `claimed_at`, `expires_at` (002:2),
   but all authenticated table access is revoked (002:42, 002:47).
   `executorAgentId` is insufficient: `intervene_task(action: reassign)` sets an
   executor after deleting its lease (002:335), and expiration is evaluated from
   `expires_at` without clearing the task's executor (002:286). Events contain
   IDs/version/status, not claim timestamps (002:411); renewals therefore cannot
   be reconstructed accurately from activity. **Available alternative:** none for
   a human read. Claim/renew command results expose timestamps only to the executor
   (002:325, 002:331), and using those mutation results as a human read would not
   be valid. Missing projection is safe `{agentId, claimedAt, expiresAt, active}`;
   exposing `claimToken` is unnecessary and would violate the approved boundary.

2. **Edit subtask assignee, due date and notes.** Existing visible fields are in
   `src/features/subtasks.js:18`, `:19`, `:23`; mutations are
   `src/actions/actions.js:299` and `src/actions/subtasks.js:48`. Migration preserves
   their values in subtask `legacy_metadata` (001, `202610200001_normalized_work.sql:503`),
   but create/update-subtask permit only identity, title, done, order and claim
   fields (002:101; `supabase/functions/_shared/validation.ts:28`). No subtask
   `attributes` write exists; the metadata allowlist applies only to tasks,
   projects and teams (002:135). **Available alternative:** none. Existing
   `update_subtask` handles title/done/order with parent-task CAS, but cannot write
   these three fields. Converting a subtask to a task also consumes these fields
   (`src/actions/subtasks.js:63`).

3. **Delete a comment, including deletion from the task discussion.** Existing
   `src/actions/actions.js:933` removes a comment and offers Undo. Approved commands
   include `add_task_comment` and reactions, with no comment deletion
   (`task-2-report.md:147`; 002:97, 002:107, 002:117). Comments have no generic graph
   writer (002:214). **Available alternative:** none. Deleting the entire task is
   not the existing comment workflow; adding another comment cannot compensate a
   deleted one.

4. **Clear an existing task/project/team description.** Task edit explicitly sets
   `desc: ''` when cleared (`src/actions/actions.js:662`); project edit accepts the
   empty field (`src/actions/actions.js:1336`, `:1349`), as does team edit
   (`src/actions/teams.js:56`, `:73`). Both TS and SQL validation reject every empty
   or whitespace-only string, including description
   (`supabase/functions/_shared/validation.ts:149`; 002:129). Description is not a
   nullable field (002:130), and the task/project update uses `coalesce` (002:302,
   002:381). **Available alternative:** omit description when initially creating
   an empty record; there is no proper clear operation for an existing record.
   Sending HTML markup to emulate an empty rich-text value does not repair the
   plain description contract for projects/teams.

5. **Atomic bulk edits/deletes and board column actions.** Existing bulk mutation
   is one snapshot write (`src/actions/actions.js:997`, `:1005`); column
   complete/archive/reorder actions likewise mutate the selected set together
   (`src/actions/actions.js:1186`, `:1197`, `:1211`). The approved design explicitly
   requires atomic bulk operations
   (`docs/superpowers/specs/2026-10-20-agent-platform-design.md:76`). The current
   whitelist accepts one entity ID per command and has no batch envelope (002:88;
   `supabase/functions/_shared/operations.ts:29`). Each call opens its own SQL
   transaction and idempotency record (002:262, 002:413).
   **Available alternative:** sequential `update_task` / `complete_task` /
   `archive_task` / `delete_task` calls implement the individual changes, but can
   partially succeed on a later conflict/network error. The private
   `operation_delete_tasks` helper is not an authenticated RPC (002:184, 002:201).
   The same missing transaction envelope affects exact all-or-nothing subtask
   promotion (`src/actions/subtasks.js:63`) and multi-command task form saves
   involving relations (`src/actions/actions.js:638`); no separate new feature is
   implied by these examples.

6. **Recurring completion has server-owned parity differences.** Legacy creates
   the successor only when recurrence AND due date exist, sets its start date to
   its new due date, copies subtasks with their details and resets only `done`
   (`src/actions/actions.js:96`). SQL completion creates a successor whenever
   recurrence exists, uses today if due is absent, sets start to null, and copies
   only subtask title/order (002:345). Legacy Monthly is 30 days
   (`src/actions/actions.js:81`); SQL uses one calendar month (002:348).
   **Available alternative:** none preserving the existing atomic completion
   behavior. `complete_task` owns recurrence generation; separate edits/creates
   cannot suppress its successor, retain the three subtask fields in finding 2,
   or make a different successor atomic. This is a behavior-contract mismatch,
   not a request for another recurrence feature.

## Workspace / identity classification

- **Workspace name, URL/slug and color are existing cloud edits, not local-only.**
  Controls remain enabled in cloud (`src/pages/settings.js:144`), with mutations
  at `src/actions/actions.js:1930` and `:1935`. Legacy
  `save_workspace_snapshot` performs the owner/admin root update
  (`supabase/migrations/202610160001_workspaces.sql:87`). That RPC now rejects
  storage-version 2 (001:398, 001:406). The normalized command whitelist has only
  workspace creation, with no workspace update
  (`supabase/functions/_shared/validation.ts:59`); reads expose only the root DTO
  (002:449). **Available alternative:** none after cutover. This is Task 6 settings
  parity, lower priority than the task/execution blockers above. Workspace delete
  is already disabled (`src/pages/settings.js:153`;
  `src/actions/workspaces.js:301`) and is not a backend parity gap.
- **Profile editing, billing/security demonstrations and notification delivery
  preferences do not require new cloud mutations for parity.** Cloud profile is
  intentionally read-only (`src/pages/settings.js:141`); unsupported settings
  are gated at `src/pages/settings.js:16` and `:140`, and demo actions at
  `src/actions/workspaces.js:211`. Appearance/language/density/view defaults are
  device preferences (`src/core/store.js:116`), so their absence from
  `set_preferences` is not missing shared backend functionality. Preserve those
  controls through the React local/device adapter.
- **Member names/emails have an existing human-only RPC alternative.** Normalized
  `list_members` returns membership fields only (002:466;
  `task-2-report.md:179`). Existing `list_workspace_members` still returns human
  name/email/role to authorized direct-human JWTs
  (`supabase/migrations/202610160001_workspaces.sql:106`); its `workspace_role`
  gate remains OAuth-fenced, but does not reject normalized workspaces
  (001:23). This is an explicit API-boundary integration choice for the human
  panel, not an absent DB capability and not a reason to expose PII to MCP.

## Already supported; not gaps

Favorites and per-user notification read/unread state use `set_preferences`
(`favoriteTaskIds`, `favoriteProjectIds`, `notificationReadStates`, 002:149), not
mutations on shared notification rows. Saved views have create/update/delete
(002:113); file metadata has create/update/delete and task attach/detach
(002:106, 002:115). Project duplication/templates can compose existing project,
task and relation commands; no absent `duplicate_project` RPC by itself is a
capability blocker. Their atomicity and subtask details are already covered
above. Executor assignment/intervention exists through
`intervene_task(action: reassign/release/complete/delete)` (002:332), and Hermes
executor linking has an existing admin RPC (003:129).

Uploads of bytes, project privacy, real cloud invitations, billing, model
management, and Task 4-owned new execution/webhook interfaces were excluded.
Stop condition: this capability comparison is recorded with source references;
no implementation or broad frontend inventory is part of this task.
