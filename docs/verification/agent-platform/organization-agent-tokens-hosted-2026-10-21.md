# Organization agent tokens: hosted activation proof

Date: 2026-10-21. Dedicated project: `ddodhyhtpgvsqzpipgcq`.

Migration011 applied once; the frozen API and MCP deployments are ACTIVE at version9, with platform JWT verification disabled so the application can validate opaque credentials and retain its existing JWT verifier. The final hosted token proof passed95checks, including a real MCP SDK client. All seven fixture cleanup counts are zero. The real catalog auditor passed67reachable objects, and15function bodies match the frozen migration byte for byte.

## Deployment and private backup boundary

All43backend source/config/auditor files were frozen outside Git before activation. Selected reviewed hashes appear below. Every frozen source hash was rechecked against the worktree before backup/application/deployment and again for this receipt. The only dry-run migration was `202610210011_organization_agent_tokens.sql`. Push used `--skip-vault`, without seed/roles/config/Auth/Cron changes. Only `api` and `mcp` were deployed, from the frozen working directory with the relative import map. No worker, Vercel, Hermes or Git publication was performed by this activation.

Fresh public schema/data backups are outside Git with0600permissions inside a0700directory. Fixture state stores recorded synthetic IDs only; human JWTs, passwords, opaque tokens, PKCE verifier/code and API secrets remain in process memory. Raw request/response bodies and secrets are excluded from this receipt and safe evidence.

| Frozen source                                                    | SHA256                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| `supabase/migrations/202610210011_organization_agent_tokens.sql` | `363074e57116081765ee23e67ea4f07f6e89e7b7a81946c51f5fc3bbfacba601` |
| `supabase/functions/_shared/auth.ts`                             | `ac928bb7a22fa4bb95da4061e8f11882a63ceb677293fca2caef2b9e4c2f5eb3` |
| `supabase/functions/_shared/operations.ts`                       | `36f0ee9c13012f738742d76e9d9eeee68db2d40492e4666868be38882fcbaeb0` |
| `supabase/functions/_shared/organization-tokens.ts`              | `1a963f6b5629b332e0baaea95849e11990ea5aec61b64f5a03898a6be81514fc` |
| `supabase/functions/mcp/index.ts`                                | `aa8ee43b7b70d362ff2511c84237e9690d0c20cbfe58199dc41ecafa87084295` |
| `supabase/functions/api/index.ts`                                | `fe1286a5b3ff2e292f9bd4fa71e5c2b0463219b9f31b2b92c0047ee9586689a6` |
| `supabase/functions/api/openapi.json`                            | `650f49d7cb1580692e873b350756ef313b87fbd73fc9da3822192120815d96f7` |
| `src/domain/contracts.ts`                                        | `b46e972acf755453250651ff32b4272f77c1d555f4f9d0898e3cf0a1e478fa40` |
| `supabase/tests/webhook-api-boundary.mjs`                        | `aaadaa4ba529b66dd2e81dc7a56440ef87841a9ec8732f64bbc0f7cbcbfed453` |

| Backup        | Bytes  | SHA256                                                             |
| ------------- | ------ | ------------------------------------------------------------------ |
| Public data   | 18935  | `4abcb744e4c2eb2d1d32ff20c0b0f18b0c50a42d8c2819b880e6f3ef49187f7a` |
| Public schema | 214315 | `6bae86aa06ee862fb2026b5bacd44c857066b17b7dd6a99b006f2a51dcd7fd45` |

## Final hosted token proof

Window: `2026-10-21T18:06:00.213Z` to `2026-10-21T18:06:58.473Z`. Four disposable Auth users (owner/admin/member/outsider) signed in through the real password endpoint. Two isolated workspaces and a project were created through the human-authenticated API. Service authority was restricted to fixture creation/membership setup/cleanup; domain reads/writes used real human JWTs or opaque organization tokens. The server's temporary expiry adjustment targeted only a recorded synthetic connection.

