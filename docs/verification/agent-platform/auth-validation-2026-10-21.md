# Authentication validation, 2026-10-21

## Problem and correction

Native `minLength` validation blocked submission before React could show its password error, and signup had no persistent password guidance. The login input also incorrectly applied the new-password minimum to existing credentials.

The form now displays the existing requirement (at least10 characters and a number or symbol) beside new-password inputs before submission. Custom validation shows persistent messages beside required name/email/password/confirmation fields, associates help and errors through `aria-describedby`, marks `aria-invalid`, and focuses the first invalid field. Invalid submissions never call Auth. Editing clears the related error; changing modes clears validation and password state. Errors appear on submission so inserting them cannot interrupt the original submit click while a field loses focus.

Login requires a nonempty password without enforcing the creation policy. Recovery checks the existing policy and matching confirmation. Known Supabase codes have safe, actionable messages for weak/reused passwords, rate limits, unconfirmed email and connection failures. Server password errors focus the input after it is enabled again. Unknown responses retain generic safe wording; raw backend messages are never rendered. Inputs retain their values after errors. Backend policies, sessions, callbacks and production Auth configuration are unchanged.

References: [HTML email validation](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/email), [Supabase Auth error codes](https://supabase.com/docs/guides/auth/debugging/error-codes). Installed SDK response-code parsing was checked directly; fixture responses include the API-version header and its CORS exposure, matching the SDK contract.

## Verification and deployment

- Regression-first browser run reproduced missing inline feedback before the fix.
- Seven focused browser cases passed in development and against the exact compiled hosted-config artifact: short signup password, required/malformed fields, password composition/mode changes, existing short login password, safe rate-limit feedback with retained input, server weak-password focus, and recovery confirmation mismatch. All remote Auth responses were intercepted; no accounts or emails were created.
- Independent review exercised8 PT/EN × light/dark × desktop/mobile configurations. It checked signup/recovery help and errors, ARIA/focus, correction/mode changes, and absence of horizontal overflow. Zero Auth/write attempts. External fonts were blocked, so local fallback typography was used for those captures.
- ESLint, TypeScript, formatting and token audit passed. Full Node suite:285 tests,283 passed,0 failed,2 opt-in live SDK tests skipped without private configuration.
- Frozen hosted-config Vite build exited0;137 source inputs recorded, six static files plus Build Output API configuration. Privileged key values were absent. SPA fallback and the existing public origin were preserved.
- Vercel Delta Academy project `task-manager`: production deployment `dpl_3mfguv42wrUrkDo9S7LNQpr6zcHn`, CLI exit0, `READY`, https://task-manager-chi-eight-19.vercel.app.
- Independent public gate passed: all six files returned HTTP200 with exact approved SHA-256 hashes. Invalid mobile signup displayed persistent help, inline error, ARIA and first-invalid focus; reload returned to clean login. Zero Auth/write attempts.

Independent reports and red/green/compiled logs are retained outside git. Public artifact and invalid-form checks use synthetic input with writes blocked. This UI delivery does not establish real signup email delivery, OAuth grant, Hermes execution or the remaining Task7 client gates. Final platform push/main integration remains gated by the approved plan.

To reproduce locally without real accounts:

```sh
npx playwright test --config playwright.auth-validation.config.ts
```

## Mensagem para o time

Corrigi as mensagens de validação no cadastro do Kairos. A regra da senha aparece antes do envio e cada campo mostra o que precisa ser corrigido. A atualização já está publicada no mesmo endereço.
