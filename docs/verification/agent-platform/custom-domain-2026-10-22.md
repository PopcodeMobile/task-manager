# Kairos custom domain: DNS handoff

Date: 2026-10-22. Baseline `a7a5959`. User selected the suggested Delta Academy hostname `tarefas.deltaacademy.com.br`.

## Completed preparation

Vercel CLI65.0.0 returned domain_added, attached to existing task-manager project in Delta Academy. Domain ownership is current-scope; project attachment verified. No project move, domain purchase, nameserver transfer, deployment rebuild or existing domain removal occurred.

DNS authority is GoDaddy: ns75.domaincontrol.com and ns76.domaincontrol.com. Both authoritative queries currently return no tarefas CNAME. Vercel reports invalid_configuration and recommends:

| Type  | Name    | Value                               | TTL              |
| ----- | ------- | ----------------------------------- | ---------------- |
| CNAME | tarefas | 78db16dfef7d6da9.vercel-dns-016.com | Provider default |

Only this unused subdomain needs a record. Do not alter nameservers, root-domain records, MX, Resend, Hermes or other services. GoDaddy opened in Chrome but requires user login; the tab was retained for handoff. The user can create the record directly or authenticate so the authorized DNS setup can continue.

## Prepared, not applied

The private sparse Auth configuration changes exactly site_url and additional_redirect_urls. Planned Site URL is https://tarefas.deltaacademy.com.br. Existing Vercel callback remains allowed; the exact new root and /auth/callback are added without wildcard domains. The existing API_ALLOWED_ORIGINS secret metadata value is a SHA256 digest, which matched the saved current Vercel origin. Planned CORS adds the custom origin while preserving that existing origin.

Fresh private before-state retains Resend SMTP active as send@deltaacademy.com.br, email confirmations enabled and OAuth enabled. No Auth or CORS change has been applied: primary Auth URLs must not point to an unresolved hostname. Current production remains https://task-manager-chi-eight-19.vercel.app. Original main/Hermes/Task7 gates remain unchanged.

## Remaining completion checks

After the CNAME exists: verify authoritative/public DNS, Vercel configuration and HTTPS; compare the six current public artifact hashes and SPA routes at the custom host; apply reviewed sparse Auth/callback and CORS changes; verify before/after settings, allowed/denied CORS and controlled auth/consent links. Existing SMTP/private credentials are not part of the Git change. The task remains pending user-controlled DNS access, not completed activation.

References: [Vercel domain setup](https://vercel.com/docs/domains/working-with-domains/add-a-domain), [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls). Provider/plan/before-state safe evidence is outside Git in the private activation directory; independent review is kept in the worktree review directory.

## Mensagem pronta para o time

Adicionei tarefas.deltaacademy.com.br ao projeto do Kairos na Vercel. Falta criar o CNAME na GoDaddy pra liberar o endereço. Preparei os ajustes de login e recuperação pro novo domínio, mantendo o endereço atual até conferir DNS e HTTPS.
