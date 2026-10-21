# MCP project management: hosted activation proof

Date: 2026-10-21. Dedicated project: `ddodhyhtpgvsqzpipgcq`.

Migration012 is applied once. Frozen API and MCP are ACTIVE at version10. A real MCP SDK discovered15tools and completed the new project lifecycle. Final hosted checks:117organization-token/project checks and25realOAuthchecks passed. Application/user/active-grant fixture cleanup counts are zero. Auth retains one inactive synthetic public OAuth client tombstone, separately documented below.

## Frozen activation and backups

The independent review approved the exact012/Edge delta before activation. A new private activation directory was created outside Git with0700permissions; files, frozen source, ignored signing fixture and backups use0600. No011evidence was overwritten. All44frozen backend/config/auditor sources still match the worktree. All12prior migrations remain byte-identical to baseline `aa38a1db06edeff2c05611b9af639ea4eb5fb44b`.

Fresh public schema/data backups preceded the dry-run. It listed only `202610210012_agent_project_operations.sql`. Application used `--skip-vault` with no seeds, roles, config/Auth or Cron changes. Only frozen `api` and `mcp` were deployed from their copied working directory using the relative import map. Both report ACTIVE/version10 and `verify_jwt=false`, retaining application verification of human/OAuth JWTs and opaque organization tokens. No worker, frontend, Hermes/model or Git publication was performed by this activation.

| Frozen source                                                   | SHA256                                                             |
| --------------------------------------------------------------- | ------------------------------------------------------------------ |
| `supabase/migrations/202610210012_agent_project_operations.sql` | `abc46ba25a948013a1334b5f17bdac0cbc5b4a9a6245c8a3dbc31be3e3930ab2` |
| `supabase/functions/_shared/organization-tokens.ts`             | `59ea90af23b54fc8f93b90f97789efff08426f52536f0abaa85ec1020dd93755` |
| `supabase/functions/mcp/tools.ts`                               | `6a7b8dc629ab28dab1e38f0e7c36c5b910b8372147a6f363aceeb1c503aeb080` |
| `supabase/functions/api/openapi.json`                           | `c6985d499c9a50652e4cc5a5a433b18a67de79cd098b722a790b4086eebee2c2` |
| `supabase/functions/_shared/auth.ts`                            | `ac928bb7a22fa4bb95da4061e8f11882a63ceb677293fca2caef2b9e4c2f5eb3` |
| `supabase/functions/_shared/operations.ts`                      | `36f0ee9c13012f738742d76e9d9eeee68db2d40492e4666868be38882fcbaeb0` |
| `supabase/functions/api/index.ts`                               | `fe1286a5b3ff2e292f9bd4fa71e5c2b0463219b9f31b2b92c0047ee9586689a6` |
| `supabase/functions/mcp/index.ts`                               | `aa8ee43b7b70d362ff2511c84237e9690d0c20cbfe58199dc41ecafa87084295` |
| `src/domain/contracts.ts`                                       | `b46e972acf755453250651ff32b4272f77c1d555f4f9d0898e3cf0a1e478fa40` |
| `supabase/tests/webhook-api-boundary.mjs`                       | `2cec4b4e4f3305cdcbe9cdc9bb47bf351aba5406e2e62f36c05ea526549916b6` |

| Private backup | Bytes  | SHA256                                                             |
| -------------- | ------ | ------------------------------------------------------------------ |
| Public schema  | 243512 | `ce29233fdd83141dcb3e7a6cba88190a61428f8047fa3b0a6bb36140b12e6543` |
| Public data    | 30750  | `96204fef2da0605359e3bc8b5a9e196efde1500b72589bd1befb70a4fbf30a1d` |

## Organization-token proof

Window: `2026-10-21T19:21:31.268Z` to `2026-10-21T19:22:12.327Z`. Four synthetic users signed in through the real Auth password endpoint. Owner/admin human JWTs issued organization tokens; members/outsiders were denied. Two recorded synthetic workspaces and a project scoped every operation. Service authority was confined to fixture setup/cleanup; domain traffic used the human JWTs or opaque organization credentials. Secrets remained in process memory, never in safe evidence, fixture-state files, URLs or this document.

