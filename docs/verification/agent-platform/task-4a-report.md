# Task 4a implementation report

Status: implementation complete, pending root independent review. No frontend, deployed migration001–004, remote project, deployment or shared stack reset was changed by this worker. Root's dirty plan edits remain uncommitted. Stop condition: owned implementation/tests committed and this report delivered; independent review and any hosted005 deployment belong to root.

Baseline: `9585ebafa87f3ed7b307f65f9015cf7f149cf0ee`.

Owned commit: `1fe6a10` (`fix(api): complete contracts for existing panel workflows`),15 files. The sole remaining tracked dirty file is root-owned `docs/superpowers/plans/2026-10-20-agent-platform.md`; it was not staged or committed. This report is an ignored local SDD handoff artifact, consistent with the existing reports in this directory.

Frozen production migration: `supabase/migrations/202610200005_ui_contracts.sql`, SHA256 `fe45e98a567bfff5982f217f7c38a1264e3d9d7dce86b115dfd15bda48e77e79`. Root additively applied exactly this source to local61922, CLI exit0, without reset; worker verified the hash before shared live tests. Hosted005 was not applied by this worker.

## Exact interfaces for Tasks 5/6

REST/MCP retain the same validated-user JWT and SQL authority. The existing MCP tools continue using the shared operations service; no workspace administration or member PII tool was added. Existing MCP task reads receive the new safe task projection.

### Task execution reads

`get_task` and `list_tasks` now include:

```ts
reservation: null | {
  agentId: string;
  claimedAt: string;
  expiresAt: string;
  active: boolean; // expiresAt > the current server clock on every read
}
```

This is independent of `executorAgentId`. An assigned task can have no reservation; an expired reservation is retained with `active:false` while assignment remains. `claimToken` is never selected by this helper, task reads, events or batch results. Direct `claim_task` still returns the executor's private credential, with existing actor-scoped idempotent replay and immediate membership/grant revocation behavior. Mutation task DTOs retain their existing shape, so the shared Task type makes reservation optional; refresh a read for a live reservation.

### Clearable descriptions and subtask details

Task/project/team create/update accept `description:''`; null descriptions remain invalid and blank title/name/body are still rejected.

`create_subtask` and `update_subtask` add this strict field:

```ts
attributes?: {
  assignee?: string | null; // historical/local identity, maximum128 characters
  due?: string | null;      // ISO calendar date, '' or null
  note?: string | null;     // maximum20000 characters, '' clears
}
```

Details are merged into the existing `legacyMetadata` and read from `subtask.legacyMetadata.assignee/due/note`. No historical assignee is converted to an Auth user/membership. Existing unknown historical metadata is preserved; only these new attribute keys are writable. Subtask DTOs now declare the existing `version` field.

The command's `expectedVersion` is the PARENT task version, including on creation, not the subtask version. Every subtask change bumps the parent once. Agent writes still require that parent's current claimToken; stale CAS/expired/missing leases fail through the existing dispatcher. The existing private graph engine needed no replacement.

### Explicit comment deletion

Generic route: `POST /v1/workspaces/{workspaceId}/commands/delete_comment`.
Alias: `DELETE /v1/workspaces/{workspaceId}/comments/{commentId}`.

Envelope `{idempotencyKey, expectedVersion, input:{id}}`; alias may use `input:{}` because the route supplies the ID and rejects a mismatch. `expectedVersion` is the COMMENT version (existing/new comments start1). Result data is `{id,taskId,authorUserId,deleted:true}` plus the normal eventId/requestId envelope.

Only the persisted server author or workspace owner/admin can delete. Null/unresolved historical authors require owner/admin. Reactions cascade under this explicit policy. Immutable event contains the comment ID and parent task ID, without accepting client author identity. Cached replay works after the row is gone. A former administrator replaying deletion of someone else's comment is denied after demotion, including inside a cached batch; an ordinary author remains authorized for their own cached retry.

### Workspace settings

Generic operation `update_workspace`; alias `PATCH /v1/workspaces/{workspaceId}`.
Envelope `{idempotencyKey,expectedVersion,input:{name?,slug?,color?}}`, with at least one input field. Name is nonblank, at most120 characters; slug is1–120 characters and `^[a-z0-9][a-z0-9-]*$`; color is six-digit `#RRGGBB`.

Only a direct human owner/admin can mutate or replay. OAuth and bound automation executors are denied. Result `{id,name,slug,color,version,storageVersion,role}`. Workspace edit `version` starts1, distinct from storageVersion; list/get reads and fresh create results expose it. Durable pre005 cached creation responses are preserved as originally stored; fetch `get_workspace` for current edit versions after a replay.

