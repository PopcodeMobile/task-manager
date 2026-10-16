# Workspace, language and design system

Date: 2026-10-16

## Intended result

Deliver Portuguese and English with Portuguese as the default, independent organizations, a Supabase persistence path ready for account configuration, and an adaptable design system. Preserve existing local content. Localized demo examples are authorized; never rewrite user-created content when changing language.

## Scope and sequence

1. **Workspace module:** `src/core/store.js`, `src/workspace/`, `src/data/`, `supabase/`. Introduce local and Supabase adapters behind a workspace interface. Migrate the old single-browser snapshot into one tenant. Flush pending writes before switching, reset transient state, bind delayed work to its originating tenant. Use membership-based RLS and revision checks; show failures and conflicts.
2. **Language module:** `src/core/i18n.js`, `src/locales/`, date helpers and rendering call sites in shell/pages/views/overlays/actions. Use stable domain IDs and runtime translation. Persist `pt-BR`/`en`, translate labels and accessibility text, format dates/numbers with Intl. Sample data is generated in the selected language.
3. **Design module:** `src/styles/`, theme preferences and the design-system page. Consolidate semantic and foundational tokens, consume them in styles and inline templates, remove duplicate dark palettes and share accent definitions. Keep dimensions derived from data and illustration geometry distinct from design values.
4. **Application integration:** bootstrap the chosen adapter, connect real authentication, workspace creation/switching, failure recovery and scope guards. Remove the simulated account paths superseded by real authentication. Keep local demo usable without credentials and identify its mode in the UI.
5. **Verification and handoff:** unit/contract tests, real PostgreSQL RLS checks, browser flows in both languages, theme adaptation, legacy migration, tenant-switch race cases, lint/format/build, independent review, then commit and integrate on main.

## Decisions

- Keep plain JavaScript and Vite. No UI framework migration.
- Workspace is the tenant; team remains inside a workspace.
- Store user language separately from tenant data. Translate explicit UI strings, never arbitrary DOM text.
- Cloud configuration is explicit. Missing configuration uses the local demo; partially invalid configuration is an error. Network/auth errors never silently switch to demo data.
- Use only the Supabase project URL and publishable key in frontend configuration. Administrative keys never enter the frontend.
- The account credentials and remote migration execution are deferred until Hugo supplies the account details. Prepare and verify the migrations locally now.

## Acceptance and stop condition

- All application routes, common actions and overlays are usable in Portuguese and English; choice survives reload.
- Create and edit tasks in workspace A, switch to B and reload: A's records never appear in B. Undo, drag/drop, delayed save and uploads cannot cross tenant scope.
- Unauthenticated and nonmember database access is rejected. Role/membership authorization cannot be changed through workspace content. Stale revisions fail visibly.
- Local data survives migration without duplicating one tenant's data into others. Cloud failures preserve work and expose recovery.
- Theme, accent, spacing, radius and type changes propagate through documented tokens. Token audit has no unresolved references or unreviewed hardcoded design styles.
- Required checks pass and a separate reviewer has checked the result. Remote Supabase activation is reported as pending, not claimed as tested.
