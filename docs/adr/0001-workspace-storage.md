# Workspace snapshots with membership authorization and revision checks

Status: accepted historical snapshot decision, 2026-10-16; superseded for the current frontend by the normalized model and final React cutover. The dated sections below preserve the original decision and transition.

The existing application edits a related graph of projects, tasks, comments, files and views. Its local workspace data must survive while the first Supabase account is prepared.

Use a workspace module with local and Supabase adapters. Each adapter stores one versioned snapshot per workspace. Supabase stores identity and membership in separate authoritative tables. PostgreSQL RLS filters reads; restricted database functions validate membership and compare the expected revision before writing. Client snapshots cannot grant roles or replace membership. An outdated write fails instead of overwriting another person's work.

The alternative was to normalize every entity and rewrite all mutation paths at once. Snapshot persistence preserves the existing interaction model and makes local migration reviewable now, at the cost of conflicts at workspace granularity and a 5 MB snapshot limit. Conflicts require exporting a draft and reloading; there is no automatic merge or realtime collaboration in this release. A future normalized model can replace the adapter without rewriting UI translation or theme code.

Every authenticated member can read the workspace snapshot. Guests are read-only. Private projects inside a workspace are intentionally unsupported in cloud mode and rejected by the database. Use separate workspaces where different people need different access. Membership and account roles are provisioned through administrative SQL; the old simulated invite and permission controls cannot grant cloud access.

Favorites and notification read states remain collaborative snapshot content in this release. Appearance, language, view preferences and active workspace selection stay scoped to the local signed-in identity. Local demo content is never uploaded automatically. File entries in the prototype are metadata only; cloud file uploads are unavailable until a storage integration is added.

## Normalized successor (2026-10-20)

`202610200001_normalized_work.sql` now provides the additive successor schema and
an explicit per-workspace cutover. Existing workspaces remain on storage version 1
until an owner/admin invokes `migrate_workspace(workspace_id, expected_snapshot_revision)`.
The frontend still uses its existing adapter at this stage; deployment of the new
schema alone does not activate the new storage. Cutover must wait for frontend parity
and verification of a recovery export.

Storage version 2 uses text entity IDs with composite workspace foreign keys and
per-task versions. The migration locks the workspace and snapshot, validates the
entire graph, and copies records transactionally. Repeated invocation returns the
original migration diagnostics even with a stale source revision. All source fields
survive in typed columns or validated object metadata; the unchanged source snapshot
remains available for recovery. Its writes and the old snapshot RPC are blocked after
cutover. The old RPC and migrator lock the workspace in the same order to serialize
cutover against an already-open browser. Normalized tables grant authenticated users
membership-filtered reads only; subsequent operation RPCs own mutations, versions
and audit. OAuth client tokens fail closed until explicit integration grants exist.
That gate also covers the original workspaces, memberships, snapshot recovery reads,
member-list RPC and workspace creation. The private v1 creation/save functions have
no ordinary-user execution grants, so they cannot bypass the protected wrappers.

Auth users and workspace memberships remain the sole human identity authority.
Legacy references without an exact real membership match are retained as metadata,
reported in migration diagnostics, and never turned into Auth users or memberships.
Typed actor/assignee columns remain null for those references. A graph orphan in a
project, task, team or dependency aborts the whole cutover.

Favorites and notification read state now live in `user_preferences`, visible only
to that user while membership exists. Legacy snapshots contain no reliable personal
author. The migrator therefore imports no personal preferences by default. A DBA may
record verified export ownership in `snapshot_personal_provenance` for the exact
snapshot revision; only that proven user receives the old personal state. JSON fields
such as `me` and `by` never establish ownership. Original shared state remains in the
read-only recovery snapshot. Removing that member cascades preparatory provenance and
personal preferences, while recorded migration diagnostics retain the historical
attestation. Membership revocation clears nullable identity links on work and history,
including agents; it preserves agent records and task executor references. Project/team
membership relation rows cascade. No new membership FK blocks revocation or deletes
shared work. Notifications themselves remain shared legacy content;
their normalized metadata omits read state.

Restoring the old snapshot after new normalized writes is not a supported rollback:
export and reconcile those writes first. This migration does not switch the browser,
apply remote migrations or claim cloud activation.

## Final React cutover (2026-10-21)

The single React entry now uses normalized cloud operations and the separate local panel adapter. The runtime snapshot writer and old renderer are retired. Explicit per-workspace migration, preserved recovery snapshots and writer fencing remain required; new cloud workspaces start normalized and empty. See [current setup](../supabase-setup.md), [verification](../verification.md) and the [authoritative design](../superpowers/specs/2026-10-20-agent-platform-design.md). Dedicated backend deployment through008 has separate proof; final frontend publication and real external clients remain activation gates.
