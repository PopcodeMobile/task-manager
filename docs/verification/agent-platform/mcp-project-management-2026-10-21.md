# MCP project management: delivery verification

Date: 2026-10-21. Baseline `aa38a1d`. User approved creation, editing/renaming and archiving of projects through MCP, including organization write credentials.

## Delivered behavior

The published MCP catalog has 15 tools, adding `create_project`, `update_project` and `archive_project`. Rename uses update_project.name. Creation returns the project ID/version; update/archive require the current expected_version. Existing project fields, including archived for reappearance, keep their domain semantics. Archive hides the project without deleting tasks or cancelling execution reservations.

Existing organization write tokens gain these three operations without reissuance. Read-only tokens cannot write; organization isolation, expiry, revocation, rotation identity and verify-before-replay remain enforced. Granted OAuth writers retain their existing authorization. Project deletion, membership, batch and organization administration are not added to token authority. See [operator examples](../../mcp-projects.md) and [token setup](../../organization-agent-tokens.md).

## Implementation boundary

Additive migration `202610210012_agent_project_operations.sql` only replaces the organization-token execution wrapper with exactly three additional allowlisted commands. Its remaining body, signature, context lifecycle, search_path and inherited ACL are unchanged. All 12 prior migration files are byte-identical to the baseline. Existing domain project validation, CAS/workspace locks, receipts and agent event attribution are reused.

Edge token routing permits the same ten writes; MCP supplies strict project schemas, no-CAS creation and versioned update/archive. Archive is marked destructive/reversible and idempotent. The catalog auditor accepts only the exact reviewed011 seven-write or012 ten-write list, retaining its recursive sensitive-schema and dynamic-SQL checks. API documentation now describes15tools. No frontend source, Vercel, Auth configuration, dependency, real Hermes profile, model or Cron activation was changed.

## Verification

| Evidence                       | Result                                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TDD SQL and SDK                | Missing project tool/token authority reproduced before implementation; new SQL/SDK behavior passed afterward                                                                         |
| Full Node suite                | 384 tests: 382 passed, 2 existing opt-in fixture skips, 0 failed                                                                                                                     |
| Focused SQL / boundary auditor | 132/132 passed, including old-token upgrade, exact wrapper/ACL comparison, lifecycle/CAS/replay/attribution and forbidden authority                                                  |
| Focused real OAuth/PGlite SDK  | 4/4 passed, including create→rename→archive with returned versions1/2/3                                                                                                              |
| Full Deno transport suite      | 37 passed, 3 existing fixture-dependent ignored, 0 failed; task check passed                                                                                                         |
| Lint / TypeScript / formatting | Passed                                                                                                                                                                               |
| Real PostgreSQL concurrency    | Four existing transaction races passed with012 loaded; local catalog60objects passed                                                                                                 |
| Independent review             | No Critical/Important; independently132SQL/auditor and10Deno tests passed; additional OAuth fixture delta reviewed                                                                   |
| Hosted real token API/MCP      | 117 checks passed; exact15-tool discovery, project lifecycle, task in new project, CAS, replay, attribution, isolation/read/administrative denials and invalidated credential replay |
| Hosted real OAuth PKCE         | 25 checks passed, including the three new project tools using an Auth-issued OAuth JWT                                                                                               |
| Hosted catalog / frozen inputs | 67 reachable objects passed; new function body matches frozen012; all44backend/config/auditor inputs match                                                                           |

The first full Node run exposed an obsolete12-tool count assertion in an existing context fixture. It was replaced by an exact15-name inventory and extended with real SQL-backed OAuth project commands; its focused4/4 and subsequent full384-test runs passed. The 37-test Deno suite and local OAuth fixtures use isolated backend/Auth responses where described; the hosted proofs separately use real issued credentials and real SDK requests.

## Publication, cleanup and limits

Detailed [hosted activation receipt](mcp-project-management-hosted-2026-10-21.md).

Dedicated Supabase project `ddodhyhtpgvsqzpipgcq`: migration012 applied once after private fresh public schema/data backups and a dry-run containing only012. API/MCP version10 are ACTIVE with application authentication retained. Reviewed frozen sources were used for deployment; source/backup/function manifests and safe HTTP/SDK results are stored privately outside Git. Migration SHA256: `abc46ba25a948013a1334b5f17bdac0cbc5b4a9a6245c8a3dbc31be3e3930ab2`.

All seven application/token fixture residual counts are zero. OAuth user, workspace, integration, rates and active client counts are zero. Official Auth admin deletion retains one inactive synthetic OAuth client tombstone with deleted_at set; no direct Auth database deletion or privilege change was performed. This is distinct from active/application cleanup. Hosted native GraphQL remains disabled; current private ACL/catalog checks do not claim enabled-GraphQL introspection.

This feature is complete when published discovery, real token/OAuth project writes and denials, verified cleanup and independent review pass. Those checks passed. The original Task7 gates for real Hermes receiver/recovery/retention and two actual Claude users remain open; push/main integration remains gated. Only a local conventional feature commit is created for this delivery.

## Mensagem pronta para o time

Liberei a gestão de projetos pelo MCP do Kairos. Agora eu consigo pedir pro agente criar um projeto, renomear, editar os dados e arquivar. Os tokens de escrita que já existem continuam valendo, sem gerar outro segredo. Testei as operações com token de organização e OAuth, incluindo bloqueio de outra organização e conflito de versão. Pra carregar a lista nova de ferramentas, reconecte o MCP no cliente.
