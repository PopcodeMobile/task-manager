# Task 2 implementation report

Status: implemented and locally verified; controller's independent security review pending.
Branch `feat/agent-platform`, base `c659330557893296cd5fb5518490bb7770e4ee29`.
No remote mutations, shared Supabase reset, frontend changes or package changes by this worker.

## Acceptance / scope / stop condition

Deliver one transactional command service shared by HTTP and forthcoming MCP. The database,
not caller JSON, authenticates identities and enforces membership, OAuth fail-closed behavior,
CAS, claims, reference integrity, idempotency, audit/outbox and bounded reads. Support existing
UI graph entities through a fixed whitelist. Stop after owned-file commit and actual local
Node/Deno/PostgreSQL evidence; controller performs independent review and later task activation.

Owned production files: `202610200002_agent_operations.sql`, functions `_shared` auth/errors/
validation/operations, `api/index.ts` and `api/openapi.json`, functions Deno config/lock,
Supabase edge-runtime config. Owned tests: `tests/agent-sql.test.js`, functions tests,
`supabase/tests/agent-operations.sql`, and PostgreSQL runner's additive agents suite.
Controller's plan edits were excluded from staging. This ignored report stays outside the commit.

## RED evidence and changes driven by it

- `/tmp/task2-sql-red.log`: 4 SQL behavioral tests failed because operations migration was missing.
- `/tmp/task2-api-red.log`: 5 tests failed because auth/API/validation/error modules were missing.
- First SQL parse run failed at an unparenthesized CASE inside PL/pgSQL IF. Consulted PostgreSQL
  control-structure documentation before correcting the expression; no blind production retries.
- `/tmp/task2-metadata-red.log`: graph/metadata regression rejected attributes before support existed.
- `/tmp/task2-atomic-red.log`: duplicate-task regression found lost `estimate` metadata (`undefined`
  versus `3h`). Duplicate and recurring copies now retain content metadata within the transaction.
- `/tmp/task2-v1-red.log`: safe v1 workspace candidate was absent. Direct human discovery now
  includes typed identity/role/storageVersion; listing does not migrate anything.
- `/tmp/task2-attachments-red.log`: explicit attachment mutation was absent. Added parent CAS/
  lease-protected attach/detach and blocked indirect file/label deletion by agents when referenced.
- `/tmp/task2-final-hardening-red.log`: direct SQL accepted `favoriteTaskIds:42`. SQL now independently
  validates preference arrays/maps, matching the API boundary.
- The initial recurrence date assertion was adapted at the driver boundary: PGlite returns a JS
  Date for SQL DATE. Production SQL DATE was unchanged. Task1 records primary driver documentation.

## Final GREEN evidence

`node --test tests/agent-sql.test.js`: **10 pass / 0 fail**.
`npm test`: **53 tests / 52 pass / 0 fail / 1 skipped**. The skip is the pre-existing unconfigured
SDK cloud integration; this skip is not cloud verification. Log `/tmp/task2-final-npm.log`.

`bash supabase/tests/run-postgres.sh all`: **PASS**, PostgreSQL 17 disposable container.
Includes existing legacy and normalized suites plus authenticated direct-RPC/privilege/guest/OAuth
checks and independent concurrent PostgreSQL sessions. Two claim attempts retain one lease;
two same-key commands create one task and event; two independent creates receive distinct keys.
Log `/tmp/task2-final-postgres.log`. No shared database reset was used.

`deno test --config supabase/functions/deno.json --allow-env --allow-net supabase/functions/tests/`
with local test credentials supplied through process environment: **10 pass / 0 fail / 0 skipped**.
Real signup obtains a signed Supabase JWT. HTTP handler makes real Auth and PostgREST calls,
creates a normalized workspace/project/task, verifies replay, CAS409, validation422, tampered
JWT401 and immediate membership-revocation403. Disposable workspace and Auth account cleaned
through local admin test cleanup; no fabricated auth.users insert. Business calls always use the
user token. Log `/tmp/task2-final-deno-live.log`.

Without local credential environment the same command passes 9 unit tests and explicitly ignores
one live integration test. Live run above is the verification evidence.

