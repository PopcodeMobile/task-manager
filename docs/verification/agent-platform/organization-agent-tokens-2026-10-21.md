# Organization agent tokens: delivery verification

Date: 2026-10-21. Approved implementation and publication on `feat/agent-platform`, based on `4d820e2`.

## Delivered behavior

Published at [Kairos](https://task-manager-chi-eight-19.vercel.app). Select the organization, then **Ajuda e recursos → Integrações → Tokens de agentes**. Human owners/admins can issue, list, rotate and revoke organization-scoped credentials. Read is the default capability; writing enables task creation and the existing task commands. Expiration defaults to 90 days, with 30/365-day and explicit no-expiration choices.

A secret is shown only at issuance/rotation, cleared on close or observed organization/session/authority changes, and never persisted to browser storage. Each connection keeps its own executor through rotation. Comments/events attribute actions to the agent. Existing human authentication and Claude OAuth remain supported. See the [operator guide](../../organization-agent-tokens.md) and [hosted backend receipt](organization-agent-tokens-hosted-2026-10-21.md).

## Verification evidence

| Check                                         | Result                                                                                                                                                    |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full Node suite                               | 376 tests: 374 passed, 2 existing opt-in fixture skips, 0 failures                                                                                        |
| Lint, TypeScript, formatting and token checks | Passed; token inventory 234 public tokens / 127 source files                                                                                              |
| Focused SQL / catalog auditor                 | 7 SQL and 117 auditor tests passed                                                                                                                        |
| Real PostgreSQL concurrency                   | 4 races passed: execution/revocation in both orders, concurrent identical command and rotation with live claim                                            |
| Deno transport suite                          | 36 passed, 3 existing fixture-dependent ignored, 0 failed; check/lint passed                                                                              |
| Browser UI                                    | 8/8 passed in development, compiled preview and public deployment, using isolated Auth/REST fixtures                                                      |
| Independent security review                   | 0 Critical / 0 Important; SQL/Edge source hashes independently checked                                                                                    |
| Independent compiled UI review                | PT/EN, light/dark, desktop/mobile flows passed; one long-name overflow finding fixed with failing regression and independent recheck                      |
| Real hosted token API/MCP                     | 95 checks passed, including actual SDK discovery, reads, task creation/comment/claim, replay, CAS, rotation, expiration, revocation and permission denial |
| Real hosted OAuth compatibility               | 22 checks passed using Auth-issued OAuth JWT after actual S256 PKCE authorization/code exchange                                                           |
| Hosted catalog/source                         | 67 reachable objects passed; 15 function bodies match frozen migration                                                                                    |
| Disposable fixture cleanup                    | All 7 token and 5 OAuth residual counts zero; retired synthetic OAuth clients physically removed, remaining zero                                          |

Local safe test summaries are outside Git. Browser tests mock cloud responses even when visiting the public URL; they verify the delivered UI and do not impersonate real users or write production data. Real authentication/authorization and domain behavior were verified separately by the hosted SDK/API proofs. Independent source/UI reviews and the execution ledger are kept in the worktree review directory.

## Published source and artifacts

Frontend deployment `dpl_BE66Nt2RnoGwG99jfRVSavgQV3jW` reached READY with build/deploy exit 0. All 145 allowlisted source inputs match the frozen production build. Every static file returned HTTP 200 with the expected SHA256:

| Artifact                      | SHA256                                                             |
| ----------------------------- | ------------------------------------------------------------------ |
| `index.html`                  | `b8177a004e78eaab8bf76cef85abeeeaf587ef60a0290d7d9e2a56a73dcbee0a` |
| `favicon.svg`                 | `2fec8230e51e66742a3e3831dc9861389a1ec65b59af708039d4e9f07f2a4edf` |
| `assets/index-Cq5sgJz-.js`    | `8ac2e9e979c2f96cc1b6b1f0bb4a7c32f336667192e84b23f6eb4de8e9031cfb` |
| `assets/supabase-_Ts6dIFp.js` | `2c0321b4b11c0b9adeb67c235b29f77832bfe22ac4fd252d9078b201d40f7469` |
| `assets/index-DjXkFq3f.css`   | `443ee693fe05f442b568cbf705991d371f83943e4bb28eacd12c4d70875f41d9` |
| `assets/react-ui-QOftg97R.js` | `6a6d12243af9d831bfac897ebfd640b2fef86a98dc5cdb323649f29f6e60502f` |

Backend project `ddodhyhtpgvsqzpipgcq`: migration `202610210011_organization_agent_tokens.sql` applied once, API/MCP version 9 ACTIVE. All 43 frozen backend/config/auditor inputs match. Prior 11 migrations are unchanged. Fresh public schema/data backups were stored privately before activation. No API secret, live credential, password or fixture JWT is recorded in this delivery.

## Limits and stopping condition

Hosted GraphQL is disabled; explicit private-field requests deny access, but enabled-native-GraphQL introspection was unavailable. A prior SDK attempt reported a TypeError of unknown cause; subsequent unchanged-source SDK runs passed. The backend receipt records these limits and synthetic cleanup recovery in detail.

The approved feature is complete when admin issuance, organization-bounded real MCP reads/writes, invalidation and verified cleanup all pass. Those checks passed. The Hermes VPS profile has not been configured with a real token, no model was called, and webhook Cron remains inactive. Original Task7 gates for real receiver/recovery/retention and two real Claude users remain open. The feature receives a local conventional commit only; push/main integration remains gated by that original plan.

## Mensagem pronta para o time

Publiquei a geração de tokens por organização no Kairos. Agora eu consigo conectar o Hermes da VPS sem fazer login pelo navegador na máquina do agente. Só proprietários e administradores podem gerar ou revogar esses tokens, e cada um fica limitado à organização escolhida. Pra criar, selecione a organização e abra Ajuda e recursos, Integrações, Tokens de agentes. O segredo aparece uma vez. A configuração do perfil do Hermes na VPS ainda precisa receber esse valor.
