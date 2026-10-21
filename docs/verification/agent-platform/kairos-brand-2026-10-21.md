# Kairos brand update, 2026-10-21

The public frontend at **https://task-manager-chi-eight-19.vercel.app** now uses **Kairos**. Vercel Delta Academy project `task-manager` remains the deployment target; production deployment `dpl_C1Dn9RUNeNcLQpG9CHAsDtgRqQ97` reached `READY` with CLI exit0.

Page titles, authentication wordmarks, workspace badge/favicon, PT/EN product copy, catalogue examples and the fresh local demo use the new identity. Package manifests change name/description only; dependency versions are unchanged. The wordmark consumes existing typography tokens. Saved workspace content, storage/session keys, event/MIME names, backend/MCP configuration and Auth origins remain unchanged.

## Verification

- ESLint and TypeScript checks exited0.
- Full Node suite:285 tests,283 passed,0 failed,2 skipped because the opt-in live SDK configuration was absent. No real-user/Auth acceptance is claimed.
- Token audit:234 public tokens,120 source files, PASS. Focused token tests:24 passed. The first run caught hardcoded typography in the new wordmark; the final component uses the existing tokens and all guards passed without exemptions.
- Full formatting check and `git diff --check` passed. The favicon parsed as valid SVG/XML.
- Clean isolated hosted-config Vite build exited0. Explicit `--emptyOutDir` removed unreferenced intermediate build files before packaging. Final Build Output API artifact contains only configuration plus six static files, with SPA fallback preserved. Public Supabase configuration was present; actual privileged key values were absent.
- Independent static review found no blocking regression or change to auth/persistence/backend.24 isolated visual samples covered login/signup/home/appearance, PT/EN, light/dark and mobile; no visible Gr8r product copy, horizontal overflow or uncaught JavaScript exception. Fresh demo name/slug were Kairos/kairos; favicon bytes matched source. External fonts were blocked in that local review, so it used the local fallback.
- Root reloaded the actual public site in Chrome and observed title/link/wordmark **Kairos** with the sign-in form. Independent public artifact and UI verification is retained in the scoped review report outside git.

Scope remains the brand update. Existing organizations with user-owned saved names are not renamed. The real Hermes/Claude, retention and scheduling gates in Task7 remain open; final platform branch integration stays gated by that plan.

## Mensagem para o time

Troquei a marca do painel pra Kairos e publiquei a atualização na Vercel. O endereço de acesso continua o mesmo, com o novo nome no login, na aba do navegador e nos ícones.
