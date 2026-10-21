# MCP project management

Approved scope: user requested the previously described creation, rename/edit and archive project support. Existing React/Supabase/MCP architecture is retained. No new UI, dependency migration or additional permission tier.

## Acceptance and boundaries

Expose exactly three new tools: `create_project`, `update_project` (rename is name), and `archive_project`. Write organization tokens and granted OAuth writers may use them; read-only, cross-organization, expired/revoked and unauthorized agents may not. Project writes reuse existing validation, authorization, workspace locks, version conflicts, idempotent receipts and actor attribution. Creation returns ID/version; edits/archive require expected_version. No delete_project, membership or organization administration is added to organization-token authority. Existing valid write tokens gain these three operations by design; users need not regenerate them.

MCP schemas follow existing project field validation: name/key/description/status, dates, team/lead, sortOrder and allowlisted attributes. Project status: planning/active/risk/hold/complete. Unknown fields rejected. Archive is annotated destructive (reversible hide), idempotent. Existing direct REST project command routes gain the same three token operations. API schemas already describe human project operations.

## Task 1: SQL (SQL worker)

Ownership: additive `supabase/migrations/202610210012_agent_project_operations.sql` and project-token SQL tests in `tests/organization-agent-tokens.test.mjs` only. Preserve all prior migrations byte for byte and narrow catalog auditor authority.

1. RED real SQL tests for write-token create/update/archive, CAS, replay/event attribution, task creation inside new project, cross-workspace/read-only/direct RPC denial, remaining administration/delete denial and revoked replay.
2. CREATE OR REPLACE only execute_organization_agent_operation, extending its exact allowlist by these three operations. Keep verify-before-context/replay, cleanup, lock ordering and function ACLs unchanged.
3. GREEN focused SQL + catalog and existing token regressions; report source hashes. Do not activate hosted until independent review/root authorization for this already approved deployment phase.

## Task 2: MCP and Edge (root)

Ownership: `supabase/functions/mcp/tools.ts`, `_shared/organization-tokens.ts`, focused Deno tests; docs only afterward.

1. RED real MCP SDK fixture tests for discovery of15tools and new project execution/validation/version/read/cross-org boundaries; include JWT/OAuth-compatible route.
2. Add three strict schemas to existing catalog and token Edge allowlist; classify create_project as no-CAS and archive_project destructive. Preserve original12tools and OAuth authentication.
3. GREEN focused/full Deno tests and check, lint/type/format as appropriate. No product UI or Vercel changes required.

## Task 3: review, hosted proof and delivery

Independent reviewer checks exact SQL/Edge delta and runs meaningful focused checks. Resolve supported findings before deployment. Freeze reviewed backend/config/auditor source, take private public-schema/data backups, dry-run only012, apply012 and deploy API/MCP from the freeze. No Auth/config/worker/Cron/real Hermes/model changes.

Use only disposable recorded fixtures and real issued credentials for live SDK create→rename/edit→archive, version conflict/replay, isolation/read-only/revocation checks; real OAuth regression may reuse existing fixture harness with updated15tool expectation. Remove fixtures in dependency order and prove zero residuals. Audit current live function bodies/ACLs and manifests. Record safe results, operator examples and limits, commit conventionally locally; preserve original Task7/main/push gate. Stop when reviewed published MCP exposes15tools and live writes/denials/cleanup pass.

## Delivery record

Tasks1–3 passed: independent review0Critical/Important, focused132SQL/auditor, fullNode384tests/382pass/2opt-in skips, fullDeno37pass/3fixtureignored, PostgreSQL4races. Migration012 applied once; API/MCPv10ACTIVE; real hosted117token/project +25OAuthPKCEchecks passed;44frozen source inputs/012functionbody/canonicalACL and67catalogobjects verified. Application/activefixtureszero, one expected inactive Authproviderclienttombstone retained through official cleanup. No frontend publication, realHermes/model/Cron/Authconfiguration/main/push changes. Local conventional commit/source-manifest parity close delivery. See [verification](../../verification/agent-platform/mcp-project-management-2026-10-21.md).