### Atomic batch

`POST /v1/workspaces/{workspaceId}/commands/batch`:

```json
{
  "idempotencyKey": "one-key-for-the-whole-batch",
  "input": {
    "commands": [
      { "operation": "create_task", "input": { "id": "preallocated-task", "projectId": "p1", "title": "Promoted" } },
      { "operation": "delete_subtask", "input": { "id": "s1", "taskId": "parent" }, "expectedVersion": 7 }
    ]
  }
}
```

Exactly1–100 ordered commands. Child keys are only `operation,input,expectedVersion`; no child workspace, actor or idempotency key. All current existing panel domain operations are allowed except `create_workspace`, `claim_task`, `renew_task_claim`, `release_task_claim` and nested `batch`. The fixed SQL allowlist is the final authority. Both schemas validate operation-specific child inputs and required CAS, including create_subtask.

Result `{data:{results:[{data,eventId},...]},eventId,requestId}`. Child results follow their ordinary individual command DTOs; they do not contain requestId. The outer event is an aggregate marker; each child retains its own immutable event and ordinary filtered webhook fanout. No arbitrary SQL, result references or credential substitutions were added.

Every child calls the SAME execute_operation in the transaction, with the same live auth, rate limit, CAS, claim, audit and logged outbox. CAS is evaluated in order: supply successive parent versions when several children touch the same task. A create_task starts1. Preallocate existing text IDs for templates/promotion and link later children directly. Human promotion can create then remove the source subtask atomically; a done target must be composed with complete_task. Agent create→claim chains are deliberately not supported inside batch.

A conflict/error rolls back children, versions, numbering, events, queue, delivery ledger, rate counters and ALL idempotency rows. Changed payload with the same key is409. Ordinary successful replay retains the original result without rechecking obsolete CAS/lease state. Human/admin capability gates run before cached replay, including child workspace/intervention gates and cached deletion-author policy.

Private child keys use `internal:<fresh server-generated outer event UUID>:<index>`. Clients cannot pre-seed a predictable batch key/index namespace. N children consume N+1 committed rate units (maximum100 children requires101 remaining). Replay consumes the ordinary outer rate check only.

### Recurrence and duplication

Completion and human intervention-complete share the corrected branch. A successor requires BOTH recurrence and a due date. Daily/Weekly/Every2weeks/Monthly add1/7/14/30 days. Successor startDate equals its new dueDate. Subtask legacy details are copied, with top-level done reset false; duplication also copies details and resets done as before. Numbering, original completion CAS/lease and outbox remain transactional.

## Implementation and scope

- Additive005 adds workspace/comment versions, narrow private projection/allowlist/capability helpers, and replaces the existing validator/writer/reader/workspace-create functions without creating a second engine.
- All helper execute ACLs are immediately revoked; CREATE OR REPLACE retains existing entry/helper ACLs and SECURITY DEFINER/empty search_path boundaries.
- Shared strict schemas, domain DTOs, explicit REST aliases and OpenAPI document the interfaces above.
- Reachability audit still rejects unreviewed dynamic SQL, exposed vendor schemas, indirect/INVOKER/view sensitive bridges. It now verifies the exact tenant-qualified reservation whitelist and private invoker capability helpers. No blanket vendor revoke or net schema exposure was introduced.
- Legacy agent/OAuth tests now load005; the old recurrence rollback fixture now has a due date so it still tests a generated successor. Agent and OAuth concurrent-session runners exercise005. The real-extension runner applies001–005 under the real restricted postgres migration role, retaining vendor Vault ACLs.

## TDD evidence

Before production edits:

- `node --test tests/ui-contracts.test.js`: five expected RED failures: missing reservation (undefined versus null), clear-description validation_error, missing comment version, rejected batch, and Monthly returning2026-02-28 instead of2026-03-02.
- `deno test --config supabase/functions/deno.json --allow-env --allow-net --filter '005 panel' supabase/functions/tests/api.test.ts`: expected RED validation_error on the first supported clear-description input.
- After implementing005 and shared schemas: focused SQL5/5 GREEN and Deno1/1 GREEN.
- Self-review added two focused RED checks: a missing parent CAS on batch create_subtask incorrectly returned409 instead of schema422; an impossible ISO calendar date was accepted by TS. Fixed the batch required-version condition and validated dates by UTC roundtrip. Focused Node batch1/1 and Deno panel1/1 then GREEN.
- Final five focused SQL tests also cover active/expired reservations, token absence, parent-CAS/agent lease, revoked membership replay, author/admin deletion, demoted-admin cached deletion, deliberate external child-key preseed, batch rollback/replay, forbidden batch operations,100-command success/101 rejection, human workspace gates and exact recurrence details.

