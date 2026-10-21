# Domain language and runtime boundaries

- **Workspace (tenant):** projects, tasks, teams and memberships belonging to one organization. Switching workspaces never transfers records; ownership in one grants nothing in another.
- **Membership:** an Auth user's role in one workspace: owner, admin, member or guest. Legacy member labels and Auth metadata are not authorization.
- **Project:** related tasks within a workspace, with eight built-in tabs and personal saved views. Cloud project privacy is not an implemented access boundary.
- **Task:** project work with versioned content, status, assignee, dates, comments, relations and subtasks. Human assignee and external executor are distinct.
- **Team:** a workspace grouping, not a separate tenant. Membership edits use exact baselines where supplied to reject stale assumptions.
- **Agent connection/grant:** one user's OAuth client connection plus authorized workspace permissions. External Claude/Hermes agents execute outside this product; the panel supervises claims, runs and activity.
- **Claim/run:** a reservation bound to an executor, distinct from task assignment. Human intervention is explicit and audited. Completion cannot bypass an active reservation.
- **Personal preference:** per-identity/per-workspace device choices, separate from shared cloud data. Language does not change when changing workspace.
- **Local demonstration:** device-persisted graphs, separate from Auth workspaces. Migration retains original browser bytes; cloud workspaces start empty. There is no automatic upload.
- **File:** metadata and project association. Simulated selection is not byte storage or a cloud upload service.

# Architecture

`index.html` loads React/TypeScript through Vite. `/auth/callback` and `/oauth/consent` share the SPA entry. `/app` uses the normalized Supabase repository; `/app-local` uses the same panel contract over local persistence. Shared JavaScript calendar, domain mutations, seed, locales and strict rich-text sanitizer remain; the legacy renderer, global store and snapshot writer are removed from the runtime.

Cloud writes use transactional RPCs, authoritative expected versions and stable idempotency keys. UI draft guards preserve failed/uncertain edits, prevent unsafe navigation and follow paginated cursors; database RLS/operations remain the authority. Old cloud snapshots require explicit reviewed cutover, stay frozen afterward, and cannot overwrite normalized data through the old writer.

`tests/fixtures/legacy-workspace-*` preserve historical compatibility assertions only, with dependency injection and a pure validator. Current lifecycle/security proof lives in normalized SDK, local-panel, agent-panel, OAuth and real PostgreSQL tests. See [verification](docs/verification.md) for evidence and remaining deployment gates.
