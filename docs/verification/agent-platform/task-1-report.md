# Task 1 implementation report

Status: implementation and local tests complete; independent controller review pending.
Workspace: `/Users/hdoria/projects/task-manager/.worktrees/agent-platform`, branch `feat/agent-platform`.
No remote migration, shared Supabase reset, frontend switch, or Auth-user fabrication occurred.

## Acceptance, scope and stop condition

Deliver additive normalized persistence, an advisory legacy inspector, an admin cutover RPC,
a frozen source snapshot, personal-state provenance and membership-filtered read access.
Preserve text IDs and all entity/root source fields in typed columns or validated metadata.
Invalid graph migration must roll back every inserted row and leave storage version 1.
Stop after owned-file commit and passing local Node, PostgreSQL and static checks; controller
owns independent review and subsequent API/frontend/remote activation tasks.

Owned files: `src/domain/contracts.ts`, `src/domain/legacy-map.ts`,
`supabase/migrations/202610200001_normalized_work.sql`,
`tests/normalized-sql.test.js`, `tests/legacy-map.test.mjs`,
`supabase/tests/normalized-rls.sql`, `supabase/tests/run-postgres.sh`,
`docs/adr/0001-workspace-storage.md`. This ignored report is not committed, per controller.
No edits to `src/workspace/supabase.js` or the controller's plan changes.

## RED evidence

Before production files existed:

```
node --test tests/normalized-sql.test.js tests/legacy-map.test.mjs
6 tests / 0 pass / 6 fail
legacy inspector must exist (3 assertions)
normalized SQL migration must exist (3 assertions)
```

Additional diagnostic behavior was tested before implementation:

```
node --test tests/legacy-map.test.mjs
4 tests / 3 pass / 1 fail
legacy inspection validates team mappings, nested relations, project states and reaction containers
Expected true !== false
```

Root-level metadata preservation received a separate failing assertion:

```
node --test tests/normalized-sql.test.js
migration preserves identities ... FAIL
column "legacy_metadata" does not exist (workspaces)
```

During first GREEN pass, NUMERIC `sort_order` came back as a string from PGlite. Inspected
PGlite API/type docs before adapting the test boundary with `Number(...)`; PostgreSQL
NUMERIC remains exact on disk. Primary source: https://pglite.dev/docs/api.
No production behavior was changed to work around that driver representation.

## Final GREEN evidence

```
node --test tests/normalized-sql.test.js tests/legacy-map.test.mjs
7 tests / 7 pass / 0 fail / 0 skipped

npm test
40 tests / 39 pass / 0 fail / 1 skipped
```

The skip is the pre-existing SDK cloud integration without environment configuration.
This worker did not claim cloud verification from the skip. Controller separately tested
its real local SDK setup outside this worker's scope.

```
bash supabase/tests/run-postgres.sh all
Normalized migration, ownership, membership, guest, outsider, revocation,
OAuth fail-closed, FKs and frozen CAS passed on PostgreSQL 17.11
```

Runner modes: default `legacy`; `normalized` applies base + normalized migration and new
suite; `all` also executes the old RLS/CAS suite before the new migration. Each invocation
uses its own ephemeral `postgres:17-alpine` container, removed by trap. Full final output:
`/tmp/task-manager-normalized-postgres.log` (no credentials). Node suite output:
`/tmp/task-manager-normalized-npm-test.log`.

Static checks passed: `npm run lint`; `npx prettier --check` on changed TS/test/ADR files;
`deno check src/domain/contracts.ts src/domain/legacy-map.ts`;
`bash -n supabase/tests/run-postgres.sh`. Tests execute the real migration, not SQL mocks.

## Cutover interface and personal provenance

`public.migrate_workspace(p_workspace_id uuid, p_expected_snapshot_revision integer) returns jsonb`
is SECURITY DEFINER with empty search_path and callable by authenticated users, but enforces
current owner/admin membership inside the function. Guests, members, outsiders, anon and
OAuth-client tokens are denied. It locks workspace first then snapshot, requires exact
revision only for the first cutover, imports atomically, records diagnostics, and activates
storage_version 2. Reruns return the existing diagnostics regardless of stale revision;
new normalized data and versions survive untouched.

Returned diagnostics: `{counts, unresolvedUsers, personalStateOwner, personalState,
sourceRevision}`. `counts` records input array counts. `unresolvedUsers` contains distinct
unmatched legacy human references (including reaction/attachment/team users). No such ID
is imported into Auth/membership; nullable typed identity fields remain null. Original
references remain in validated metadata.

The source snapshot is never rewritten/deleted during migration. A trigger freezes its
UPDATE/DELETE after cutover, even for a direct elevated writer. The old save RPC is a
wrapper locking the workspace before checking storage version. It rejects migrated
workspaces with SQLSTATE 55000. Its renamed v1 implementation is revoked from all user
roles so callers cannot bypass the wrapper. Guest/outsider/authentication failures use
42501; stale first-cutover revisions use 40001; graph FKs/checks abort the transaction.

