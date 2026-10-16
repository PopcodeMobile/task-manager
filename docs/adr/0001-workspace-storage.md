# Workspace snapshots with membership authorization and revision checks

Status: accepted, 2026-10-16.

The existing application edits a related graph of projects, tasks, comments, files and views. Its local workspace data must survive while the first Supabase account is prepared.

Use a workspace module with local and Supabase adapters. Each adapter stores one versioned snapshot per workspace. Supabase stores identity and membership in separate authoritative tables. PostgreSQL RLS filters reads; restricted database functions validate membership and compare the expected revision before writing. Client snapshots cannot grant roles or replace membership. An outdated write fails instead of overwriting another person's work.

The alternative was to normalize every entity and rewrite all mutation paths at once. Snapshot persistence preserves the existing interaction model and makes local migration reviewable now, at the cost of conflicts at workspace granularity and a 5 MB snapshot limit. Conflicts require exporting a draft and reloading; there is no automatic merge or realtime collaboration in this release. A future normalized model can replace the adapter without rewriting UI translation or theme code.

Every authenticated member can read the workspace snapshot. Guests are read-only. Private projects inside a workspace are intentionally unsupported in cloud mode and rejected by the database. Use separate workspaces where different people need different access. Membership and account roles are provisioned through administrative SQL; the old simulated invite and permission controls cannot grant cloud access.

Favorites and notification read states remain collaborative snapshot content in this release. Appearance, language, view preferences and active workspace selection stay scoped to the local signed-in identity. Local demo content is never uploaded automatically. File entries in the prototype are metadata only; cloud file uploads are unavailable until a storage integration is added.