Deno coverage: **82.7% lines / 100% functions / 76.9% branches**, actual authenticated run.
SQL behavior is covered by database execution, not counted by JavaScript coverage. HTML/LCOV
under `/tmp/task2-deno-final-coverage`. These percentages do not claim SQL coverage or latency targets.

`npm run lint`, Deno lint/check, scoped Prettier check, shell syntax and diff whitespace passed.
No p95/load benchmark or deployed Edge worker claim is made by this task.

## Shared TypeScript interface

- `authenticate(request: Request): Promise<Actor>` verifies the JWT with Supabase Auth `/user`,
  then pins issuer/audience/sub/expiry/nbf and validates client_id. No decoded-only auth. Supports
  Supabase HS256/RS256/ES256 tokens; rejects unsigned/unknown algorithms. Immutable Actor has
  `{userId,clientId,connectionId:null}`. Connection identity is resolved in SQL, not request JSON.
- `executeCommand(actor, operation, command): Promise<CommandResult<unknown>>`, command shape
  `{workspaceId,idempotencyKey,expectedVersion?,input}` from `src/domain/contracts.ts`.
- `executeQuery(actor, operation, workspaceId: string|null, query={}): Promise<unknown>` returns
  `{items,nextCursor}` or `{data}`. `workspaceId:null` is allowed only for list_workspaces.
- Credentials are associated with authenticated Actor objects in a private WeakMap. Constructing,
  deserializing or cloning an Actor cannot execute commands. The same user JWT goes to PostgREST;
  no service-role credential is used in any domain operation.

Config: `SUPABASE_URL` and `SUPABASE_ANON_KEY` (or publishable key), `AUTH_ISSUER` when the public
issuer differs from internal URL, optional `AUTH_AUDIENCE` default authenticated, explicit comma-
separated `API_ALLOWED_ORIGINS`. Local native Deno uses issuer `http://127.0.0.1:61921/auth/v1`;
Edge's internal Kong URL must not silently become the expected public issuer. No secrets in git.
`functions.api.verify_jwt=false` delegates JWT validation to the function for future OAuth support;
it does not disable the verified authenticate boundary.

## HTTP contract

Base `/functions/v1/api/v1/workspaces` (native handler also accepts `/api/v1/workspaces`).
Safe OpenAPI 3.1 document is `supabase/functions/api/openapi.json`.

- GET base: safe paginated workspace discovery. Direct humans see legacy candidates with
  storageVersion1; these are migration-needed/read-only candidates, not automatically migrated.
  OAuth calls reach the per-workspace grant seam and currently see nothing.
- POST base: create normalized workspace atomically; input `{name,slug}`.
- GET `/:workspaceId`: explicit safe id/name/slug/color/storageVersion/role.
- GET `/:workspaceId/{collection}`: fixed collections for projects/tasks/subtasks/comments/teams/
  labels/files/calendar-events/views/agents/notifications/activity/domain-events/dependencies/
  task-labels/reactions/team-members/project-members/members/attachments.
- GET `/:workspaceId/tasks/:taskId`, GET corresponding `/activity`, GET `/preferences`.
- POST `/:workspaceId/commands/:operation`: all whitelisted commands below.
- REST aliases POST projects/tasks, PATCH/DELETE projects/:id and tasks/:id, POST task action
  suffixes archive/restore/move/duplicate/claim/renew/release/complete/intervene/comments;
  projects support archive/restore; PATCH preferences.

Mutation body `{input, expectedVersion?, idempotencyKey}`; key may alternatively be the
`Idempotency-Key` header. No actor/workspace/auth fields are deserialized from input. URL IDs
must agree with explicit input IDs. Result `{data,eventId,requestId}`. Failures return only
`{error:{code,message,requestId}}`, stable 401/403/404/409/422/429/503. No SQL, stack, details or
internal path is exposed. Server-generated request ID is also `X-Request-Id`. Responses no-store;
CORS is restricted to configured origins. Streamed bodies are bounded before parsing.

## SQL RPC contract for Tasks 3/4/5

Public authenticated RPCs (all SECURITY DEFINER, empty search_path, direct-call safe):