`public.snapshot_personal_provenance(workspace_id uuid PK, snapshot_revision integer,
user_id uuid composite FK membership)` is a DBA-only attestation table, with all ordinary
user privileges revoked and no RLS policy. An administrator must verify export ownership
and record the exact source revision there before cutover. No payload field (`me`, `by`,
user-like ID, or owner flag) establishes that provenance. Only that proven member receives
favorite project/task IDs and notification read states in `user_preferences`. Without
proof nobody receives personal values. The original shared values remain in the frozen
snapshot. Provenance is for this whole legacy export, whose schema had one shared personal
state; no record-level author is invented.

## SQL contracts for Task 2

All entity identities are `(workspace_id uuid, id text)` primary keys; new IDs default to
UUID serialized as text. All entity/relation FKs include workspace_id. UUID human IDs point
only to authoritative `(workspace_id,user_id)` membership. Authenticated roles have SELECT
only, filtered by `normalized_workspace_role(workspace_id)`. No direct entity/relation
INSERT/UPDATE/DELETE grants exist: Task 2 RPCs must own versioning and audit. The helper
currently rejects any `request.jwt.claims.client_id` or legacy per-claim client_id; Task 3
must replace that fail-closed seam with current grant checks, without granting bare OAuth
membership access. Existing snapshot tables remain recovery/export surfaces.

Workspaces additions: `storage_version integer default 1 check in(1,2)` and
`legacy_metadata jsonb object` containing root source fields except the imported entity
arrays. Existing workspaces, membership schemas and source snapshots remain intact.

Entity tables and business columns (all also have workspace_id/id and validated
legacy_metadata jsonb):

- `projects`: key, name, description, status(planning/active/risk/hold/complete),
  team_id, lead_user_id, due_date, start_date, sort_order numeric, archived, version bigint.
- `tasks`: project_id, key, title, description, status(backlog/todo/progress/review/done),
  priority(none/low/medium/high/urgent), version bigint, assignee_user_id,
  executor_agent_id, recurrence(Daily/Weekly/Every 2 weeks/Monthly), due_date, start_date,
  sort_order numeric, archived, created_at, updated_at, completed_at, archived_at.
- `agents`: name, auth_user_id nullable membership FK, client_id nullable,
  version bigint, created_at. Initial identity table supports executor FK; connection/grant
  lifecycle belongs to later tasks.
- `teams`: name, description.
- `subtasks`: task_id, title, done, sort_order numeric.
- `labels`: name. Legacy string vocabulary IDs are retained as names/IDs.
- `comments`: task_id, author_user_id, body, created_at.
- `files`: project_id, task_id, name, file_type, size_label, author_user_id, created_at.
  Includes both top-level files and otherwise absent task attachments. Attachment source
  is independently retained in task_attachments metadata, even if it reuses an existing file.
- `calendar_events`: project_id, task_id, title, event_date, event_time.
- `saved_views`: project_id, name, view_type, filters jsonb array.
- `activity_entries`: project_id, task_id, actor_user_id, verb, created_at.
- `notifications`: project_id, task_id, author_user_id, notification_type;
  normalized metadata excludes read state, which belongs to user_preferences.

Relation keys/columns:

- project_members `(workspace_id, project_id, user_id)`; team_members
  `(workspace_id, team_id, user_id)`.
- task_dependencies `(workspace_id, task_id, depends_on_task_id)`, rejects self-dependency.
- task_labels `(workspace_id, task_id, label_id)`.
- task_attachments `(workspace_id, task_id, file_id)`, sort_order integer, legacy_metadata.
- comment_reactions `(workspace_id, comment_id, reaction, legacy_user_id)`, user_id nullable.
  The legacy ID preserves a reaction by an unresolved person without granting identity.
- user_preferences `(workspace_id,user_id)`, preferences JSON object
  `{favoriteProjectIds:string[],favoriteTaskIds:string[],notificationReadStates:Record<string,boolean>}`.
  Its read policy additionally enforces auth.uid()=user_id.
- workspace_migrations workspace_id PK, snapshot_revision, migrated_by, migrated_at, diagnostics.

Indices cover tasks by project/order/status/assignee/executor, comments/activity by task and
time, subtasks by task/order, files by task/project, reverse dependencies and project teams.
Original objects preserve ancillary fields (estimates, milestones, rich descriptions,
project sequences, colors/icons, filter operands, archived/completed metadata, ordering,
unresolved member lists and future fields). Source timestamps in milliseconds are converted
to timestamptz where typed; raw originals are retained.

`inspectLegacyWorkspace(payload)` is pure TypeScript, advisory, returns valid/counts/
duplicateIds/orphans/unmappedFields/unresolvedUsers/errors. It does not establish identity
or authorize imports. SQL independently validates actual relational insertion transactionally.
SQL `valid_legacy_metadata` limits source/object size to 5 MB, depth to 20 and rejects
prototype-pollution object keys. It is not a rich-text sanitizer; rendering remains responsible
for rich text sanitization.

## Limitations and handoff