| Boundary                                              | Observed result                                                                                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Owner/admin issuance and metadata                     | 200; no-store issuance; paged metadata contains no recoverable secret                                                                    |
| Member/outsider management, all four RPCs             | 403                                                                                                                                      |
| Anonymous and opaque JWT management attempts          | 401/403                                                                                                                                  |
| Read token read/write                                 | 200read;403write                                                                                                                         |
| Cross-workspace and nonallowlisted administration     | 403through both Edge REST and direct token RPCs                                                                                          |
| Private credential/connection/context/audit relations | 401/403for anonymous and human                                                                                                           |
| Private verifier/context/admin/issuer helper RPCs     | 403; no public helper authority                                                                                                          |
| Forged context GUC/claims                             | Real SQL authenticated role rejected withPT401                                                                                           |
| Real MCP SDK                                          | Initialize, exact12tool discovery, organization/project/task reads and task creation passed                                              |
| Idempotent creation                                   | Identical replay retained task/event; same receipt after rotation retained task/event                                                    |
| Agent authorship                                      | Comment/context authorUserId null with actual authorAgentId; activity actorUserId null, actorKind organization_token and actual agent ID |
| Claim and CAS                                         | Live claim, blocked renewal, stable lease across rotation; stale version409                                                              |
| Rotation invalidation                                 | Old REST, MCP initialize, tools/list and connected SDK next request401; new credential retains executor and receipt namespace            |
| Expiry invalidation                                   | REST, MCP initialize and discovery401                                                                                                    |
| Revocation invalidation                               | REST, MCP initialize, tools/list, connected SDK next request and direct cached-receipt replay denied401                                  |
| Revoked execution projection                          | Execution inactive while unexpired reservation remains active/blocking                                                                   |
| Human JWT compatibility                               | Existing REST200, tampered JWT401, human-without-OAuth MCP403                                                                            |

Cleanup removed recorded fixture claims/tasks/comments before token connections and workspaces, then fixture rate-principal rows and Auth users. This preserves the existing active-reservation FK while deleting only synthetic fixture data. Counts: `{"audit": 0, "connections": 0, "context": 0, "credentials": 0, "rateLimits": 0, "users": 0, "workspaces": 0}`.

## Real OAuth JWT compatibility proof

A separate disposable user and public OAuth client completed the real Supabase Auth authorization-code flow with S256 PKCE, using the [official OAuth flow contract](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows) and existing consent RPCs. Window: `2026-10-21T18:08:37.090Z` to `2026-10-21T18:08:44.609Z`. All22finalchecks passed. Auth issued the OAuth JWT; no JWT was minted or impersonated by the harness. The resulting verified client_id JWT retained REST workspace discovery and real MCP SDK initialize, exact12tool discovery and list_workspaces. Each of the four organization-token management RPCs rejected the OAuth JWT with403. Revoking the existing integration removed workspace access and denied the connected SDK's next tools/list request.

The service role was used only to create/delete that synthetic Auth user/client. Human consent/setup used its real human JWT; runtime OAuth access used Auth's real OAuth JWT. No Auth configuration, ownership, grants or roles changed. The initial OAuth harness expected200from the existing void revocation RPC; PostgREST correctly returned204. That attempt was cleaned, and the final22checkrun accepts the existing204contract.

Final OAuth cleanup counts: `{"client": 0, "integration": 0, "rates": 0, "user": 0, "workspace": 0}`. Auth admin deletion soft-deleted the public fixture clients. The two already retired synthetic clients from the two OAuth attempts were then recorded by exact name/public type and their recorded creation windows, and removed by those IDs using the existing fixture cleanup DB connection. No privilege or ownership changes were made. Physical remaining clients, authorizations and consents for those IDs are all0. No further hosted mutations followed this cleanup.

## Hosted catalog and configuration

The catalog auditor traversed67reachable application functions/views, preserving sensitive-schema recursion and the existing dynamic-SQL allowlist. All15new/replaced function bodies match the frozen011source. Function ACLs and empty search paths match the design: four management RPCs are authenticated-only; three credential RPCs are anonymous/authenticated; every auxiliary authority/credential/context helper remains private. All four private tables have RLS enabled and SELECT denied to both anonymous and authenticated roles. The private context table was empty after requests.

Fresh remote configuration readback confirmed API schemas `public, graphql_public` and extra search path `public, extensions`; no database overrides existed. This read did not modify configuration. The existing webhook Cron job remains inactive. Migration011 count is1; API/MCP version9 are ACTIVE with `verify_jwt=false`, retaining application authentication.

The hosted GraphQL endpoint reports that `pg_graphql` is not enabled. Introspection and explicit private credential-field requests returned errors with no data. This proves denial in the current hosted configuration; native GraphQL type-visibility introspection is unavailable here. The local enabled-GraphQL API boundary remains a separate test environment. No extension/configuration was enabled for this proof.

## Validation setbacks and limits

The first attempt stopped on a harness assumption that native GraphQL introspection was enabled; cleanup was verified zero. A second attempt encountered a TypeError during SDK initialize; its cause was not established. Subsequent full SDK runs passed without an Edge source change. A later run passed the product checks but its direct workspace cleanup hit the existing `task_claims_workspace_id_agent_id_fkey`; recovery deleted only recorded synthetic data in dependency order and confirmed all residual counts zero. The final95checkrun includes that corrected cleanup and completed successfully. These earlier attempts are retained privately as safe summaries and are excluded from the final PASS denominator.

The safe private receipt includes manifests, backup hashes, deployment logs, final HTTP/SDK checks, function-body/ACL audit and cleanup counts. It contains no live token or production user data. Production-user workflows, real Hermes configuration, webhook/Cron activation, frontend publication and main integration are outside this backend activation.