```
execute_operation(p_workspace_id uuid, p_operation text, p_command jsonb,
                  p_idempotency_key text, p_expected_version bigint default null) -> jsonb
read_operation(p_workspace_id uuid, p_operation text, p_query jsonb default '{}') -> jsonb
create_workspace_v2(p_name text, p_slug text, p_idempotency_key text) -> jsonb
```

`execute_operation` returns `{data,eventId}`. Read RPC returns `{items,nextCursor}` or `{data}`.
Every helper is revoked from PUBLIC, anon and authenticated, including graph mutation helpers,
authorization, validation, numbering and claim assertion. Entity DML remains revoked. No arbitrary
SQL/table/column name is accepted; graph dynamic SQL uses internal fixed table/column registries.
All cross-entity references remain composite workspace FKs.

**Task3 hook** `operation_authorize(p_workspace_id uuid,p_write boolean default false) -> jsonb`
returns authoritative `{userId,clientId,connectionId,agentId,role}`. It presently denies OAuth and
checks normalized membership, preserving the permanently fenced legacy workspace_role. Task3
replaces ONLY this shared operation authority with active-grant/connection checks; do not reopen
snapshot/base workspace/archive RLS for OAuth. Lock membership and active grant/connection rows
while authorizing to preserve revocation races. read_operation's OAuth workspace discovery calls
this hook per candidate, skipping forbidden workspaces; keep v1 OAuth forbidden in that hook.
No request JSON ever establishes agent identity. Non-OAuth automation may be administratively
registered through agents `(workspace_id,auth_user_id,client_id null)`; a unique identity index
prevents ambiguous executor resolution. Human panels have no registered executor for their tuple.

Command whitelist:

```
create_task update_task delete_task archive_task restore_task move_task duplicate_task
claim_task renew_task_claim release_task_claim complete_task intervene_task add_task_comment
create_project update_project delete_project archive_project restore_project
create_subtask update_subtask delete_subtask
set_task_dependency remove_task_dependency set_task_label remove_task_label
set_task_attachment remove_task_attachment
add_reaction remove_reaction
create_team update_team delete_team set_team_member remove_team_member
set_project_member remove_project_member
create_label update_label delete_label
create_view update_view delete_view
create_calendar_event update_calendar_event delete_calendar_event
create_file update_file delete_file set_preferences
```

Updates/deletes/claims require expected_version. Subtask and task relation mutations use the
**parent task version** (including create_subtask) and increment that parent; team/project member
relations use their parent version. Other graph entity updates use their own added version.
Creates, comments, own reactions and personal preference merges do not require a prior version.
Task updates cannot set executor or done. Only complete_task/intervene_task(action complete)
can complete work. Humans can edit content with CAS; deleting/moving/completing active claimed
work is blocked until explicit human intervene_task. Intervention accepts release/reassign/
complete/delete, requires human identity and CAS, and revokes the lease in the same transaction.
Project deletion rejects any active descendant claim; agents cannot delete projects containing
tasks. File/label deletes cannot indirectly let an agent mutate referenced tasks without a lease.
No generic graph helper can write the tasks table.

Task/project fields are camelCase DTOs from source contracts; graph data likewise maps SQL names.
Content `legacyMetadata` is retained read-only to preserve source domain fields; it establishes no
identity/authority. Mutation `attributes` permits only task estimate, project icon/color/milestones,
and team icon/color; SQL and TS validate and merge these into metadata. Other arbitrary metadata
writes are rejected. Workspace root legacy_metadata and workspace_snapshots never enter these
DTOs. Members expose only workspaceId/userId/role, never Auth emails.

Queries allow default50/max100, opaque keyset cursor, optional projectId/taskId/status filters.
Task activity requires taskId. Domain events are chronological by timestamp+ID. Composite relation
cursors use encoded JSON tuples so text-ID delimiters cannot collide. Per-user preferences read
only the current authenticated subject.

## Persistence, transaction and delivery contract

- `task_claims`: PK workspace_id/task_id, agent_id composite FK, private UUID claim_token,
  claimed_at, expires_at. Fresh lease 15 minutes; renew resets expiry to now+15 minutes. Token and
  authenticated agent are checked together. Expired claim can be atomically replaced. Replays of
  old tokens cannot mutate a replacement lease. Claim tokens have no authenticated SELECT path.