No UI cutover is performed. Version-1 workspaces retain normal legacy operation. The new
schema alone does not promise completed API, OAuth, agent runs, webhooks or cloud readiness.
Do not activate a real workspace before frontend parity and recovery export validation.
Restoring the old frozen snapshot after normalized writes would lose those writes: export
and reconcile them first. Controller owns independent review before accepting Task 1.

## Independent review correction, round 1

Review base: `904b2645495170f99ed4c6307d1fbe4cf9589c21`.
The independent reviewer found two P1 issues and a diagnostic inconsistency. All were
handled in one scoped correction with regressions written and run before production edits.

### Reproduced RED

```
node --test tests/normalized-sql.test.js tests/legacy-map.test.mjs
10 tests / 7 pass / 3 fail
legacy inspection requires the same root arrays as the SQL migrator: true !== false
ungranted OAuth ...: claims:workspaces, 2 !== 0
revoking the attested owner ...: SQLSTATE 23503,
snapshot_personal_provenance_workspace_id_user_id_fkey blocks deletion

bash supabase/tests/run-postgres.sh normalized
ERROR: OAuth exposed workspace metadata
```

RED logs: `/tmp/task-manager-normalized-round1-red.log` and
`/tmp/task-manager-normalized-round1-postgres-red.log`.

### Corrected authorization and deletion semantics

`workspace_role(uuid)` itself now fails closed for OAuth client_id in both supported
claim settings. Thus ALL existing RLS policies on workspaces, workspace_memberships and
workspace_snapshots, and `list_workspace_members`, reject ungranted OAuth; the legacy
snapshot and workspaces.legacy_metadata are no longer an alternate data path.
`normalized_workspace_role` delegates to that shared authority. Task 3 must implement
grant checks in the shared workspace-role authority before enabling OAuth data access.

Workspace creation has no existing workspace role to check. Its new wrapper explicitly
rejects OAuth and unauthenticated subjects, then invokes a private renamed v1 function.
Execution on that v1 function is revoked from PUBLIC/anon/authenticated, just as for the
snapshot-save v1 function. Direct old-RPC names cannot bypass the gate. API surface grants
remain unchanged for normal authenticated human users. OAuth save/migrate/create/member
RPC requests return 42501, including storage-version-1 workspaces. Both JSON JWT claims
and the legacy per-claim client_id setting are covered by the Node database regression.

Membership-FK audit and actions:

- snapshot_personal_provenance: ON DELETE CASCADE; only the preparatory attestation row
  disappears. workspace_migrations retains migrated_by and personalStateOwner diagnostics.
- user_preferences, project_members, team_members: ON DELETE CASCADE; these are personal
  preferences/current membership relations, not shared work or historical content.
- agents.auth_user_id: changed from CASCADE to SET NULL(auth_user_id). Agent identity,
  task executor references and all task/history records survive; removing membership
  cannot be blocked by tasks referencing the agent.
- projects.lead_user_id, tasks.assignee_user_id, comments.author_user_id,
  files.author_user_id, activity_entries.actor_user_id, notifications.author_user_id,
  comment_reactions.user_id: already SET NULL on that user-ID column only; workspace_id
  and shared/historical rows survive. Legacy source author references remain in metadata
  (and reaction legacy_user_id). No new live-membership FK blocks revocation or cascades
  deletion of shared work/history.

The provenance regression revokes the EXACT atested owner while that member also has
lead, assignee, agent ownership, comment/file/activity/notification/reaction authorship,
team/project membership and preferences. It asserts every shared row count survives,
nullable live identity links clear, preparatory/personal/relation rows disappear, the
task executor stays bound to the surviving agent, migration diagnostics keep provenance,
the removed subject immediately sees no data, and the remaining admin can still read.
Real PostgreSQL repeats exact-owner removal with an assigned agent/task and historical
provenance checks, plus legacy OAuth table/RPC checks.

`inspectLegacyWorkspace` now requires root projects/tasks arrays, matching the SQL
migrator; `{}`, projects-only and tasks-only inputs fail without losing diagnostics.

### Final GREEN after the correction

```
node --test tests/normalized-sql.test.js tests/legacy-map.test.mjs
10 tests / 10 pass / 0 fail / 0 skipped

bash supabase/tests/run-postgres.sh all
Normalized migration, ownership, membership, guest, outsider, revocation,
OAuth fail-closed, FKs and frozen CAS passed on PostgreSQL 17.11

npm test
43 tests / 42 pass / 0 fail / 1 skipped
```

Full GREEN logs: `/tmp/task-manager-normalized-round1-postgres-green.log`,
`/tmp/task-manager-normalized-round1-npm-green.log`. The single existing SDK cloud skip
still means no cloud integration claim from this worker. No remote migration or frontend
cutover occurred. Scoped lint, formatting, Deno checks and diff whitespace verification
were also run before committing. Independent rereview remains controller-owned.

Round-1 correction commit: `c659330557893296cd5fb5518490bb7770e4ee29`.
Only the six owned correction files were committed; controller plan edits and this ignored
report were excluded. Status: DONE, pending independent controller rereview.
