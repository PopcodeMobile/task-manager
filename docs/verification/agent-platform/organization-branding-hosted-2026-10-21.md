# Organization branding: hosted activation proof

Date: 2026-10-21. Dedicated project: `ddodhyhtpgvsqzpipgcq`.

Result: migration 010 applied once; frozen API and MCP deployments are ACTIVE at version 8; all 39 final HTTP checks passed. The current API-surface auditor passed against 54 reachable hosted functions/views. Fixture cleanup counts are all zero.

## Artifact and backup boundary

The reviewed backend freeze in private metadata was the deployment source. A fresh dry-run listed only `202610210010_organization_branding.sql`; the push ran with `--skip-vault`, without seeds, roles or config/Auth/Cron changes. Only `api` and `mcp` were deployed, from the frozen working directory with its import map. No worker or Vercel deployment was performed by this activation.

| Frozen artifact                                              | SHA256                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `supabase/migrations/202610210010_organization_branding.sql` | `281e6fb6860b73be1e96e41231af120568f161ab63ca9bf47d2194d456e93b69` |
| `supabase/functions/_shared/validation.ts`                   | `8b6ffeab946c3434333bf89c4fdc39073ab12a9120e1c4520ec097658bf00558` |
| `supabase/functions/api/openapi.json`                        | `3a967b526b889c8d95aeadcde150e6e2bee57f6b4e1f7b994daa469899a16205` |

Before application, a read-only preflight confirmed bucket absent and migration 010 absent. CLI schema and data backups were written outside Git with 0600 permissions; their directory is 0700. No dump contents or credentials are included here.

| Backup        | Bytes  | SHA256                                                             |
| ------------- | ------ | ------------------------------------------------------------------ |
| Public schema | 209583 | `99e043893d8b271a975e0a984bc040c9017d711e6f82781ae895984fe08c24fa` |
| Public data   | 17635  | `0daa10749ab56b0713bbfe8060e82030536d989ae7865fb16642c068c69986a8` |

## Final HTTP proof

Window: `2026-10-21T15:27:32.773Z` to `2026-10-21T15:28:03.480Z`. Three synthetic Auth users were admin-created and signed in through the real password endpoint. Owner/member/outsider operations used their returned human JWTs. The service role was restricted to synthetic fixture setup and cleanup. The workspace was created through the human-authenticated Edge API.

The final fixture is a real 550-byte WebP generated through Chromium canvas. Upload and authenticated download bytes were identical: SHA256 `55e93db8a97cc19506d4899cb706cbe077fc5d4c50d7afab38fd77d3ff4d20b4`. The authenticated download was then decoded with Chromium `createImageBitmap`: 16×16 pixels, 550 bytes, same SHA256; private evidence is `download-decode.safe.json`. The earlier 25-byte fixture run is retained privately as HTTP-boundary-only evidence and is excluded from this final image claim.

| Check                                                          | HTTP result                  |
| -------------------------------------------------------------- | ---------------------------- |
| fixture owner admin-created                                    | 200                          |
| fixture owner real password JWT                                | 200                          |
| fixture member admin-created                                   | 200                          |
| fixture member real password JWT                               | 200                          |
| fixture outsider admin-created                                 | 200                          |
| fixture outsider real password JWT                             | 200                          |
| owner creates isolated workspace through API                   | 201                          |
| fixture member membership setup                                | 201                          |
| owner WebP upload                                              | 200                          |
| owner authenticated WebP download                              | 200                          |
| member authenticated WebP download                             | 200                          |
| member Storage upload denied                                   | 400                          |
| outsider Storage upload denied                                 | 400                          |
| anonymous Storage upload denied                                | 400                          |
| outsider authenticated download denied                         | 400                          |
| anonymous authenticated download denied                        | 400                          |
| private object public URL denied                               | 400                          |
| SVG MIME upload denied                                         | 400                          |
| upload above 2MiB denied                                       | 400                          |
| owner versioned logo save                                      | 200                          |
| owner logo idempotent replay                                   | 200                          |
| stale logo CAS denied                                          | 409 / `version_conflict`     |
| changed logo receipt payload denied                            | 409 / `idempotency_conflict` |
| member workspace discovery includes logo                       | 200                          |
| owner workspace list includes logo                             | 200                          |
| member logo mutation denied                                    | 403 / `forbidden`            |
| outsider workspace read denied                                 | 403 / `forbidden`            |
| anonymous API read denied                                      | 401 / `unauthorized`         |
| external URL API logo denied                                   | 422 / `validation_error`     |
| local image data API logo denied                               | 422 / `validation_error`     |
| foreign workspace prefix API logo denied                       | 422 / `validation_error`     |
| missing own object API logo denied                             | 422 / `validation_error`     |
| owner removes logo pointer                                     | 200                          |
| removal readback                                               | 200                          |
| fixture member revocation                                      | 204                          |
| revoked member fresh download denied                           | 400                          |
| revoked member workspace read denied                           | 403 / `forbidden`            |
| owner image remains private and readable after pointer removal | 200                          |
| MCP unauthenticated guard                                      | 401 / `unauthorized`         |

The successful save returned version 2; exact replay returned the original event and data. Removing the pointer returned version 3 and discovery readback contained null. Rejected stale and altered receipts returned 409; unauthorized mutations returned 403; invalid paths/local image data/missing objects returned 422. The valid owner/member downloads matched the image bytes. The bucket rejected SVG MIME and payloads above 2097152 bytes. Fresh member download after membership revocation was denied.

## Hosted catalog and configuration

The current auditor (`supabase/tests/webhook-api-boundary.mjs`, SHA256 `1fd55df9936ff48536bf78588a44119dde33cf187d15977fe3d98cddb5ba6975`) traversed 54 reachable hosted functions/views, including the new branding and existing context predecessors. It preserved sensitive-schema bridge denial and the existing dynamic-SQL allowlist.

Fresh `supabase config pull` read remote configuration into an isolated private directory; it did not write remote configuration. It confirmed API schemas `public, graphql_public` and extra search path `public, extensions`. An arbitrary schema request returned 406/PGRST106. No database overrides for these API settings were present.

Hosted state: migration 010 count 1; private bucket; size limit 2097152; allowed MIME types `image/png`, `image/jpeg`, `image/webp`; nine organization-logo policies. The existing webhook scheduler remained inactive.

| Helper                               | Security mode | Anonymous execute | Authenticated execute | Search path |
| ------------------------------------ | ------------- | ----------------- | --------------------- | ----------- |
| `organization_logo_access`           | DEFINER       | false             | true                  | empty       |
| `read_operation_before_branding`     | DEFINER       | false             | false                 | empty       |
| `operation_validate_before_branding` | INVOKER       | false             | false                 | empty       |

## Cleanup and limits

The cleanup block deleted only recorded synthetic object paths, the recorded fixture workspace, rate-limit rows for the three recorded synthetic users, and those users. Readback confirmed 0 fixture users, 0 fixture workspaces, 0 fixture objects and 0 fixture rate-limit rows. Storage deletion returned 200, workspace deletion 204 and user deletion 200.

Private receipts/scripts/backups reside under `~/.config/task-manager/branding-activation-2026-10-21/` with restricted permissions. Secrets and JWTs remain outside Git. No real-user records, OAuth clients/grants, webhooks, models or scheduler jobs were created or activated.

Limits: authenticated OAuth/MCP branding flows were not exercised in this hosted run; MCP unauthenticated denial was checked. SQL tests separately cover OAuth and agent write rejection. Pointer removal preserves prior private objects by design; retention changes are outside this activation.