- `domain_events`: immutable to all authenticated clients, UUID id, workspace_id, operation,
  entity_id, immutable actor_user_id/client_id/connection_id/agent_id, safe payload, created_at.
  Actor IDs have NO live membership FK, so member removal cannot erase audit. Payload contains
  only entity/task/project IDs, version/status; no claim credentials, metadata, access token or
  comment body. This table is the durable outbox. **Task4 can add an INSERT trigger to enqueue
  each event in pgmq within the same command transaction**, using id as the delivery identity.
- `idempotency_requests`: composite workspace/actor/client/connection/operation/key PK;
  SHA-256 canonical JSON fingerprint includes input and expectedVersion; cached result and timestamps.
  Retention expires_at is48hours and records are not deleted by this migration. Replay always
  reauthorizes first; same-key/different-payload conflicts. Private results may contain own claim
  credentials; no table reads are granted. Authorization revocation defeats replay immediately.
- `project_task_sequences`: per-project counter initialized from existing numeric key suffixes;
  project lock and command transaction guarantee unique generated task keys under concurrency.
- `operation_rate_limits`: persistent user/client/connection minute buckets; 240 successful
  authorized SQL reads/writes per minute across workspaces. Failed SQL transactions roll back the
  counter along with their work; this is a business-activity limiter, not a failed-auth flood WAF.
- Commands take a workspace row mutex after authorization. This intentionally serializes writes
  within a workspace and makes idempotency/numbering/graph cascades simple and correct. No workload
  claim above this initial strategy has been benchmarked. Read queries do not lock workspace.
- Tasks, claims, recurrence/duplicate copies, events and idempotency result commit together.
  Injected event failure proves no partial mutation, generated recurrence or replay entry remains.
  Recurrence uses existing project sequence, cloned subtasks/labels and preserved domain metadata.

## Local handoff / limitations

Controller applied the initial Task2 migration LOCAL only. Source subsequently changed function
bodies. `/tmp/task2-local-functions.sql` was regenerated from the final migration and contains
CREATE OR REPLACE for all11 functions, with no table/grant/reset changes. Controller refreshed that local schema successfully, and the final realAuth/HTTP run
verified the refreshed list_domain_events path before Task3. Remote application remains controller-owned after independent
review. UI cutover, grant implementation, pgmq/webhooks, real MCP interoperability and cloud
Edge deployment are later tasks and are not claimed complete here.

Official sources consulted: PostgreSQL control structures
https://www.postgresql.org/docs/18/plpgsql-control-structures.html and Supabase JWT verification
https://supabase.com/docs/guides/auth/jwts ; server-confirmed user verification
https://supabase.com/docs/guides/auth/server-side/creating-a-client .

Commit: `eb5ebd53e74218ad5dd5f64833a539a6140deff4`
(`feat(api): add transactional task operations and agent claims`).
Only the controller-owned plan remains dirty. Independent review remains pending.

## Independent review correction, round 1 of 5

Review: `.superpowers/sdd/2026-10-20-agent-platform/task-2-review.md`.
Both P1 findings were reproduced by new authenticated-RPC regressions before changing SQL.

### Diagnosis and selected boundary

1. `delete_project` reused PL/pgSQL record variable `t` as a table alias, causing SQLSTATE42702
   before the claim check, even for an empty project. The SQL alias is now `claimed_task`.
2. Cascading deletion of task A could remove task B's incoming dependency, or an attachment
   pointing to a file owned by A, without B's claim/CAS/version/event protections. Project
   deletion had the same boundary and had previously processed children individually.

The controller approved the conservative rule: **do not mutate surviving-task relations as
an implicit consequence of deleting another entity**. Explicitly remove the surviving task's
relation first, through the normal command with its current expectedVersion and, for an agent,
its own live claim token. A conflicting task/project/file/label deletion returns the existing
safe `validation_error`/HTTP422. It includes no reference IDs, history, PII or database details.
Active descendants still cause `already_claimed`/409 before project deletion. No surviving task
is changed on rejection, so no synthetic version/event is needed or silently omitted.