## Final verification

- `npm test`:70 passed,0 failed,1 skipped (71 total). The skipped `real Supabase Auth, PostgREST joins, tenant repository and CAS round trip` requires SUPABASE_TEST_CONFIG; it is the separate legacy SDK fixture, not claimed executed.
- `npm run lint`, `npm run typecheck`, `npm run build`, `npm run check:tokens`: all exit0. Token audit234 public tokens/93 source files. Build162 modules.
- `deno task check` in supabase/functions: all API/MCP/worker/test entry points pass.
- `deno task test`:22 passed,0 failed,3 gated ignores. The Auth/HTTP and OAuth/MCP ignores were separately executed live below. The unchanged optional native TLS fixture remained ignored without TEST_WEBHOOK_TLS_DIR; no new TLS behavior is claimed.
- `node /tmp/task3-run-deno.mjs --unstable-no-legacy-abort supabase/functions/tests/integration.test.ts supabase/functions/tests/oauth.test.ts`:2 passed,0 failed against additively migrated local005. Includes new HTTP aliases, description clearing, subtask details, comment authorship/deletion/replay, batch rollback/replay, Monthly30, workspace and nested-batch admin demotion replay; existing real Auth PKCE/MCP/two-user isolation/refresh/immediate OAuth consent+grant+membership revocation checks remain green. Credentials were supplied only from the private temporary status/signing files in process env and were never printed or written to git.
- `bash supabase/tests/run-postgres.sh agents`: exit0. Real PostgreSQL authorization, concurrent claim winner, stale version conflict, idempotency and project sequence checks. This focused vanilla runner loads001/002/005 and does not claim004 extension proof.
- `node supabase/tests/oauth-concurrency.mjs`:1 passed,0 failed, current001/002/003/005 concurrent reconsent/authorized-write lock ordering.
- Owned-file Prettier check and `git diff --check`: pass. A one-line test-runner readiness timeout added during environment recovery also received focused eslint/Prettier checks.

- `node supabase/tests/webhook-postgres.mjs`: final owned-fixture retry exit0. Current001–005 migrate under NOSUPERUSER postgres on the official Supabase Postgres image with real pgmq/Vault/pg_cron/pg_net/pg_graphql. Exact005 assertions passed for recurring successor details, promotion batch, rollback of logged queue+ledger+events+cache+rate+numbering, replay without new effects and legacy writer fencing. Existing extension ACLs, separate-workspace isolation, real REST/native GraphQL anon/human/OAuth boundary (41 reachable production functions/views), worker/Cron wakeup, HMAC receiver, finite retries, lease fencing, crash recovery and concurrent reservations all passed.

Environment failure, distinct from product verification: the first final-source fixture passed all SQL005/security regressions, then its healthy PostgREST container's published host port32792 had no host listener. Node showed TCP SYN_SENT, curl timed out after3 seconds, and DB sessions were idle. The previously completed initial full harness already had passed REST/GraphQL/worker paths. With root's explicit recovery instruction, terminated only worker-owned PID81180, removed only its two disposable containers/network, added a bounded1-second readiness fetch timeout to prevent an unbounded test hang, and ran exactly one fresh owned fixture/port. That retry passed the full current suite and cleaned up its containers/network. No Docker restart or shared stack change occurred. The stopped run exited143; its log is retained as environment evidence, never reported as a product success.

Logs are private local scratch: `/tmp/task4a-node.log`, `/tmp/task4a-deno.log`, `/tmp/task4a-live-auth.log`, `/tmp/task4a-agent-postgres.log`, `/tmp/task4a-oauth-races.log`, `/tmp/task4a-real-postgres.log`, `/tmp/task4a-real-postgres-final.log`, `/tmp/task4a-real-postgres-retry.log`. No mock pgmq/Vault result is represented as real extension proof.

## Concerns and limitations

- Independent review remains root's responsibility; no implementation approval is inferred from the static seam map or this self-review.
- The human panel can compose templates/promotion with preallocated IDs. OAuth flows that need a newly created task's claim must execute the explicit claim round trip outside the batch; no lease-creation/reference mechanism was added.
- UI must read the parent task version for every subtask mutation and increment its known parent version after each successful child; subtask mutation results return the child DTO, preserving the existing dispatcher interface.
- Workspace metadata can be edited only in normalized storageVersion2. Local profile/theme/density/demo/reset, legacy snapshots and OAuth administration remain outside this slice.
- Production source is frozen at the hash above and local005 is applied. Hosted005/API promotion must wait for independent review; root handles it.