| Check                              | Observed result                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Real SDK initialize and tools/list | 15tools; original12plus create_project/update_project/archive_project                                               |
| Project creation                   | Returned real ID/version1and full validated project fields                                                          |
| Project edit/rename                | Name/description/status/date/order/attributes persisted; version2                                                   |
| Project archive                    | Archived true, version3; readback retained actual project                                                           |
| Project idempotency                | Create/edit/archive retries retained original event and entity; rotated credential retained original create receipt |
| Project CAS                        | Stale expected version409                                                                                           |
| Task in new project                | Real create_task returned the SDK-created project ID                                                                |
| Accurate project actor             | Three lifecycle events with null human actor and the actual organization agent/principal                            |
| Read token                         | All three project writes403                                                                                         |
| Cross-organization                 | All three project writes403                                                                                         |
| Remaining authority                | delete_project, restore_project, project membership, batch, team/workspace administration denied403                 |
| Existing token contracts           | Task reads/create/comment, accurate agent comment/context, live claims and blocked renewal retained                 |
| Rotation                           | Previous REST/MCP initialize/discovery/connected SDK request401; replacement preserved identity, claim and receipts |
| Expiry                             | REST/MCP initialize/discovery401                                                                                    |
| Revocation                         | Fresh and connected SDK denied; cached create/update/archive project receipts each401                               |
| Reservation retention              | Revoked execution inactive while the unexpired reservation continued blocking                                       |
| Direct database/API boundary       | Private tables/helpers denied; forged GUC/claims denied; capability and workspace checks enforced in direct RPCs    |

The final117checks completed with no failed attempt. Cleanup followed claims/tasks/comments, token connections/credentials/audit, workspaces, rate-principal rows and Auth users, scoped only to recorded synthetic IDs/containers. Counts: `{"audit": 0, "connections": 0, "context": 0, "credentials": 0, "rateLimits": 0, "users": 0, "workspaces": 0}`.

## Real OAuth compatibility

Window: `2026-10-21T19:22:34.052Z` to `2026-10-21T19:22:42.937Z`. A separate synthetic human and public client completed the real authorization-code/S256-PKCE exchange following the [official Supabase OAuth flow](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows). Auth issued the JWT containing its real client_id; the harness did not mint or impersonate a user JWT. Existing consent preparation/approval/activation established a write grant for only the synthetic workspace.

All25checks passed, including existing REST workspace discovery, real SDK initialize/tools15/list_workspaces and create_project/update_project/archive_project. The OAuth JWT was denied all four organization-token management RPCs with403. Human revocation removed its workspace visibility and denied the connected SDK's next request.

Cleanup used the official Auth admin delete endpoints, without a direct Auth DELETE, ownership/grant/role changes or privilege escalation. Counts: `{"activeClient": 0, "integration": 0, "rates": 0, "user": 0, "workspace": 0}`. The provider soft-deleted the recorded public client: one inactive tombstone remains, `deleted_at` is set, and active client count is0. This provider-retained synthetic metadata is an explicit residual; physical client count is not claimed zero.

## Live catalog and limits

The current catalog auditor passed67reachable objects, retaining private helper traversal, sensitive-schema denial and the fixed dynamic-SQL allowlist. The live replacement executor body matches frozen012byte-for-byte; anonymous/authenticated EXECUTE grants and empty search path remain correct. All four token storage/context/audit relations retain RLS and deny SELECT to both API roles. Runtime context cleanup was empty after requests. The three project writes use the existing domain CAS/receipt/lock/attribution implementation, with no new administration tier.

Fresh remote configuration readback retained API schemas `public, graphql_public` and extra search path `public, extensions`, with no database overrides. Cron remains inactive. Native GraphQL remains disabled at this hosted project: introspection and credential-field probes return errors without data. No extension or configuration was enabled, so native type-visibility introspection is not claimed here.

The existing update_project archived boolean remains available through that existing contract, as explicitly approved; no separate restore_project or delete_project tool/authority was added. Existing valid organization write credentials gain the three project operations without regeneration. Local realSQLverification separately proved pre012issued credentials upgrade and exact preservation of function ACL/security/body outside the allowlist suffix.

The private receipts contain safe checks, source and backup hashes, deployment versions, function/ACL audit, fixture IDs and cleanup counts. They contain no live credential or production-user record. User-facing configuration for real Hermes profiles and main/push integration remain outside this activation.
