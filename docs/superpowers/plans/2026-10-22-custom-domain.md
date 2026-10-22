# Kairos custom domain

User requested moving the deployment to a Delta Academy subdomain and suggested tarefas.deltaacademy.com.br. Adopt that exact hostname. Existing project/team/deployment remain; no rename, transfer, domain purchase or redeployment is required.

Acceptance: domain attached to the dedicated task-manager Vercel project in Delta Academy, DNS resolves correctly, valid HTTPS serves the reviewed panel, Supabase Auth Site URL/callbacks and API CORS accept the new origin, controlled login/consent/recovery links use the correct host. Preserve old production URL during transition and existing SMTP/OAuth/password/session settings. Do not alter unrelated DNS records, nameservers, MX/email setup, Hermes/Cron or main integration gates.

1. Inspect existing domain/DNS and Vercel project; add domain and obtain provider-specific DNS target. Add only the unused tarefas CNAME in GoDaddy if authorized access exists. If user login/DNS edit is required, provide the exact ready-to-apply record and continue independent preparation.
2. After DNS and valid HTTPS prove access, take fresh private Auth snapshot. Apply sparse site_url and explicit callback allowlist update preserving existing entries. Add the new origin to the existing API_ALLOWED_ORIGINS value without dropping old authorized origins. No local-config bulk push.
3. Verify domain/HTTPS/static bytes/SPA/Auth/CORS and, where credentials/provider test capacity allow, isolated callback/OAuth/recovery proof. Independent review, safe receipt, local conventional docs/config commit. Stop only when cutover checks pass or missing user-controlled DNS access is explicitly recorded; do not switch primary Auth URL to an unreachable host.

## Current handoff

Activated on 2026-10-22. DNS, Vercel verification, HTTPS, static parity, sparse Auth update and CORS are proven; see the [activation receipt](../../verification/agent-platform/custom-domain-2026-10-22.md). Pending only a controlled real email link and Claude OAuth consent on the new host.
