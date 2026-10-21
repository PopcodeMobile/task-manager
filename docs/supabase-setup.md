# Supabase setup and explicit cutover

The final React entry uses `VITE_SUPABASE_URL` plus `VITE_SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY`. Both public values must be present for Auth. `VITE_DATA_MODE` belonged to the retired renderer and no longer selects a runtime. Never place service-role, worker, signing or refresh credentials in `VITE_` variables. Restart/rebuild after changing public environment values.

With no cloud configuration, `/` offers **Continue on this device** and `/app-local` opens the demonstration. A cloud session uses normalized operations; network failures retain the current error/draft rather than silently creating local cloud data.

## Schema and target

Apply the original `202610160001_workspaces.sql` and then the additive migrations in filename order:

| Migration      | Contract                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------- |
| `202610200001` | Normalized entities, preserved recovery snapshots, explicit migration and old-writer fencing |
| `202610200002` | Operations, CAS/idempotency, claims/runs, audit and paginated reads                          |
| `202610200003` | Per-user OAuth grants and consent lifecycle                                                  |
| `202610200004` | Persistent webhook queue, Vault/worker boundary and scheduler                                |
| `202610200005` | UI operation contracts, batch/metadata/recurrence behavior                                   |
| `202610200006` | File metadata duplication                                                                    |
| `202610200007` | Atomic task-graph copies                                                                     |
| `202610200008` | Optional exact team-membership baselines                                                     |
| `202610200009` | Task-context pages, structured execution and event high-water (reviewed/applied009)          |

The dedicated hosted project has reviewed migrations through009 and matched API/MCP deployed; [actual009proof](verification/agent-platform/runtime-009-proof.md) records real Auth/transport/catalog checks. [Earlier008proof](verification/agent-platform/hosted-preactivation-proof.md) retains its historical scope. The frontend is now published at **https://task-manager-chi-eight-19.vercel.app** in Delta Academy Vercel. Auth Site URL, callback allowlist and exact API origin are configured for this production host; [publication proof](verification/agent-platform/task-7-vercel-publication-2026-10-21.md) records the scoped changes and public checks. Configure only that intended project; do not push local Auth defaults wholesale. Publication does not complete real Hermes or personal-Claude acceptance.

Callbacks use `/auth/callback` and preserve a validated local `returnTo`. OAuth consent uses `/oauth/consent?authorization_id=...`; the final SPA must serve those URLs on direct navigation/reload. Hosted email confirmation remains enabled. Configure delivery with the intended provider and test actual signup/recovery separately from local fixtures.

## Membership and normalized writes

`create_workspace_v2` atomically creates an empty normalized workspace with its owner. Additional members must have Auth accounts and be provisioned by an authorized administrative session. The frontend does not provide membership escalation:

```sql
insert into public.workspace_memberships (workspace_id, user_id, role)
values ('workspace-uuid', 'auth-user-uuid', 'member');
```

Roles are owner/admin/member/guest. Guests read; members write permitted content; owners/admins administer supported workspace/integration operations. Auth metadata and legacy member labels are not role authority. RLS and transactional RPCs enforce tenant/actor/grant rules even when UI controls are bypassed. Project privacy, external invitations, billing and session/2FA management remain unavailable cloud features.

Versioned entity updates carry `expected_version`; writes carry idempotency keys. A stale version fails without overwriting the winner. Keep the draft and explicitly review/discard or retry. An uncertain response retries the exact command/key. Task claims and intervention have separate executor semantics; the human repository never exposes claim credentials.

## Existing cloud workspace cutover

Discovery distinguishes legacy storage from normalized storage. After backing up and reviewing one workspace, an owner/admin explicitly invokes `migrate_workspace(p_workspace_id, p_expected_snapshot_revision)` for its known snapshot revision. Validate the graph and related references first. Migration preserves text IDs and unmapped legacy metadata and is atomic/idempotent.

After cutover, `storage_version=2`, the original snapshot remains frozen, and `save_workspace_snapshot` rejects the old writer. Its v1 bypass is not callable by ordinary authenticated users. New writes use normalized entities/CAS. Repeating migration does not overwrite newer normalized writes. A rollback that restores the old snapshot over new work would lose data and is not supported. See the separately named SDK cutover test and real PostgreSQL proof in [verification](verification.md).

## Local data and preferences

The local repository imports `gr8r.v2` into the first device workspace, retains the original bytes and keeps other workspaces empty. Unknown graph metadata and per-identity/per-workspace preferences remain separate. Corrupt/unwritable data produces a recoverable error; it is not seeded over. No cloud account receives local data automatically.

**Export task draft** exports the current core task draft, not a complete workspace backup or unsaved nested subtask draft. Local demo invitation/profile/security/reset actions remain explicitly local demonstrations.

## Reproduce verification

```sh
npm run check
SUPABASE_TEST_CONFIG=/private/local-status.json node --test tests/workspace-sdk.test.js
bash supabase/tests/run-postgres.sh all
bash supabase/tests/team-membership-baselines-postgres.sh
npm run test:e2e
```

The SDK file accepts the dedicated local status JSON (`API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`) or `url`, `key`, `serviceKey`. It refuses non-loopback hosts, creates unique fixtures and removes workspaces/accounts in `finally`; the service key is used only for setup/cleanup. Never commit this file. The local Supabase project uses API 61921/DB 61922; do not reset unrelated projects. Browser live suites use `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_SUPABASE_SERVICE_ROLE_KEY` loaded privately. Default CI does not assert those optional live gates.

## Final009 rollout boundary

The [reviewed009 runtime proof](verification/agent-platform/runtime-009-proof.md) supersedes the earlier pre-application008 handoff: reviewed009 is applied to the dedicated local and hosted targets, with matched API/MCP and real synthetic-user Auth/transport/catalog checks. The [final residual report](verification/agent-platform/final-residual-report.md) retains the reviewed009 hash and contracts. This does not establish publication, Hermes or personal-Claude acceptance. The frontend calls authorized `/api/v1/workspaces/{workspace_id}/event-cursor` before hydration and requires009; do not deploy it against008.

`get_task` optionally returns a bounded context page for comments/subtasks/dependencies/files/attachments while preserving its default envelope and twelve MCP names. `renew_task_claim` optionally records running/blocked execution and bounded reason, separate from task workflow. Detailed pagination, quota cost, authority, expiry/revocation and retry semantics are in the report. The existing live SDK test config is local-only; final-contracts uses in-memory SDK/PGlite only. Do not repoint either isolated SQL harness at shared/hosted services.

The latest009projection distinguishes reservation.active (unexpired lock) from execution.active (effective authority). Revocation does not silently release the lease; a human still uses explicit intervention or waits for expiry. The runtime proof records the completed postreview gate for the residual report hash.