A new private `operation_delete_tasks(workspace,task_ids[],project default null)` validates the
whole deletion set before any cascade. Single-task deletion and human intervention call it
through the existing private single-task wrapper; project deletion calls it once for all its
tasks, permitting wholly internal dependencies/attachments to disappear with that complete set.
It rejects incoming dependencies from surviving tasks; surviving-task attachments to files in
the deletion set; and files/calendar events/activity/notifications associated with the deleted
project while still referring to surviving tasks. Graph delete_file/delete_label additionally
require explicit attachment/label unlink by humans; the existing agent `forbidden` guard stays.
All helper execution remains revoked from PUBLIC/anon/authenticated. A workspace mutex continues
to serialize the boundary check, unlink operations, and deletion within transactions.

**UI Task5/6 precondition:** before deleting a task/project or a shared file/label, remove outside
dependencies/attachments/label relations explicitly. Use the owning surviving task's CAS and
lease; refresh on conflict. Internal relations of a deleted project need no separate unlink.
Project-scoped files/calendar records tied to a surviving task must be detached or reassigned
explicitly through their own validated entity command before project deletion. New command
preconditions are recorded in OpenAPI descriptions. No new public error code or request schema was introduced.

### Reproduced RED

```
node --test --test-name-pattern='authenticated project deletion|authenticated task/intervention|shared files and labels' tests/agent-sql.test.js
3 tests / 0 pass / 3 fail
project deletion: SQLSTATE42702, column reference "t.workspace_id" is ambiguous
cross-executor task deletion: missing expected validation_error rejection
shared file/label deletion: missing expected validation_error rejection
```

Full output: `/tmp/task2-round1-red.log`.

### GREEN after the scoped fix

```
node --test --test-name-pattern='authenticated project deletion|authenticated task/intervention|shared files and labels' tests/agent-sql.test.js
3 tests / 3 pass / 0 fail
node --test tests/agent-sql.test.js
13 tests / 13 pass / 0 fail
npm test
56 tests / 55 pass / 0 fail / 1 pre-existing cloud skip
bash supabase/tests/run-postgres.sh agents
PASS: normalized suite, authenticated deletion regressions and real concurrent claim/key/replay sessions
```

The new PostgreSQL17 regression uses its own rollback transaction in the disposable runner.
It performs deletion via SET ROLE authenticated, checks the exact active-claim/project errors,
checks successful empty/internal-graph project deletion, and verifies the surviving task's
entire row, claim, dependency and attachment remain unchanged. PGlite additionally snapshots
all task/file/claim/relation/event/idempotency rows before each rejected path; human intervention
rollback restores even the lease it attempted to revoke. Successful explicit CAS unlink followed
by deletion is covered, including rejection of stale unlink versions.

Deno checks relevant to the unchanged API runtime: `deno test --config supabase/functions/deno.json
--allow-env --allow-net supabase/functions/tests/`: **9 pass / 0 fail / 1 live integration ignored**.
The live test was intentionally not run against shared local SQL, which the worker was instructed
not to mutate in this correction. The initial task's real Auth evidence remains above; this
correction's SQL behavior is proved in disposable PostgreSQL and PGlite instead. Lint, scoped
Prettier, shell syntax and diff whitespace passed. Logs `/tmp/task2-round1-{sql,npm,postgres,deno}-green.log`.

No shared local/remote database changes were made. `/tmp/task2-local-functions.sql` now contains
an atomic four-function refresh (new batch helper, existing single helper, graph helper and
execute_operation), including helper revocations and the original authenticated command grant.
It intentionally leaves operation_authorize and all OAuth authority unchanged. Controller owns
application of that patch and independent rereview.

Primary references: PostgreSQL variable ambiguity
https://www.postgresql.org/docs/16/plpgsql-implementation.html and FK cascade behavior
https://www.postgresql.org/docs/17/sql-createtable.html .

Correction commit: `42a4f5a2602bc894c2b3b1def07418715cf4eab8`
(`fix(api): protect surviving task relations during deletion`).
