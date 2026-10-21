# Custom branding: accent color and organization logo

User intent: select an arbitrary brand accent in Appearance and define an organization logo. Deliver both in React/shadcn and publish on the existing Delta Academy Vercel project.

## Acceptance and scope

- Custom accent: native color picker plus validated HEX input; explicit Apply; persist via existing per-identity device preferences; preserve base color and derive readable light/dark variants; presets restore correctly. No preference schema migration.
- Organization logo: PNG/JPG/WebP upload explicitly selected by the user. Private Supabase Storage; owner/admin humans manage branding; workspace members read it. Normalize raster image to a small thumbnail, preview before saving; replace/remove display via existing versioned workspace update. Preserve drafts on failure. No public bucket, arbitrary image URL, SVG or embedding binary data in workspace JSON.
- Additive migration010 only; preserve001–009 and existing auth/command/CAS/idempotency semantics. A nullable workspace logo path is projected only through authorized workspace reads. Storage policies use narrowly scoped membership checks with no OAuth write expansion. Mirror the contract locally and document OpenAPI.
- Validate helper/input cases, real SQL permission/CAS/replay and Storage policy boundaries, local UI reload/theme/mobile, hosted migration/API readback and finite public UI smoke. No model calls, real user signup or webhook activation.

## Implementation sequence

1. Accent helper, isolated component, App runtime hook and focused tests (worker owns these files); root integrates SettingsPage and scoped styles.
2. Backend logo contract, additive migration, local DTO/validation and focused SQL tests (backend worker owns backend/domain/local-model files). Root owns upload/preview service and Settings/WorkspacePicker integration.
3. Independent review of backend and UI, apply only reviewed010 to dedicated Supabase project, deploy matched API/MCP validation as necessary, then publish frozen frontend.
4. Verify production bytes/invalid controls and configured storage; document real-user limits and local commit. Keep remaining Task7 client/retention/Cron and main integration gates open.

Stop when both controls persist correctly, logo authority/isolation are proven and the reviewed artifact is public. If external configuration blocks an authorized activation, preserve the reviewable implementation and report the precise gate.

## Delivery status

- [x] Custom accent, safe normalization, derived theme contrast, persistence and presets.
- [x] Raster logo preparation, explicit preview/save/undo/remove, picker identity and local/cloud contracts.
- [x] Independent UI and security reviews, additive010, hosted Storage/API isolation proof, matched API/MCP deployments.
- [x] Frozen static frontend published on existing Vercel production URL;6/6 public hashes and3/3 public browser checks passed.
- [x] [Verification receipt](../../verification/agent-platform/branding-2026-10-21.md) and safe hosted receipt recorded. Stop condition reached for these two branding features; original Task7 gates remain open.
