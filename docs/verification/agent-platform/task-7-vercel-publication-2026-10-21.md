# Task 7: Vercel frontend publication, 2026-10-21

The React/shadcn frontend is published at **https://task-manager-chi-eight-19.vercel.app** in the **Delta Academy** Vercel team. This closes the public frontend and production Auth/CORS configuration gate. Real Hermes execution and two personal-Claude users remain separate acceptance gates.

## Deployment identity and artifact

- Team: `delta-academy`, `team_HJFOFUMVoBghJAANWymOgcNW`.
- Project: `task-manager`, `prj_D5N0U9o2qd92Tfih91KkWKInuVC2`.
- Deployment: `dpl_CHB8dpZT2VZULqnywd1WcVfa2MEh`, production target, `READY`.
- Frozen source: `379ba02b4cc2a1433eeea0990dbfc209f4319cf5`; restored design is included from `75c475a13b9f41d83f1c25ed5141d1b70f1e488c`.
- Dedicated backend: `ddodhyhtpgvsqzpipgcq`, reviewed009/API/MCP as recorded in [runtime proof](runtime-009-proof.md).

Vercel CLI65.0.0 authenticated through the user's browser device flow. The chat-provided credential was not used or stored. Only the dedicated new project was created; no other Vercel project was modified. The build used the hosted public Supabase URL and publishable key. No service-role, worker, signing or refresh secret was sent to Vercel or included in the static artifact.

An isolated archive of the frozen source produced a Vite build with exit0. Build Output API version3 contains only `config.json` and six static files: HTML, favicon, three JavaScript chunks and CSS. Filesystem routes precede the SPA fallback. `vercel deploy --prebuilt --prod --yes --scope delta-academy` exited0. Deployment does not depend on the main checkout's local environment.

This is a manual prebuilt publication. **Git automatic deployment is not connected**: current main still precedes the platform branch and must not overwrite the published artifact. Final branch integration follows the approved Task7 client gates. For another publication, build the reviewed source with the two public Supabase settings, preserve SPA rewrites, and explicitly target this project/team. Do not deploy unrelated main or copy private runtime environment files.

## Production Auth and API origin

Supabase CLI2.121.0 applied a private sparse configuration to this dedicated project only. Reviewed diff contained exactly two declared changes:

| Setting                         | Before                  | After                                                        |
| ------------------------------- | ----------------------- | ------------------------------------------------------------ |
| `auth.site_url`                 | `http://localhost:3000` | `https://task-manager-chi-eight-19.vercel.app`               |
| `auth.additional_redirect_urls` | empty                   | `https://task-manager-chi-eight-19.vercel.app/auth/callback` |

Push exited0. A subsequent configuration diff reported zero updates and zero local-only properties. Hosted email confirmations remained enabled. A separate diff against the existing OAuth-only configuration also reported zero updates: OAuth server enabled, dynamic registration enabled, authorization path `/oauth/consent` preserved. Consent therefore uses the production Site URL and that path. SMTP, password settings and other undeclared properties were not pushed from local defaults.

Callback links retain validated `returnTo` and recovery parameters. The configured production Site URL supplies the intended same-origin callback host; no wildcard Vercel domains were added. [Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls) and [official Auth redirect validation source](https://github.com/supabase/auth/blob/master/internal/utilities/request.go) informed this configuration. Actual email confirmation/recovery and real OAuth authorization still require their own end-to-end acceptance.

Only Edge setting `API_ALLOWED_ORIGINS` was set to the exact production origin. No other Edge credential was changed and no backend source was redeployed. Public checks against `/functions/v1/api/v1/workspaces` showed:

| Request                            | Result                                              |
| ---------------------------------- | --------------------------------------------------- |
| `OPTIONS`, production Origin       | 204, exact Origin echoed, expected methods/headers  |
| `OPTIONS`, unrelated Origin        | 204, no allow-origin or allow-methods               |
| anonymous `GET`, production Origin | 401, safe `unauthorized` response and expected CORS |

## Independent publication verification

A verifier with separate context compared127 frozen frontend/build inputs: zero byte differences. The six built files and prebuilt static files matched by SHA-256. Fresh anonymous requests to the production alias, without protection bypass, returned the frozen HTML bytes and HTTP200 for all seven routes:

- `/`, `/login`, `/app`, `/app-local`, `/integrations`;
- `/oauth/consent?authorization_id=smoke-read-only`;
- `/auth/callback?returnTo=%2Fapp%3Fview%3Dboard`.

All five assets returned HTTP200, appropriate MIME types and exactly matching SHA-256 bytes. Fresh isolated Chromium contexts verified direct load and full reload for each route:14 renders, zero uncaught page errors, zero failed requests and zero attempted mutations. Login controls were enabled. Consent and callback query parameters were preserved; an invalid callback displayed a safe localized error. Local discovery intentionally normalized `/app-local` to `/app-local/w/w1/home` and reloaded successfully. Root additionally opened the public sign-in screen in Chrome.

The independent reviewer also checked the safe Auth diffs and public API boundary. Detailed session evidence is retained outside git in the scoped publication review; no credential/environment file was read by that verifier.

## Remaining gates and stop condition

Publication is complete when the production alias, artifact identity, SPA reloads, Auth configuration and CORS checks above are approved. It does not establish an authenticated real-user workspace, actual email delivery/recovery, a completed OAuth grant or Hermes model execution.

Continue Task7 with the real main-profile Hermes MCP/OAuth/task route, durable admission and effective retention/recovery horizon, and two actual Claude users demonstrating isolation/revocation. Cron stays disabled until those gates pass. Existing Hermes services and profiles were not changed during this publication. Final push/main integration remains gated by the approved plan.

## Mensagem para o time

Publiquei o painel na Vercel da Delta Academy e configurei o endereço de acesso no Supabase. A tela de login já está disponível em https://task-manager-chi-eight-19.vercel.app. Agora falta validar as conexões reais do Hermes e das contas Claude.
